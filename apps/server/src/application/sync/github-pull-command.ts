import { githubStatusCardsBefore, incomingGitHubStatus } from "@storymapper/server/services/github-status";
import { remoteWorkItemSyncStateSchema } from "@storymapper/contracts";
import { stripGitHubIssueFooter } from "@storymapper/core";
import { randomUUID } from "node:crypto";
import { changeOperationSchema, syncItemResultSchema, DomainError, remoteWorkItemIdentity, canonicalWorkItemId, type Card, type ChangeOperation, type IncomingGitHubCommandResponse, type SyncItemResult, type RemoteWorkItemLink, type SyncWorkItemsRequest, type UpdateCardRequest } from "@storymapper/contracts";
import { importReleaseSource } from "@storymapper/db";
import { createWorkItemProvider, type RemoteWorkItem } from "@storymapper/github";
import { githubIncomingCommand, revalidateGitHubPreparation, syncRunOperation, type GitHubPreparation } from "@storymapper/server/application/sync/github-command";
import { asDomainError } from "@storymapper/server/application/errors";
import { resolveProviderAuth } from "@storymapper/server/services/credentials";
import { changedFieldsForRemote, conflictFields, remoteBaseline, syncBaseline, managedAnnotationMappings, remoteMilestoneLocator, remoteReleaseMetadata, iterationValue, milestoneTargetMetadata, releaseSyncBaseline, withLiveRelease, type SyncFields } from "@storymapper/server/services/sync-merge";

export interface IncomingReleaseState { releases: Map<string, string>; metadata: Map<string, string>; }
export interface IncomingItem { card: Card; link: RemoteWorkItemLink; remote: RemoteWorkItem | undefined; fields?: SyncFields; openConflict?: boolean; }

export async function prepareIncomingItems(context: GitHubPreparation, input: Omit<SyncWorkItemsRequest, "confirm">): Promise<IncomingItem[]> {
  const { deps, connection, storyMapId } = context;
  const links = deps.repository.listRemoteWorkItemLinksForStoryMap(storyMapId).filter((link) => link.connectionId === connection.id && link.cardId && (!input.cardIds || input.cardIds.includes(link.cardId)) && (input.releaseId === undefined || deps.repository.getCardDetails(link.cardId)?.releaseId === input.releaseId));
  const items: IncomingItem[] = [];
  let catalog: string | undefined;
  let index = 0;
  try {
    const provider = createWorkItemProvider(connection.provider);
    const auth = await resolveProviderAuth(connection);
    revalidateGitHubPreparation(context);
    for (const link of links) {
      const card = deps.repository.getCardDetails(link.cardId!)!;
      const read = await provider.getRemoteItem(auth.connection, auth.auth, link.remoteId);
      const remote = read.status === "found" ? read.item : undefined;
      revalidateGitHubPreparation(context);
      if (remote && (remote.remoteId !== link.remoteId || canonicalWorkItemId(connection.provider, remoteWorkItemIdentity(connection, remote)) !== deps.repository.listExternalRefsForStoryMap(storyMapId).find((ref) => ref.id === link.externalRefId)?.externalId)) throw new DomainError("conflict", "Provider returned a different Issue identity.");
      if (JSON.stringify(deps.repository.getCardDetails(card.id)) !== JSON.stringify(card) || JSON.stringify(deps.repository.listRemoteWorkItemLinksForStoryMap(storyMapId).find((row) => row.id === link.id)) !== JSON.stringify(link)) throw new DomainError("conflict", "Card or remote link changed during preparation.");
      if (remote) {
        const observed = JSON.stringify(incomingGitHubStatus(connection, remote).statusCatalog);
        if (catalog !== undefined && catalog !== observed) throw new DomainError("conflict", "GitHub status catalog changed during preparation. Prepare a new sync.");
        catalog = observed;
      }
      const fields = remote ? changedFieldsForRemote(deps.repository, connection, card, link, remote) : undefined;
      for (const field of Object.values(fields ?? {})) if (field.local && field.remote && JSON.stringify(field.localValue) === JSON.stringify(field.remoteValue)) { field.local = false; field.remote = false; }
      items.push({ card, link, remote, openConflict: deps.repository.listOpenSyncConflicts(storyMapId).some((entry) => entry.cardId === card.id && entry.connectionId === connection.id && entry.remoteId === link.remoteId && entry.field !== "status"), ...(fields ? { fields } : {}) });
      index++;
    }
  } catch (error) { throw incomingFailure(error, links, Math.min(index, links.length - 1)); }
  return items;
}

export async function pullGitHubCommand(context: GitHubPreparation, input: Omit<SyncWorkItemsRequest, "confirm">): Promise<IncomingGitHubCommandResponse> {
  const sources = context.deps.repository.listRemoteWorkItemLinksForStoryMap(context.storyMapId).filter((link) => link.connectionId === context.connection.id && link.cardId && (!input.cardIds || input.cardIds.includes(link.cardId)) && (input.releaseId === undefined || context.deps.repository.getCardDetails(link.cardId)?.releaseId === input.releaseId));
  const linked = new Set(sources.map((row) => row.cardId));
  const ineligible: SyncItemResult[] = [...new Set(input.cardIds)].filter((cardId) => !linked.has(cardId)).map((cardId) => ({ status: "failed", cardId, code: "not_found", message: "Requested Card is not eligible for this connection.", details: { phase: "prepare" } }));
  try {
    const items = await prepareIncomingItems(context, input);
    return githubIncomingCommand(context, incomingOperations(context, items, false, undefined, ineligible), "Pull GitHub local updates; outgoing changes require human confirmation.", input.apply, (outcome) => [...incomingResults(items, outcome), ...ineligible]);
  } catch (error) {
    const domain = incomingFailure(error, sources);
    const reported = syncItemResultSchema.array().parse(domain.details!.items);
    throw new DomainError(domain.code, domain.message, { ...domain.details, items: [...reported, ...ineligible.filter((row) => !reported.some((item) => item.cardId === row.cardId))] });
  }
}

export function incomingFailure(error: unknown, sources: Array<{ cardId?: string | undefined; remoteId?: string | undefined; url?: string | undefined }>, index = 0): DomainError {
  const domain = asDomainError(error);
  const reported = syncItemResultSchema.array().safeParse(domain.details?.items);
  return new DomainError(domain.code, domain.message, { ...domain.details, items: reported.success ? reported.data : sources.map((row, rowIndex) => rowIndex === index ? { status: "failed", cardId: row.cardId, remoteId: row.remoteId, url: row.url, code: domain.code, message: domain.message, details: { phase: "prepare" } } : { status: "not_attempted", cardId: row.cardId, remoteId: row.remoteId, url: row.url, message: rowIndex < index ? "Prepared item was not applied because preparation failed." : "An earlier preparation failed." }) });
}

export function incomingOperations(context: GitHubPreparation, items: IncomingItem[], resolvingField = false, pending?: IncomingReleaseState, extraResults: SyncItemResult[] = []): ChangeOperation[] {
  try { return buildIncomingOperations(context, items, resolvingField, pending, extraResults); }
  catch (error) { throw incomingFailure(error, [...items.map(({ card, link }) => ({ cardId: card.id, remoteId: link.remoteId, url: link.url })), ...extraResults]); }
}

function buildIncomingOperations(context: GitHubPreparation, items: IncomingItem[], resolvingField: boolean, pending: IncomingReleaseState | undefined, extraResults: SyncItemResult[]): ChangeOperation[] {
  context.preparedStatusCatalogs.clear();
  const { connection, deps, storyMapId } = context;
  const operations: ChangeOperation[] = [];
  const run = syncRunOperation(context, "sync");
  if ([...incomingResults(items, "proposed"), ...extraResults].some((item) => item.status === "failed")) { run.after.status = "failed"; run.after.summary = "GitHub sync contains failed items."; }
  operations.push(run);
  const releases = pending?.releases ?? new Map(deps.repository.listExternalRefsForStoryMap(storyMapId).filter((ref) => ref.system === connection.provider && ref.entityType === "release").map((ref) => [ref.externalId, ref.entityId]));
  seedIterationReleases(context, releases);
  const updatedReleases = pending?.metadata ?? new Map<string, string>();
  const add = (value: object): void => { operations.push(changeOperationSchema.parse({ operationId: randomUUID(), entityId: randomUUID(), ...value, ...("entity" in value && value.entity === "remoteWorkItemLink" && "after" in value ? { after: remoteWorkItemSyncStateSchema.omit({ id: true }).parse(value.after) } : {}) })); };
  for (const { card, link, remote, fields } of items) {
    const { id, ...baseline } = link;
    if (!remote || !fields) { add({ op: "set", entity: "remoteWorkItemLink", before: link, connectionBefore: context.connection, entityId: id, baseVersion: card.version, after: { ...withLiveRelease(deps.repository, baseline), syncState: "stale" } }); continue; }
    const open = deps.repository.listOpenSyncConflicts(storyMapId).filter((entry) => entry.externalRefId === link.externalRefId && entry.field !== "status");
    if (!resolvingField) for (const conflict of open) { fields[conflict.field].local = true; fields[conflict.field].remote = false; }
    const patch: UpdateCardRequest = {};
    if (fields.title.remote && !fields.title.local) patch.title = fields.title.remoteValue;
    if (fields.description.remote && !fields.description.local) patch.description = stripGitHubIssueFooter(remote.body);
    const status = incomingGitHubStatus(connection, remote);
    if (fields.milestone.remote && !fields.milestone.local) {
      patch.releaseId = connection.releaseSource === "iteration" ? incomingIterationRelease(context, remote, releases, add) : incomingRelease(context, remote, releases, updatedReleases, resolvingField, add);
    }
    if (!resolvingField && remote.assignee && remote.assignee !== card.assignee) patch.assignee = remote.assignee;
    const changed = Object.fromEntries(Object.entries(patch).filter(([key, value]) => card[key as keyof Card] !== value));
    if (Object.keys(changed).length) add({ op: "update", entity: "card", entityId: card.id, baseVersion: card.version, after: changed });
    incomingAnnotations(context, card, fields, add);
    const conflicts = resolvingField ? [] : conflictFields(fields);
    for (const field of conflicts.filter((field) => !open.some((entry) => entry.field === field))) add({ op: "create", entity: "syncConflict", after: { externalRefId: link.externalRefId, syncRunId: run.entityId, connectionId: connection.id, cardId: card.id, remoteId: link.remoteId, field, localValue: fields[field].localValue ?? null, remoteValue: fields[field].remoteValue ?? null, status: "open" } });
    const projected = syncBaseline(deps.repository, connection, { ...card, ...changed }, remote);
    if (fields.milestone.remote && !fields.milestone.local) {
      projected.acknowledgedLocal.milestone = connection.releaseSource === "milestone" ? fields.milestone.remoteValue?.assignment ?? null : null;
      const target = milestoneTargetMetadata(deps.repository, connection, storyMapId, remote);
      if (target?.localChanged && !resolvingField) projected.acknowledgedLocal.releaseMetadata = target.metadata;
      else if (connection.releaseSource === "milestone" || !projected.acknowledgedLocal.releaseMetadata) projected.acknowledgedLocal.releaseMetadata = remoteReleaseMetadata(connection, remote);
    }
    if (fields.labels.remote && !fields.labels.local) projected.acknowledgedLocal.annotationLabels = fields.labels.remoteValue;
    const { id: _id, ...updatedBaseline } = remoteBaseline(withLiveRelease(deps.repository, link), remote, fields, projected);
    add({ op: "set", entity: "remoteWorkItemLink", before: link, connectionBefore: context.connection, entityId: id, baseVersion: card.version, statusCatalog: status.statusCatalog, statusCardsBefore: githubStatusCardsBefore(deps.repository, connection, status, context.preparedStatusCatalogs, card), after: { ...updatedBaseline, statusEvidence: status.statusEvidence, parentOverrideLocal: link.parentOverrideLocal, ...(resolvingField ? { remoteParentNumber: link.remoteParentNumber } : {}), syncState: conflicts.length || !resolvingField && open.length ? "conflict" : Object.values(fields).some((field) => field.local) ? "unsynced" : "synced" } });
  }
  return operations;
}

export function incomingResults(items: IncomingItem[], outcome: "applied" | "proposed"): SyncItemResult[] {
  return items.map(({ card, link, remote, fields, openConflict }) => {
    if (!remote || !fields) return { status: "failed", cardId: card.id, remoteId: link.remoteId, url: link.url, code: "not_found", message: "Remote Issue is unavailable; its identity is retained.", details: { phase: "prepare" } };
    const conflict = openConflict || conflictFields(fields).length > 0;
    const changed = Object.values(fields).some((field) => field.remote && !field.local) || Boolean(remote.assignee && remote.assignee !== card.assignee);
    return { status: conflict ? "conflict" : changed ? outcome === "applied" ? "succeeded" : "proposed" : "unchanged", cardId: card.id, remoteId: link.remoteId, url: remote.url };
  });
}

function incomingRelease(context: GitHubPreparation, remote: RemoteWorkItem, releases: Map<string, string>, updatedReleases: Map<string, string>, resolvingField: boolean, add: (value: object) => void): string | null {
  const { connection, storyMapId } = context;
  const locator = remoteMilestoneLocator(connection, remote);
  const target = milestoneTargetMetadata(context.deps.repository, connection, storyMapId, remote);
  if (locator && !releases.has(locator)) {
    const releaseId = randomUUID();
    const refId = randomUUID();
    add({ op: "create", entity: "release", entityId: releaseId, after: { storyMapId, name: remote.milestone!, goal: remoteReleaseMetadata(connection, remote)!.goal!, released: remoteReleaseMetadata(connection, remote)!.released!, releaseDate: remote.milestoneDueOn?.slice(0, 10) ?? null } });
    add({ op: "create", entity: "githubExternalRef", entityId: refId, after: { entityType: "release", entityId: releaseId, provider: connection.provider, externalId: locator, scopeId: storyMapId } });
    add({ op: "set", entity: "remoteWorkItemLink", entityId: undefined, before: null, connectionBefore: connection, after: { externalRefId: refId, connectionId: connection.id, labels: [], baseline: releaseSyncBaseline(releaseId, remoteReleaseMetadata(connection, remote)!, locator), syncState: "synced", parentOverrideLocal: false } });
    releases.set(locator, releaseId);
  }
  const evidence = JSON.stringify(remoteReleaseMetadata(connection, remote));
  if (locator && updatedReleases.has(locator) && updatedReleases.get(locator) !== evidence) throw new DomainError("conflict", "Connections observed different metadata for the same canonical Milestone.");
  if (locator && !updatedReleases.has(locator)) {
    const existing = context.deps.repository.getRelease(releases.get(locator)!);
    const metadata = remoteReleaseMetadata(connection, remote)!;
    const after = { name: metadata.name, goal: metadata.goal!, released: metadata.released!, releaseDate: metadata.releaseDate };
    if (existing && (resolvingField || !target?.localChanged) && Object.entries(after).some(([field, value]) => existing[field as keyof typeof existing] !== value)) add({ op: "update", entity: "release", entityId: existing.id, baseVersion: existing.version, after });
    const refs = context.deps.repository.listExternalRefsForStoryMap(storyMapId);
    const binding = context.deps.repository.listRemoteWorkItemLinksForStoryMap(storyMapId).find((row) => row.releaseId === existing?.id && refs.some((ref) => ref.id === row.externalRefId && ref.system === connection.provider && ref.externalId === locator));
    if (existing && binding && (resolvingField || !target?.localChanged)) {
      const owner = context.deps.repository.getConnectorConnection(binding.connectionId);
      if (!owner) throw new DomainError("conflict", "Bound Milestone connection is unavailable.");
      add({ op: "set", entity: "remoteWorkItemLink", before: binding, connectionBefore: owner, entityId: binding.id, baseVersion: existing.version, after: { ...binding, baseline: releaseSyncBaseline(existing.id, metadata, locator), parentOverrideLocal: binding.parentOverrideLocal } });
    }
    updatedReleases.set(locator, evidence);
  }
  return locator ? releases.get(locator)! : null;
}

function incomingAnnotations(context: GitHubPreparation, card: Card, fields: SyncFields, add: (value: object) => void): void {
  const { deps, connection, storyMapId } = context;
  const annotations = managedAnnotationMappings(deps.repository, connection, storyMapId);
  if (fields.labels.remote && !fields.labels.local) {
    const assigned = deps.repository.listCardAnnotationsForStoryMap(storyMapId).filter((entry) => entry.cardId === card.id);
    for (const annotation of annotations) {
      const before = assigned.some((entry) => entry.annotationId === annotation.id);
      const after = fields.labels.remoteValue.includes(annotation.name);
      if (before !== after) add({ op: after ? "set" : "unset", entity: "cardAnnotation", after: { cardId: card.id, annotationId: annotation.id } });
    }
  }
}

function iterationReleaseKey(context: GitHubPreparation, remote: Pick<RemoteWorkItem, "iteration">): string {
  return `iteration:${context.connection.id}:${iterationValue(remote.iteration)}`;
}

function seedIterationReleases(context: GitHubPreparation, releases: Map<string, string>): void {
  for (const link of context.deps.repository.listRemoteWorkItemLinksForStoryMap(context.storyMapId)) {
    const local = link.baseline?.acknowledgedLocal;
    if (link.connectionId !== context.connection.id || !local?.iteration || !local.releaseId || !context.deps.repository.getRelease(local.releaseId)) continue;
    const key = iterationReleaseKey(context, { iteration: local.iteration });
    const existing = releases.get(key);
    if (existing && existing !== local.releaseId) throw new DomainError("conflict", "Iteration tuple has ambiguous Release bindings.");
    releases.set(key, local.releaseId);
  }
}

function incomingIterationRelease(context: GitHubPreparation, remote: RemoteWorkItem, releases: Map<string, string>, add: (value: object) => void): string | null {
  const source = importReleaseSource(context.connection, remote);
  if (!source) return null;
  const key = iterationReleaseKey(context, remote);
  if (!releases.has(key)) {
    const id = randomUUID();
    add({ op: "create", entity: "release", entityId: id, after: { storyMapId: context.storyMapId, name: source.name, startDate: source.startDate ?? null, releaseDate: source.releaseDate ?? null } });
    releases.set(key, id);
  }
  return releases.get(key)!;
}
