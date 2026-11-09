import type { ChangeOperation, OperationOwner, OperationSnapshot, OperationSupply } from "@storymapper/contracts";
import { ownString } from "@storymapper/core/changesets/supply-values";

export class OperationResolutionError extends Error {
  constructor(readonly operationId: string, readonly index: number, readonly code: "validation" | "conflict", message: string) {
    super(`Operation ${operationId} at index ${index}: ${message}`);
    this.name = "OperationResolutionError";
  }
}

export interface ResolutionContext {
  state: OperationSnapshot;
  supply: OperationSupply;
  operation: ChangeOperation;
  index: number;
  aliases: Map<string, { entity: string; id: string; operationId: string }>;
  previousWrites: Map<string, string>;
  dependencies: Set<string>;
  initialVersions: Map<string, number>;
  initialExternalVersions: Map<string, number>;
  importedDocuments: Map<string, string>;
  persistedChunkIds: ReadonlySet<string>;
  publishedRefIds: Set<string>;
  acknowledgedSourceEntries: Map<string, Set<string>>;
}

export function refuse(context: ResolutionContext, message: string, code: "validation" | "conflict" = "validation"): never {
  throw new OperationResolutionError(context.operation.operationId, context.index, code, message);
}

export function allocatedId(context: ResolutionContext, externalRef = false): string {
  const id = ownString(externalRef ? context.supply.externalRefIds : context.supply.ids, context.operation.operationId);
  if (!id) refuse(context, "Application must supply an allocated id.");
  if (allEntities(context.state).some((entry) => entry.id === id)) refuse(context, `Allocated id ${id} already exists.`);
  return id;
}

function allEntities(state: OperationSnapshot): Array<{ id: string }> {
  return [...state.projects, ...state.connections, ...state.storyMaps, ...state.cards, ...state.releases, ...state.personas, ...state.sourceLinks, ...state.githubLinks, ...state.externalRefs, ...state.sourceDocuments, ...state.sourceChunks, ...state.roadmaps, ...state.roadmapColumns, ...state.roadmapSwimlanes, ...state.roadmapCards, ...state.roadmapReferences, ...state.annotations, ...state.workflowStatuses, ...state.storyTemplates, ...state.productContexts, ...state.attachments, ...state.cardPersonas, ...state.cardAnnotations, ...state.cardDependencies, ...state.remoteWorkItemLinks, ...(state.syncRuns ?? []), ...(state.syncConflicts ?? [])];
}

export function referenceId(context: ResolutionContext, entity: "card" | "release" | "persona" | "storyMap", id: string): string {
  const entities = entity === "storyMap" ? context.state.storyMaps : entity === "card" ? context.state.cards : entity === "release" ? context.state.releases : context.state.personas;
  if (entities.some((entry) => entry.id === id)) { readDependency(context, entity, id); return id; }
  const alias = context.aliases.get(id);
  if (alias?.entity === entity) { context.dependencies.add(alias.operationId); readDependency(context, entity, alias.id); return alias.id; }
  return refuse(context, `Unknown or forward ${entity} reference ${id}.`);
}

export function readDependency(context: ResolutionContext, entity: string, id: string): void {
  const previous = context.previousWrites.get(`${entity}:${id}`);
  if (previous) context.dependencies.add(previous);
}

export function mapOwner(context: ResolutionContext, id: string): OperationOwner {
  const map = context.state.storyMaps.find((entry) => entry.id === id);
  if (!map || map.projectId !== context.state.projectId) refuse(context, `Story map ${id} is unknown or belongs to another Project.`);
  readDependency(context, "storyMap", id);
  return { entity: "storyMap", entityId: id, projectId: map.projectId };
}

export function projectOwner(context: ResolutionContext, id: string): void {
  if (id !== context.state.projectId || !context.state.projects.some((entry) => entry.id === id)) refuse(context, `Project ${id} is unknown or foreign.`);
}

export function cardOwner(context: ResolutionContext, id: string): OperationOwner {
  const card = context.state.cards.find((entry) => entry.id === id);
  if (!card) refuse(context, `Card ${id} not found.`);
  mapOwner(context, card.storyMapId);
  readDependency(context, "card", id);
  let parentId = card.parentId;
  const seen = new Set([id]);
  while (parentId) {
    if (seen.has(parentId)) refuse(context, "Card ancestry contains a cycle.");
    seen.add(parentId);
    const parent = context.state.cards.find((entry) => entry.id === parentId);
    if (!parent || parent.storyMapId !== card.storyMapId) refuse(context, "Card ancestry is invalid.");
    readDependency(context, "card", parentId);
    parentId = parent.parentId;
  }
  return { entity: "card", entityId: id, projectId: context.state.projectId };
}

export function assertBaseline(context: ResolutionContext, version: number, entityId: string): void {
  const baseline = context.initialVersions.get(entityId);
  if (baseline !== undefined && context.operation.baseVersion !== undefined && context.operation.baseVersion !== baseline) refuse(context, "Owner version disagrees with the supplied baseline.", "conflict");
}

export function resolvedRootVersion(context: ResolutionContext, entityId: string): number {
  const initial = context.initialVersions.get(entityId);
  return initial === undefined ? 1 : initial + 1;
}

export function bumpVersion(context: ResolutionContext, entity: { id: string; version: number }): void {
  entity.version = resolvedRootVersion(context, entity.id);
}
