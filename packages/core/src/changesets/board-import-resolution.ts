import { stripGitHubIssueFooter } from "@storymapper/core/publishing/github-footer";
import { cardSchema, connectorConnectionSchema, remoteWorkItemLinkSchema, type Card, type ChangeOperation, type ConnectorConnection, type GitHubBoardIssue, type GitHubBoardProposalRequest } from "@storymapper/contracts";
import { ownValue, ownString } from "@storymapper/core/changesets/supply-values";
import { createCard, createMap, moveCard } from "@storymapper/core/changesets/entity-resolution";
import { resolveDeletion } from "@storymapper/core/changesets/card-command-resolution";
import { resolveGithubLink } from "@storymapper/core/changesets/link-resolution";
import { validateMapFingerprints } from "@storymapper/core/changesets/copy-resolution";
import { bumpVersion, cardOwner, mapOwner, projectOwner, readDependency, refuse, type ResolutionContext } from "@storymapper/core/changesets/resolution-context";

export function importBoard(context: ResolutionContext): void {
  const operation = context.operation as Extract<ChangeOperation, { entity: "githubBoardImport" }>;
  const { input, expected, preview } = operation.after;
  projectOwner(context, input.projectId);
  validateMapFingerprints(context, expected);
  if (input.storyMapId && !expected[input.storyMapId]) refuse(context, "Sync proposal source scope is missing.");
  if (input.cleanup && JSON.stringify(context.state.storyMaps.filter((map) => map.projectId === input.projectId).map((map) => map.id).sort()) !== JSON.stringify(Object.keys(expected).sort())) refuse(context, "Project Story Maps changed after the cleanup proposal.", "conflict");
  if (JSON.stringify(preview.connectors) !== JSON.stringify(connectorPreviews(context, input))) refuse(context, "GitHub connectors changed after the proposal; create a new proposal.", "conflict");
  for (const issue of input.issues) normalizedTitle(context, issue);
  if (input.cleanup) for (const id of Object.keys(expected)) resolveDeletion({ ...context, operation: { operationId: operation.operationId, op: "delete", entity: "storyMap", entityId: id, after: {} } });
  if (!input.storyMapId) createMap({ ...context, operation: { operationId: operation.operationId, op: "create", entity: "storyMap", after: { projectId: input.projectId, name: input.storyMapName, description: `Imported from ${input.boardUrl}` } } });
  const mapId = input.storyMapId ?? ownString(context.supply.ids, operation.operationId);
  mapOwner(context, mapId!);
  const existing = existingIssues(context, mapId!);
  assertDistinctTargets(context, input, existing);
  for (const id of input.removeCardIds) {
    const card = context.state.cards.find((row) => row.id === id);
    if (!card || card.storyMapId !== mapId) refuse(context, "Removal Card changed after proposal.", "conflict");
    resolveDeletion({ ...context, operation: { operationId: operation.operationId, op: "delete", entity: "card", entityId: id, after: { strategy: "unassign" } } });
  }
  const newIssues = input.issues.filter((issue) => !existing.has(issueKey(issue)));
  const parking = newIssues.length ? parkingCards(context, mapId!) : undefined;
  const connections = boardConnections(context, input);
  const ordered = [...input.issues].sort((a, b) => levelOrder(a) - levelOrder(b) || a.repository.toLowerCase().localeCompare(b.repository.toLowerCase()) || a.number - b.number);
  for (const issue of ordered) upsertCard(context, mapId!, issue, existing, parking);
  for (const issue of ordered) {
    const card = existing.get(issueKey(issue))!;
    if (parking && newIssues.includes(issue) && card.level !== "activity") {
      const parent = issue.parentRepository && issue.parentNumber ? existing.get(`${issue.parentRepository.toLowerCase()}#${issue.parentNumber}`) : undefined;
      const parentId = card.level === "step" ? parent?.level === "activity" ? parent.id : parking.activity : parent?.level === "step" ? parent.id : parking.step;
      const position = context.state.cards.filter((row) => row.storyMapId === mapId && row.parentId === parentId).length;
      moveCard({ ...context, operation: { operationId: operation.operationId, op: "move", entity: "card", entityId: card.id, after: { parentId, position } } });
    }
    upsertLinks(context, card.id, connections.get(issue.repository.toLowerCase())!, issue);
  }
}

function issueKey(issue: Pick<GitHubBoardIssue, "repository" | "number">): string { return `${issue.repository.toLowerCase()}#${issue.number}`; }
function levelOrder(issue: GitHubBoardIssue): number { return issue.issueType?.toLowerCase() === "epic" ? 0 : issue.issueType?.toLowerCase() === "feature" ? 1 : 2; }
function normalizedTitle(context: ResolutionContext, issue: GitHubBoardIssue): string {
  const result = cardSchema.shape.title.safeParse(issue.title.replace(/^[A-Z][A-Z0-9]*-\d+:\s*/, ""));
  if (!result.success) refuse(context, "GitHub issue title is empty after normalization.");
  return result.data;
}

function suppliedId(context: ResolutionContext, key: string): string {
  const id = ownString(ownValue(context.supply.boardIds, context.operation.operationId), key);
  if (!id || Object.values(context.state).some((value) => Array.isArray(value) && value.some((row: { id: string }) => row.id === id))) refuse(context, `Prepared board identity ${key} is absent or already persisted.`);
  return id;
}

function preparedContext(context: ResolutionContext, id: string): ResolutionContext {
  return { ...context, supply: { ...context.supply, ids: Object.assign(Object.create(null), context.supply.ids, { [context.operation.operationId]: id }), creationOrigin: "inference" } };
}

function connectorPreviews(context: ResolutionContext, input: GitHubBoardProposalRequest) {
  return repositoryNames(input).map((name) => {
    const existing = matchingConnection(context, name);
    return { repository: name, existingId: existing?.id ?? null,
      before: existing ? { projectId: existing.projectId, provider: existing.provider, owner: existing.owner, repository: existing.repository, readOnly: existing.readOnly } : null,
      after: { readOnly: true as const } };
  });
}

function repositoryNames(input: GitHubBoardProposalRequest): string[] { return [...new Set(input.issues.map((issue) => issue.repository.toLowerCase()))].sort(); }
function matchingConnection(context: ResolutionContext, name: string): ConnectorConnection | undefined {
  const matches = context.state.connections.filter((row) => row.projectId === context.state.projectId && row.provider === "github" && `${row.owner}/${row.repository}`.toLowerCase() === name);
  if (matches.length > 1) refuse(context, "Multiple GitHub connectors refer to the same repository.", "conflict");
  if (matches[0]) readDependency(context, "connection", matches[0].id);
  return matches[0];
}

function boardConnections(context: ResolutionContext, input: GitHubBoardProposalRequest): Map<string, string> {
  return new Map(repositoryNames(input).map((name) => {
    const existing = matchingConnection(context, name);
    if (existing?.statusSource?.kind === "project") refuse(context, "Board import lacks authoritative selected Project status evidence. Use GitHub sync.");
    if (existing) { if (!existing.readOnly) { existing.readOnly = true; existing.updatedAt = context.supply.createdAt; } return [name, existing.id]; }
    const [owner, repository] = name.split("/");
    const row = connectorConnectionSchema.parse({ id: suppliedId(context, `connection:${name}`), projectId: input.projectId, provider: "github", statusSource: { kind: "repository" }, statusCatalogs: [{ source: { kind: "repository" }, options: [{ id: "open", name: "Open", position: 0 }, { id: "closed", name: "Closed", position: 1 }] }], name, authMode: "token", owner, repository, readOnly: true,
      statusMapping: [], createdAt: context.supply.createdAt, updatedAt: context.supply.createdAt });
    context.state.connections.push(row);
    return [name, row.id];
  }));
}

function existingIssues(context: ResolutionContext, mapId: string): Map<string, Card> {
  const cards = new Map<string, Card>();
  for (const link of context.state.githubLinks) {
    if (!link.cardId || !link.issueNumber) continue;
    const card = context.state.cards.find((row) => row.id === link.cardId && row.storyMapId === mapId);
    if (!card) continue;
    cardOwner(context, card.id);
    readDependency(context, "githubExternalRef", link.id);
    const key = issueKey({ repository: link.repo, number: link.issueNumber });
    if (cards.has(key)) refuse(context, "Multiple Cards refer to the same GitHub issue.", "conflict");
    cards.set(key, card);
  }
  return cards;
}

function assertDistinctTargets(context: ResolutionContext, input: GitHubBoardProposalRequest, existing: Map<string, Card>): void {
  const targets = new Set<string>();
  for (const issue of input.issues) {
    const card = existing.get(issueKey(issue));
    if (!card) continue;
    if (input.removeCardIds.includes(card.id)) refuse(context, "An imported issue cannot also be removed.");
    if (targets.has(card.id)) refuse(context, "One Card refers to multiple incoming GitHub issues.", "conflict");
    targets.add(card.id);
  }
}

function addCard(context: ResolutionContext, mapId: string, identity: string, level: Card["level"], parentId: string | null, title: string): Card {
  const id = suppliedId(context, identity);
  createCard({ ...preparedContext(context, id), operation: { operationId: context.operation.operationId, op: "create", entity: "card", after: { storyMapId: mapId, level, parentId, title } } });
  return context.state.cards.find((row) => row.id === id)!;
}

function parkingCards(context: ResolutionContext, mapId: string): { activity: string; step: string } {
  const cards = context.state.cards.filter((row) => row.storyMapId === mapId);
  const activity = cards.find((row) => row.level === "activity" && !row.parentId && row.title === "Parking lot") ?? addCard(context, mapId, "parking:activity", "activity", null, "Parking lot");
  const step = cards.find((row) => row.level === "step" && row.parentId === activity.id && row.title === "Parking lot") ?? addCard(context, mapId, "parking:step", "step", activity.id, "Parking lot");
  cardOwner(context, activity.id); cardOwner(context, step.id);
  return { activity: activity.id, step: step.id };
}

function upsertCard(context: ResolutionContext, mapId: string, issue: GitHubBoardIssue, existing: Map<string, Card>, parking: { activity: string; step: string } | undefined): void {
  const key = issueKey(issue);
  const values = boardImportValues(issue);
  let card = existing.get(key);
  if (card) {
    if (["title", "description", "status", "assignee"].some((field) => (card![field as keyof typeof values] ?? null) !== values[field as keyof typeof values])) {
      Object.assign(card, { title: values.title, description: values.description, status: values.status, updatedAt: context.supply.createdAt });
      if (values.assignee === null) delete card.assignee; else card.assignee = values.assignee;
      bumpVersion(context, card);
    }
    return;
  }
  const level = levelOrder(issue) === 0 ? "activity" : levelOrder(issue) === 1 ? "step" : "story";
  const connection = matchingConnection(context, issue.repository.toLowerCase());
  const matches = connection?.issueTypeMapping.filter((mapping) => mapping.issueType === issue.issueType) ?? [];
  const cardType = matches.length === 1 ? matches[0]!.cardType : null;
  const id = suppliedId(context, `card:${key}`);
  createCard({ ...preparedContext(context, id), operation: { operationId: context.operation.operationId, op: "create", entity: "card", after: { ...values, cardType, assignee: issue.assignee ?? undefined, storyMapId: mapId, level, parentId: level === "activity" ? null : level === "step" ? parking!.activity : parking!.step } } });
  existing.set(key, context.state.cards.find((row) => row.id === id)!);
}

export function boardImportValues(issue: GitHubBoardIssue) {
  return { title: cardSchema.shape.title.parse(issue.title.replace(/^[A-Z][A-Z0-9]*-\d+:\s*/, "")), description: stripGitHubIssueFooter(issue.body), status: issue.state === "closed" ? "Closed" : "Open", assignee: issue.assignee };
}

function upsertLinks(context: ResolutionContext, cardId: string, connectionId: string, issue: GitHubBoardIssue): void {
  const key = issueKey(issue);
  const previous = context.state.githubLinks.find((row) => row.cardId === cardId && row.repo.toLowerCase() === issue.repository.toLowerCase() && row.issueNumber === issue.number);
  const card = context.state.cards.find((row) => row.id === cardId)!;
  const after = { entityType: "card" as const, entityId: cardId, externalId: issue.url, scopeId: card.storyMapId };
  const refId = previous?.id ?? suppliedId(context, `github:${key}`);
  if (!previous) resolveGithubLink({ ...preparedContext(context, refId), operation: { operationId: context.operation.operationId, op: "create", entity: "githubExternalRef", after } });
  const hashes = ownValue(ownValue(context.supply.boardHashes, context.operation.operationId), key);
  if (!hashes || !/^[a-f0-9]{64}$/.test(hashes.titleHash) || !/^[a-f0-9]{64}$/.test(hashes.bodyHash)) refuse(context, `Prepared issue hashes ${key} are missing or invalid.`);
  const remote = context.state.remoteWorkItemLinks.find((row) => row.cardId === cardId && row.connectionId === connectionId);
  if (remote) readDependency(context, "remoteWorkItemLink", remote.id);
  const row = remoteWorkItemLinkSchema.parse({ ...remote, id: remote?.id ?? suppliedId(context, `remote:${key}`), connectionId, externalRefId: refId, provider: "github", cardId, remoteId: String(issue.number), remoteNumber: issue.number,
    url: issue.url, statusEvidence: { source: { kind: "repository" }, issueState: issue.state, membership: "present", optionId: issue.state, name: issue.state === "closed" ? "Closed" : "Open" }, issueType: remote?.issueType, managedLabels: remote?.managedLabels ?? [], ...hashes, remoteState: issue.state, labels: issue.labels, milestone: issue.milestone, remoteParentNumber: issue.parentNumber, syncState: "synced", lastSyncedAt: context.supply.createdAt });
  if (remote) Object.assign(remote, row); else context.state.remoteWorkItemLinks.push(row);
}
