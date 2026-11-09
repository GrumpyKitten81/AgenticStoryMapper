import { parseWorkItemLocator, isWorkItemProvider } from "@storymapper/contracts";
import type { ChangeOperation, OperationSnapshot } from "@storymapper/contracts";
import { ownValue, ownString } from "@storymapper/core/changesets/supply-values";
import { allocatedId, mapOwner, refuse, type ResolutionContext } from "@storymapper/core/changesets/resolution-context";

export function validateMapFingerprints(context: ResolutionContext, expected: Readonly<Record<string, string>>): void {
  for (const [id, fingerprint] of Object.entries(expected)) {
    mapOwner(context, id);
    if (context.state.mapFingerprints?.[id] !== fingerprint) refuse(context, "Story Map changed after the proposal; create a new proposal.", "conflict");
  }
}

export function copyMap(context: ResolutionContext): void {
  const operation = context.operation as Extract<ChangeOperation, { entity: "storyMapCopy" }>;
  const { input, expected } = operation.after;
  const sourceId = input.sourceStoryMapId;
  if (!expected[sourceId]) refuse(context, "Copy proposal source scope is missing.");
  validateMapFingerprints(context, expected);
  const ids = ownValue(context.supply.copyIds, operation.operationId);
  if (!ids) refuse(context, "Application must supply all copied identities.");
  const targetId = allocatedId(context);
  if (operation.entityId !== targetId || operation.after.preview.target.id !== targetId || operation.after.preview.source.id !== sourceId || operation.after.preview.target.name !== input.targetName) refuse(context, "Copy proposal identity or scope disagrees with its approved input.");
  const rows = copyRows(context.state, sourceId);
  const existing = new Set(Object.values(context.state).flatMap((value) => Array.isArray(value) ? value.map((entry: { id: string }) => entry.id) : []));
  const allocated = new Map<string, string>();
  for (const entries of Object.values(rows)) for (const source of entries) {
    const id = source.id === sourceId ? targetId : ownString(ids, source.id);
    if (!id || existing.has(id) || (allocated.has(id) && allocated.get(id) !== source.id)) refuse(context, "Copied identity is absent, duplicated or already persisted.");
    allocated.set(id, source.id);
  }
  const remap: Record<string, string> = Object.assign(Object.create(null), ids, { [sourceId]: targetId });
  for (const [key, entries] of Object.entries(rows)) {
    const target = context.state[key as keyof OperationSnapshot] as unknown as Array<Record<string, unknown>>;
    for (const entry of entries) target.push(cloneCopiedRow(context, key, entry, remap, input.targetName));
  }
  for (const card of context.state.cards.filter((row) => row.storyMapId === targetId)) if (context.state.sourceLinks.some((row) => row.cardId === card.id) || context.state.externalRefs.some((ref) => isWorkItemProvider(ref.system) && ref.entityType === "card" && ref.entityId === card.id && parseWorkItemLocator(ref.system, ref.externalId)?.resource === "issues")) card.provenance = "linked";
}

function cloneCopiedRow(context: ResolutionContext, key: string, source: Record<string, unknown> & { id: string }, ids: Record<string, string>, name: string): Record<string, unknown> {
  const row = structuredClone(source);
  row.id = ownString(ids, source.id)!;
  for (const [field, value] of Object.entries(row)) if ((field.endsWith("Id") || field === "targetId") && typeof value === "string" && ownString(ids, value)) row[field] = ownString(ids, value);
  if ("version" in row) row.version = 1;
  if ("syncedVersion" in row) row.syncedVersion = 1;
  if ("createdAt" in row) row.createdAt = context.supply.createdAt;
  if ("updatedAt" in row) row.updatedAt = context.supply.createdAt;
  if (key === "storyMaps") row.name = name;
  if (key === "cards") { row.creationOrigin = "inference"; row.provenance = "inference"; }
  return row;
}

export function copyRows(state: OperationSnapshot, mapId: string): Record<string, Array<Record<string, unknown> & { id: string }>> {
  const cards = new Set(state.cards.filter((entry) => entry.storyMapId === mapId).map((entry) => entry.id));
  const releases = new Set(state.releases.filter((entry) => entry.storyMapId === mapId).map((entry) => entry.id));
  const roadmaps = new Set(state.roadmaps.filter((entry) => entry.storyMapId === mapId).map((entry) => entry.id));
  const roadmapCards = new Set(state.roadmapCards.filter((entry) => roadmaps.has(entry.roadmapId)).map((entry) => entry.id));
  const rows: Record<string, Array<{ id: string }>> = { storyMaps: state.storyMaps.filter((entry) => entry.id === mapId) };
  for (const key of ["cards", "releases", "personas", "workflowStatuses", "annotations", "storyTemplates", "productContexts", "roadmaps"] as const) rows[key] = state[key].filter((entry) => entry.storyMapId === mapId);
  for (const key of ["cardPersonas", "cardAnnotations", "sourceLinks", "attachments"] as const) rows[key] = state[key].filter((entry) => cards.has(entry.cardId));
  rows.cardDependencies = state.cardDependencies.filter((entry) => cards.has(entry.cardId) && cards.has(entry.prerequisiteCardId));
  rows.externalRefs = state.externalRefs.filter((entry) => isWorkItemProvider(entry.system) && entry.scopeId === mapId);
  for (const key of ["roadmapColumns", "roadmapSwimlanes", "roadmapCards"] as const) rows[key] = state[key].filter((entry) => roadmaps.has(entry.roadmapId));
  rows.roadmapReferences = state.roadmapReferences.filter((entry) => roadmapCards.has(entry.roadmapCardId));
  return rows as Record<string, Array<Record<string, unknown> & { id: string }>>;
}
