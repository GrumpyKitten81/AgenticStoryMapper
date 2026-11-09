import { githubStatusCardsBefore, incomingGitHubStatus } from "@storymapper/server/services/github-status";
import { stripGitHubIssueFooter } from "@storymapper/core";
import { randomUUID } from "node:crypto";
import { canonicalWorkItemId, remoteWorkItemIdentity, parseWorkItemLocator, workItemScopeMatches, changeOperationSchema, DomainError, type Annotation, type CardLevel, type CardOperationPayload, type ChangeOperation, type IncomingGitHubCommandResponse, type SyncItemResult, type ImportWorkItemsRequest } from "@storymapper/contracts";
import { managedAnnotationDefinitions, normalizeRemoteWorkItemTitle } from "@storymapper/core";
import { detectImportLevel } from "@storymapper/db";
import { createWorkItemProvider, type RemoteWorkItem } from "@storymapper/github";
import type { GitHubPreparation } from "@storymapper/server/application/sync/github-command";
import { githubIncomingCommand, revalidateGitHubPreparation, syncRunOperation } from "@storymapper/server/application/sync/github-command";
import { asDomainError } from "@storymapper/server/application/errors";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";
import { importSyncBaseline } from "@storymapper/server/services/sync-merge";
import { hashText, localStatusForRemote } from "@storymapper/server/services/sync-values";

export async function importGitHubCommand(context: GitHubPreparation, input: ImportWorkItemsRequest): Promise<IncomingGitHubCommandResponse> {
  const provider = createWorkItemProvider(context.connection.provider);
  const auth = await resolveProviderAuth(context.connection);
  revalidateGitHubPreparation(context);
  const items = await provider.listRemoteItems(auth.connection, auth.auth, input.query);
  let operations: ChangeOperation[];
  try {
    revalidateGitHubPreparation(context);
    operations = importOperations(context, items);
  } catch (error) {
    const domain = asDomainError(error);
    throw new DomainError(domain.code, domain.message, { ...domain.details, items: items.map((item) => ({ status: "failed", remoteId: item.remoteId, url: item.url, code: domain.code, message: domain.message, details: { phase: "prepare" } })) });
  }
  const refs = operations.filter((operation) => operation.entity === "githubExternalRef" && operation.after.entityType === "card");
  return githubIncomingCommand(context, operations, "Import GitHub work items.", input.apply, (outcome) => {
    const proposed = new Map(refs.flatMap((operation) => operation.entity === "githubExternalRef" ? [[operation.after.externalId, operation] as const] : []));
    const linked = new Map(context.deps.repository.listExternalRefsForStoryMap(context.storyMapId).filter((ref) => ref.system === context.connection.provider).map((ref) => [ref.externalId, ref]));
    const seen = new Set<string>();
    return items.map((item): SyncItemResult => {
      const identity = remoteWorkItemIdentity(context.connection, item);
      const url = canonicalWorkItemId(context.connection.provider, identity);
      const created = proposed.get(url);
      const reference = linked.get(url);
      const duplicate = seen.has(url);
      seen.add(url);
      return { status: !created || duplicate ? "already_linked" : outcome === "applied" ? "succeeded" : "proposed", ...(reference?.entityType === "card" ? { cardId: reference.entityId } : {}), remoteId: item.remoteId, url: identity.url };
    });
  });
}

export function importOperations(context: GitHubPreparation, items: RemoteWorkItem[]): ChangeOperation[] {
  context.preparedStatusCatalogs.clear();
  const { deps, connection, storyMapId } = context;
  const snapshot = deps.repository.getStoryMapSnapshot(storyMapId)!;
  const operations: ChangeOperation[] = [];
  const add = (value: object): string => { const entityId = randomUUID(); operations.push(changeOperationSchema.parse({ operationId: randomUUID(), entityId, ...value })); return entityId; };
  const known = new Set(snapshot.externalRefs.filter((ref) => ref.system === context.connection.provider).map((ref) => ref.externalId));
  const identities = new Map(snapshot.externalRefs.map((ref) => [ref.id, parseWorkItemLocator(ref.system, ref.externalId)]));
  const parents = new Map(snapshot.remoteWorkItemLinks.filter((link) => identities.get(link.externalRefId) && workItemScopeMatches(identities.get(link.externalRefId)!, connection) && link.cardId && link.remoteNumber).map((link) => [`${identities.get(link.externalRefId)!.repo}#${link.remoteNumber}`, { id: link.cardId!, level: deps.repository.getCardDetails(link.cardId!)!.level }]));
  const hierarchy = new Map(snapshot.cards.map((card) => [`${card.parentId ?? ""}:${card.level}:${card.title}`, card.id]));
  const annotations = managedAnnotationDefinitions(connection, snapshot.annotations);
  const ensureCard = (level: CardLevel, title: string, parentId?: string): string => {
    const key = `${parentId ?? ""}:${level}:${title}`;
    const existing = hierarchy.get(key);
    if (existing) return existing;
    const id = add({ op: "create", entity: "card", after: { storyMapId, level, title, ...(parentId ? { parentId } : {}) } });
    hierarchy.set(key, id);
    return id;
  };
  const activity = () => ensureCard("activity", "Imported backlog");
  const step = () => ensureCard("step", "Imported work items", activity());
  const order = { activity: 0, step: 1, story: 2, note: 3 };
  for (const item of items) remoteWorkItemIdentity(connection, item);
  const pending = items.filter((item) => {
    const url = canonicalWorkItemId(connection.provider, remoteWorkItemIdentity(connection, item));
    if (known.has(url)) return false;
    known.add(url);
    return true;
  }).map((item) => ({ item, level: detectImportLevel(connection, item) })).sort((a, b) => order[a.level] - order[b.level]);
  for (const { item, level } of pending) {
    const identity = remoteWorkItemIdentity(connection, item);
    const remoteParent = item.parentNumber ? parents.get(`${identity.repo}#${item.parentNumber}`) : undefined;
    const parentId = level === "activity" ? undefined : level === "step" ? remoteParent?.level === "activity" ? remoteParent.id : activity() : remoteParent?.level === "step" ? remoteParent.id : remoteParent?.level === "activity" ? ensureCard("step", "General", remoteParent.id) : step();
    const title = normalizeRemoteWorkItemTitle(item.title);
    const imported = singleIssueOperations(context, item, { storyMapId, level, title, description: stripGitHubIssueFooter(item.body), status: localStatusForRemote(connection, item.state, item.labels, "todo"), ...(parentId ? { parentId } : {}), ...(item.assignee ? { assignee: item.assignee } : {}) }, annotations);
    operations.push(...imported.operations);
    const cardId = imported.cardId;
    hierarchy.set(`${parentId ?? ""}:${level}:${title}`, cardId);
    parents.set(`${identity.repo}#${identity.number}`, { id: cardId, level });
  }
  operations.push(syncRunOperation(context, "import"));
  return operations;
}

export function singleIssueOperations(context: GitHubPreparation, item: RemoteWorkItem, card: CardOperationPayload, managedAnnotations: readonly Annotation[]): { cardId: string; operations: ChangeOperation[] } {
  const { connection, storyMapId } = context;
  const status = incomingGitHubStatus(connection, item);
  const matches = connection.issueTypeMapping.filter((mapping) => mapping.issueType === item.issueType);
  card = { ...card, status: status.status, cardType: card.level !== "note" && matches.length === 1 ? matches[0]!.cardType : null };
  const cardId = randomUUID(), externalRefId = randomUUID();
  const annotations = managedAnnotations.filter((entry) => item.labels.includes(entry.name));
  const baseline = importSyncBaseline(connection, item, card.status ?? "todo", annotations.map((entry) => entry.name));
  baseline.acknowledgedLocal.titleHash = hashText(card.title);
  baseline.acknowledgedLocal.bodyHash = hashText(stripGitHubIssueFooter(card.description ?? ""));
  baseline.acknowledgedLocal.releaseId = card.releaseId ?? null;
  baseline.observedRemote.titleHash = hashText(normalizeRemoteWorkItemTitle(item.title, card.title));
  const operations: ChangeOperation[] = [
    changeOperationSchema.parse({ operationId: randomUUID(), entityId: cardId, op: "create", entity: "card", after: card }),
    changeOperationSchema.parse({ operationId: randomUUID(), entityId: externalRefId, op: "create", entity: "githubExternalRef", after: { entityType: "card", entityId: cardId, provider: connection.provider, externalId: canonicalWorkItemId(connection.provider, remoteWorkItemIdentity(connection, item)), scopeId: storyMapId } })
  ];
  if (card.level !== "note") operations.push(changeOperationSchema.parse({ operationId: randomUUID(), op: "set", entity: "remoteWorkItemLink", before: null, connectionBefore: connection, statusCatalog: status.statusCatalog, statusCardsBefore: githubStatusCardsBefore(context.deps.repository, connection, status, context.preparedStatusCatalogs), after: { statusEvidence: status.statusEvidence, externalRefId, connectionId: connection.id, titleHash: hashText(card.title), bodyHash: baseline.acknowledgedLocal.bodyHash, remoteState: item.state, issueType: item.issueType, labels: item.labels, milestone: item.milestone, remoteParentNumber: item.parentNumber, baseline, syncState: "synced", parentOverrideLocal: false } }));
  for (const annotation of annotations) operations.push(changeOperationSchema.parse({ operationId: randomUUID(), entityId: randomUUID(), op: "set", entity: "cardAnnotation", after: { cardId, annotationId: annotation.id } }));
  return { cardId, operations };
}
