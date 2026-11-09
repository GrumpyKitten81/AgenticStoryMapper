import { parseWorkItemLocator, isWorkItemProvider, workItemScopeMatches, githubStatusSourceKey } from "@storymapper/contracts";
import { projectRemoteWorkItemLink } from "@storymapper/core/changesets/github-identity";
import { cardSchema, releaseSchema, storyMapSchema, connectorConnectionSchema, remoteWorkItemLinkSchema, syncConflictSchema, type SyncConflict } from "@storymapper/contracts";
import { allocatedId, assertBaseline, cardOwner, readDependency, mapOwner, projectOwner, referenceId, refuse, type ResolutionContext } from "@storymapper/core/changesets/resolution-context";
import { syncResolutionAgrees } from "@storymapper/core/changesets/sync-resolution-agreement";
import { visibleCards } from "@storymapper/core/story-map/visibility";
import { mergeStatusCatalog, resolveGitHubStatus } from "@storymapper/core/story-map/github-status";
import { bumpVersion } from "@storymapper/core/changesets/resolution-context";

export function resolveGitHubSync(context: ResolutionContext): void {
  const { operation, state } = context;
  if ((operation.entity === "remoteWorkItemLink" || operation.entity === "syncRun") && operation.connectionBefore) {
    const current = state.connections.find((row) => row.id === operation.connectionBefore!.id);
    if (current) readDependency(context, "connection", current.id);
    if (!current || JSON.stringify(connectorConnectionSchema.parse(current)) !== JSON.stringify(operation.connectionBefore) && (!context.previousWrites.has(`connection:${current.id}`) || JSON.stringify(connectorConnectionSchema.omit({ statusCatalogs: true }).parse(current)) !== JSON.stringify(connectorConnectionSchema.omit({ statusCatalogs: true }).parse(operation.connectionBefore)))) refuse(context, "GitHub connection changed after preparation.", "conflict");
  }
  if (operation.entity === "remoteWorkItemLink" && operation.ticketPlacementBefore) {
    const before = operation.ticketPlacementBefore;
    const map = state.storyMaps.find((row) => row.id === before.storyMap.id), parent = before.parent && visibleCards(state.cards).find((row) => row.id === before.parent!.id), release = before.release && state.releases.find((row) => row.id === before.release!.id);
    if (!map || before.parent && !parent || before.release && !release) refuse(context, "Reviewed ticket placement is unavailable.", "conflict");
    const current = { storyMap: storyMapSchema.parse(map), parent: parent ? cardSchema.parse(parent) : null, release: release ? releaseSchema.parse(release) : null };
    if (JSON.stringify(current) !== JSON.stringify(before)) refuse(context, "Reviewed ticket placement changed. Look up the Issue again.", "conflict");
  }
  if (operation.entity === "remoteWorkItemLink") return resolveRemoteLink(context);
  if (operation.entity === "syncRun") return resolveSyncRun(context);
  return resolveSyncConflictOperation(context);
}

function resolveRemoteLink(context: ResolutionContext): void {
  const { state, supply } = context;
  const operation = context.operation as Extract<ResolutionContext["operation"], { entity: "remoteWorkItemLink" }>;
  const after = structuredClone(operation.after);
  const connection = state.connections.find((row) => row.id === after.connectionId);
  const externalRefId = state.externalRefs.some((ref) => ref.id === after.externalRefId) ? after.externalRefId : context.aliases.get(after.externalRefId)?.id;
  const ref = state.externalRefs.find((row) => row.id === externalRefId && isWorkItemProvider(row.system));
  const locator = ref && parseWorkItemLocator(ref.system, ref.externalId);
  if (!connection || !ref || !locator || ref.entityType === "persona") refuse(context, "Remote link canonical reference or connection is unknown.");
  projectOwner(context, connection.projectId);
  const owner = ref.entityType === "card" ? state.cards.find((row) => row.id === ref.entityId) : state.releases.find((row) => row.id === ref.entityId);
  if (!owner || state.storyMaps.find((map) => map.id === owner.storyMapId)?.projectId !== connection.projectId || !workItemScopeMatches(locator, connection)) refuse(context, "Remote sync scope and connection disagree.");
  assertBaseline(context, owner.version, owner.id);
  const acknowledged = after.baseline?.acknowledgedLocal;
  if (acknowledged?.releaseId) {
    acknowledged.releaseId = referenceId(context, "release", acknowledged.releaseId);
    if (!state.releases.some((row) => row.id === acknowledged.releaseId && row.storyMapId === owner.storyMapId)) refuse(context, "Sync baseline Release belongs to another Story Map.");
  }
  if (ref.entityType === "card" ? locator.resource !== "issues" || "level" in owner && owner.level === "note" : locator.resource !== "milestone") refuse(context, "Outbound sync requires a Card Issue or Release Milestone.");
  const existing = state.remoteWorkItemLinks.find((row) => row.externalRefId === ref.id);
  if (existing && existing.connectionId !== connection.id) refuse(context, "GitHub identity belongs to another connection.", "conflict");
  if (operation.before !== undefined && JSON.stringify(existing ? remoteWorkItemLinkSchema.parse(existing) : null) !== JSON.stringify(operation.before)) refuse(context, "Remote work item link changed after preparation.", "conflict");
  const value = projectRemoteWorkItemLink({ ...after, externalRefId: ref.id, id: existing?.id ?? allocatedId(context), lastSyncedAt: after.syncState === "stale" ? after.lastSyncedAt : supply.createdAt }, state.externalRefs);
  if (existing) Object.assign(existing, value); else state.remoteWorkItemLinks.push(value);
  if (operation.statusCatalog) {
    if (ref.entityType !== "card" || !after.statusEvidence) refuse(context, "GitHub status adoption requires complete catalog evidence.");
    const status = resolveGitHubStatus(connection.statusSource ?? { kind: "repository" }, operation.statusCatalog, after.statusEvidence);
    for (const conflict of state.syncConflicts ?? []) if (conflict.externalRefId === ref.id && conflict.field === "status" && conflict.status === "open") { conflict.status = "resolved-remote"; conflict.resolvedAt = supply.createdAt; }
    connection.statusCatalogs = mergeStatusCatalog(connection.statusCatalogs ?? [], operation.statusCatalog);
    for (const link of state.remoteWorkItemLinks) {
      if (!link.cardId || link.connectionId !== connection.id || !link.statusEvidence || githubStatusSourceKey(link.statusEvidence.source) !== githubStatusSourceKey(operation.statusCatalog.source)) continue;
      const card = state.cards.find((card) => card.id === link.cardId);
      const option = operation.statusCatalog.options.find((option) => option.id === link.statusEvidence!.optionId);
      const name = link.externalRefId === ref.id ? status : option?.name;
      if (card && name !== undefined && card.status !== name) {
        const before = operation.statusCardsBefore?.find((before) => before.id === card.id);
        if (context.initialVersions.has(card.id) && (!before || before.version !== context.initialVersions.get(card.id))) refuse(context, "GitHub status adoption requires reviewed Card evidence.", "conflict");
        cardOwner(context, card.id); card.status = name; card.updatedAt = supply.createdAt; bumpVersion(context, card); }
    }
  }
}

function resolveSyncRun(context: ResolutionContext): void {
  const { state, supply } = context;
  const operation = context.operation as Extract<ResolutionContext["operation"], { entity: "syncRun" }>;
  mapOwner(context, operation.after.storyMapId);
  const map = state.storyMaps.find((row) => row.id === operation.after.storyMapId)!;
  assertBaseline(context, map.version, map.id);
  const connection = state.connections.find((row) => row.id === operation.after.connectionId);
  if (!connection || connection.projectId !== operation.after.projectId || connection.provider !== operation.after.provider || map.projectId !== operation.after.projectId) refuse(context, "Sync run connection is foreign or missing.");
  const { dryRunPlan: _plan, ...run } = operation.after;
  (state.syncRuns ??= []).push({ ...run, id: allocatedId(context), createdAt: supply.createdAt });
}

function resolveSyncConflictOperation(context: ResolutionContext): void {
  const { operation, state, supply } = context;
  if (operation.entity !== "syncConflict") refuse(context, "Unsupported GitHub sync operation.");
  if (operation.op === "resolve") {
    const conflict = state.syncConflicts?.find((row) => row.id === operation.entityId);
    const priorLink = state.remoteWorkItemLinks.find((row) => row.externalRefId === conflict?.externalRefId);
    const closure = conflict && context.previousWrites.get(`syncConflict:${conflict.id}`);
    const adopted = conflict?.field === "status" && conflict.status === "resolved-remote" && operation.after.resolution === "remote" && conflict.resolvedAt === supply.createdAt && closure && closure === context.previousWrites.get(`remoteWorkItemLink:${priorLink?.id}`);
    if (!conflict || conflict.status !== "open" && !adopted) refuse(context, "Sync conflict is no longer open.", "conflict");
    const reviewedConflict = adopted ? { ...conflict, status: "open", resolvedAt: operation.before.resolvedAt } : conflict;
    if (JSON.stringify(syncConflictSchema.parse(reviewedConflict)) !== JSON.stringify(operation.before)) refuse(context, "Reviewed sync conflict changed after preparation.", "conflict");
    validateConflictRelationships(context, conflict);
    const link = state.remoteWorkItemLinks.find((row) => row.externalRefId === conflict.externalRefId)!;
    if (!context.previousWrites.has(`remoteWorkItemLink:${link.id}`)) refuse(context, "Sync conflict resolution requires its chosen field and baseline effect before closure.");
    if (!syncResolutionAgrees(state, supply, conflict, link, operation.after.resolution, operation.after.reviewed)) refuse(context, "Sync conflict chosen field and canonical baseline do not agree.", "conflict");
    conflict.status = operation.after.resolution === "local" ? "resolved-local" : "resolved-remote";
    conflict.resolvedAt = supply.createdAt;
    return;
  }
  const externalRefId = state.externalRefs.some((row) => row.id === operation.after.externalRefId) ? operation.after.externalRefId : context.aliases.get(operation.after.externalRefId)?.id;
  if (!externalRefId) refuse(context, "Sync conflict canonical reference is unknown or forward.");
  const after = { ...operation.after, externalRefId, ...(operation.after.cardId ? { cardId: referenceId(context, "card", operation.after.cardId) } : {}) };
  const runId = state.syncRuns?.some((row) => row.id === after.syncRunId) ? after.syncRunId : context.aliases.get(after.syncRunId)?.id;
  if (!runId || !state.syncRuns?.some((row) => row.id === runId)) refuse(context, "Sync conflict run is unknown or forward.");
  validateConflictRelationships(context, { ...after, syncRunId: runId });
  if (state.syncConflicts?.some((row) => row.externalRefId === externalRefId && row.field === after.field && row.status === "open")) return;
  (state.syncConflicts ??= []).push({ ...after, syncRunId: runId, id: allocatedId(context), createdAt: supply.createdAt });
}

function validateConflictRelationships(context: ResolutionContext, conflict: Pick<SyncConflict, "externalRefId" | "syncRunId" | "connectionId" | "cardId" | "remoteId">): void {
  const run = context.state.syncRuns?.find((row) => row.id === conflict.syncRunId);
  const connection = context.state.connections.find((row) => row.id === conflict.connectionId);
  if (!run || !connection || run.connectionId !== connection.id || run.provider !== connection.provider || run.projectId !== connection.projectId) refuse(context, "Sync conflict run and connection disagree.");
  projectOwner(context, run.projectId);
  mapOwner(context, run.storyMapId);
  if (!conflict.cardId || !conflict.remoteId) refuse(context, "Sync conflict requires its Card and remote identity.");
  cardOwner(context, conflict.cardId);
  const card = context.state.cards.find((row) => row.id === conflict.cardId)!;
  const binding = context.state.remoteWorkItemLinks.find((row) => row.externalRefId === conflict.externalRefId && row.cardId === card.id && row.connectionId === connection.id && row.remoteId === conflict.remoteId && row.provider === connection.provider);
  const ref = binding && context.state.externalRefs.find((row) => row.id === binding.externalRefId);
  const locator = ref && parseWorkItemLocator(ref.system, ref.externalId);
  if (card.storyMapId !== run.storyMapId || !locator || !workItemScopeMatches(locator, connection)) refuse(context, "Sync conflict Card, map and remote link disagree.");
}
