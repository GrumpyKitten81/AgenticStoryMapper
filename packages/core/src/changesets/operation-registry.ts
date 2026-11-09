import { isCardArchived } from "@storymapper/core/story-map/github-status";
import { projectGitHubRefs } from "@storymapper/core/changesets/github-identity";
import { githubImportDependencies } from "@storymapper/core/changesets/github-import-dependencies";
import { acknowledgeSourcePlan, capturePublishedSourcePlans, validateFinalAcknowledgments } from "@storymapper/core/changesets/source-plan-resolution";
import { resolveCardDependency } from "@storymapper/core/changesets/dependency-resolution";
import { selectedEntityId } from "@storymapper/core/changesets/entity-resolution";
import { operationDependencies } from "@storymapper/core/changesets/operation-dependencies";
import { changeOperationSchema, type ChangeOperation, type ChangeSetResolution, type OperationDescription, type OperationOwner, type OperationResolution, type OperationSnapshot, type OperationSupply, type ResolvedEntityChange } from "@storymapper/contracts";
import { createCard, createMap, createPersona, createRelease, moveCard, updateCard, updateMap, updatePersona, updateRelease, targetId } from "@storymapper/core/changesets/entity-resolution";
import { OperationResolutionError, cardOwner, mapOwner, projectOwner, referenceId, refuse, type ResolutionContext } from "@storymapper/core/changesets/resolution-context";
import { importSource, linkSource, unlinkSource, validateChunk, validateGithub } from "@storymapper/core/changesets/source-resolution";
import { resolveCustomization, resolveRelationship, setProductContext } from "@storymapper/core/changesets/customization-resolution";
import { resolveRoadmap } from "@storymapper/core/changesets/roadmap-resolution";
import { copyMap } from "@storymapper/core/changesets/copy-resolution";
import { resolveCardCommand, resolveDeletion } from "@storymapper/core/changesets/card-command-resolution";
import { resolveAttachment, resolveGithubLink, resolveExternalRef } from "@storymapper/core/changesets/link-resolution";
import { importBoard } from "@storymapper/core/changesets/board-import-resolution";
import { CHANGE_COLLECTIONS, changeOwners, ownersFor } from "@storymapper/core/changesets/remaining-owners";
import { remainingReference } from "@storymapper/core/changesets/remaining-context";
import { upsertEntity } from "@storymapper/core/changesets/upsert-resolution";

import { resolveGitHubSync } from "@storymapper/core/changesets/github-sync-resolution";
import { copyWritableCollections, resolverWriteCollections, type ChangeCollection } from "@storymapper/core/changesets/resolver-write-collections";

export interface OperationHandler {
  describe(snapshot: OperationSnapshot, operation: ChangeOperation, supply: OperationSupply, index?: number): OperationDescription;
  resolve(snapshot: OperationSnapshot, operation: ChangeOperation, supply: OperationSupply, index?: number): OperationResolution;
}

const RESOLVERS = {
  "acknowledge:sourcePlan": acknowledgeSourcePlan,
  "import:sourceDocument": importSource,
  "set:remoteWorkItemLink": resolveGitHubSync, "create:syncRun": resolveGitHubSync, "create:syncConflict": resolveGitHubSync, "resolve:syncConflict": resolveGitHubSync,
  "create:roadmap": resolveRoadmap, "update:roadmap": resolveRoadmap, "create:roadmapColumn": resolveRoadmap, "create:roadmapSwimlane": resolveRoadmap, "create:roadmapCard": resolveRoadmap, "create:roadmapReference": resolveRoadmap,
  "create:annotation": resolveCustomization, "update:annotation": resolveCustomization, "delete:annotation": resolveCustomization,
  "create:workflowStatus": resolveCustomization, "update:workflowStatus": resolveCustomization, "delete:workflowStatus": resolveCustomization,
  "create:storyTemplate": resolveCustomization, "update:storyTemplate": resolveCustomization, "delete:storyTemplate": resolveCustomization,
  "set:productContext": setProductContext, "create:attachment": resolveAttachment, "delete:attachment": resolveAttachment,
  "park:card": resolveCardCommand, "unpark:card": resolveCardCommand, "archive:card": resolveCardCommand, "unarchive:card": resolveCardCommand, "bulk:card": resolveCardCommand,
  "delete:card": resolveDeletion, "delete:persona": resolveDeletion, "delete:release": resolveDeletion, "delete:storyMap": resolveDeletion,
  "set:cardDependency": resolveCardDependency, "unset:cardDependency": resolveCardDependency,
  "set:cardPersona": resolveRelationship, "unset:cardPersona": resolveRelationship, "set:cardAnnotation": resolveRelationship, "unset:cardAnnotation": resolveRelationship,
  "create:githubExternalRef": resolveGithubLink, "update:githubExternalRef": resolveGithubLink, "delete:githubExternalRef": resolveGithubLink,
  "set:externalRef": resolveExternalRef, "delete:externalRef": resolveExternalRef,
  "create:storyMapCopy": copyMap, "create:githubBoardImport": importBoard,
  "create:storyMap": createMap, "update:storyMap": updateMap,
  "create:card": createCard, "update:card": updateCard, "move:card": moveCard,
  "create:release": createRelease, "update:release": updateRelease,
  "create:persona": createPersona, "update:persona": updatePersona,
  "link:sourceLink": linkSource, "unlink:sourceLink": unlinkSource,
  "upsert:card": upsertEntity, "upsert:release": upsertEntity, "upsert:persona": upsertEntity
} as const;

export type ResolverKey = keyof typeof RESOLVERS;

function handler(key: string): OperationHandler {
  const resolve: OperationHandler["resolve"] = (snapshot, operation, supply, index = 0) => {
    if (`${operation.op}:${operation.entity}` !== key) throw new OperationResolutionError(operation.operationId, index, "validation", "Operation does not match this catalog handler.");
    return resolveOperation(snapshot, operation, supply, index);
  };
  return { resolve, describe: (snapshot, operation, supply, index = 0) => { const { state: _state, ...description } = resolve(snapshot, operation, supply, index); return description; } };
}

export const operationRegistry: Readonly<Record<string, OperationHandler>> = Object.freeze(Object.fromEntries([
  ...Object.keys(RESOLVERS).map((key) => [key, handler(key)])
]));

export function resolveOperation(snapshot: OperationSnapshot, operation: ChangeOperation, supply: OperationSupply, index = 0): OperationResolution {
  operation = normalizeOperation(operation, index);
  return resolveNext({ state: structuredClone(snapshot), supply, operation, index, aliases: new Map(), previousWrites: new Map(), dependencies: new Set(), initialVersions: snapshotVersions(snapshot), initialExternalVersions: new Map(snapshot.externalRefs.map((ref) => [ref.id, ref.syncedVersion])), importedDocuments: new Map(), publishedRefIds: new Set(), acknowledgedSourceEntries: new Map(), persistedChunkIds: new Set(snapshot.sourceChunks.map((row) => row.id)) });
}

export function describeOperation(snapshot: OperationSnapshot, operation: ChangeOperation, supply: OperationSupply, index = 0): OperationDescription {
  const { state: _state, ...description } = resolveOperation(snapshot, operation, supply, index);
  return description;
}

export function resolveOperations(snapshot: OperationSnapshot, operations: readonly ChangeOperation[], supply: OperationSupply, selectedOperationIds?: readonly string[], options: { retainOperationStates?: boolean } = {}): ChangeSetResolution {
  operations = operations.map(normalizeOperation);
  validateOperationIds(operations);
  if (selectedOperationIds === undefined) {
    const all = simulate(snapshot, operations, supply, undefined, options.retainOperationStates);
    return { operations: all, selectedOperationIds: operations.map((entry) => entry.operationId), state: all.at(-1)?.state ?? structuredClone(snapshot) };
  }
  selectedOperationIds = selectedOperationIds.map((id) => id.trim());
  const selected = new Set(selectedOperationIds);
  if ([...selected].some((id) => !operations.some((entry) => entry.operationId === id))) throw new OperationResolutionError("selection", -1, "validation", "Selection contains an unknown operation id.");
  const dependencies = operationDependencies(snapshot, operations, supply);
  for (const operation of operations) if (dependencies.get(operation.operationId)!.some((id) => !operations.some((candidate) => candidate.operationId === id))) throw new OperationResolutionError(operation.operationId, operations.indexOf(operation), "validation", "Operation references an unknown dependency.");
  const excluded = new Set(operations.filter((entry) => !selected.has(entry.operationId)).map((entry) => entry.operationId));
  for (const operation of operations) if (dependencies.get(operation.operationId)!.some((id) => excluded.has(id))) excluded.add(operation.operationId);
  const retained = operations.filter((entry) => selected.has(entry.operationId) && !excluded.has(entry.operationId)).map((entry) => entry.operationId);
  const resolutions = simulate(snapshot, operations, supply, new Set(retained), options.retainOperationStates);
  return { operations: resolutions, selectedOperationIds: retained, state: resolutions.at(-1)?.state ?? structuredClone(snapshot) };
}

function normalizeOperation(operation: ChangeOperation, index: number): ChangeOperation {
  const parsed = changeOperationSchema.safeParse(operation);
  if (!parsed.success) throw new OperationResolutionError(operation.operationId, index, "validation", parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("; "));
  return parsed.data;
}

export function deselectOperationDependents(resolutions: readonly OperationDescription[], selectedOperationIds: readonly string[], deselectedOperationIds: readonly string[]): string[] {
  const excluded = new Set(deselectedOperationIds);
  for (const resolution of resolutions) if (resolution.dependencies.some((id) => excluded.has(id))) excluded.add(resolution.operationId);
  return selectedOperationIds.filter((id) => !excluded.has(id));
}

function validateOperationIds(operations: readonly ChangeOperation[]): void {
  const ids = new Set<string>();
  const locals = new Set<string>();
  operations.forEach((operation, index) => {
    if (ids.has(operation.operationId)) throw new OperationResolutionError(operation.operationId, index, "validation", "Duplicate operation id.");
    ids.add(operation.operationId);
    if ((operation.op === "create" || operation.op === "upsert" || operation.op === "import") && operation.entityId) {
      if (locals.has(operation.entityId)) throw new OperationResolutionError(operation.operationId, index, "validation", "Duplicate creation-local id.");
      locals.add(operation.entityId);
    }
  });
}

function simulate(snapshot: OperationSnapshot, operations: readonly ChangeOperation[], supply: OperationSupply, selected?: Set<string>, retainOperationStates = true): OperationResolution[] {
  let state = structuredClone(snapshot);
  const aliases: ResolutionContext["aliases"] = new Map();
  const previousWrites: ResolutionContext["previousWrites"] = new Map();
  const initialVersions = snapshotVersions(snapshot);
  const initialExternalVersions = new Map(snapshot.externalRefs.map((ref) => [ref.id, ref.syncedVersion]));
  const resolutions: OperationResolution[] = [];
  const importedDocuments = new Map<string, string>();
  const persistedChunkIds = new Set(snapshot.sourceChunks.map((row) => row.id));
  const publishedRefIds = new Set<string>();
  const acknowledgedSourceEntries = new Map<string, Set<string>>();
  operations.forEach((operation, index) => {
    if (selected && !selected.has(operation.operationId)) return;
    const resolution = resolveNext({ state, supply, operation, index, aliases, previousWrites, dependencies: new Set(), initialVersions, initialExternalVersions, importedDocuments, persistedChunkIds, publishedRefIds, acknowledgedSourceEntries }, retainOperationStates);
    resolutions.push(resolution);
    state = retainOperationStates ? structuredClone(resolution.state) : resolution.state;
    resolution.changes.forEach((change) => previousWrites.set(`${change.entity}:${change.entityId}`, operation.operationId));
    resolution.owners.forEach((owner) => previousWrites.set(`${owner.entity}:${owner.entityId}`, operation.operationId));
    for (const change of resolution.changes) if (change.entity === "cardDependency") {
      const cardId = (change.after ?? change.before)!.cardId;
      const card = state.cards.find((row) => row.id === cardId) ?? snapshot.cards.find((row) => row.id === cardId);
      if (card) previousWrites.set(`cardDependencyGraph:${card.storyMapId}`, operation.operationId);
    }
    if ((operation.op === "create" || operation.op === "upsert" || operation.op === "import") && operation.entityId) {
      const target = creationTarget(state, operation, resolution);
      if (target) aliases.set(operation.entityId, { entity: operation.entity === "storyMapCopy" || operation.entity === "githubBoardImport" ? "storyMap" : operation.entity, id: target, operationId: operation.operationId });
    }
    if (operation.op === "upsert") {
      const target = creationTarget(state, operation, resolution);
      if (target) previousWrites.set(`${operation.entity}:${target}`, operation.operationId);
    }
  });
  validateFinalAcknowledgments(state, operations.filter((operation) => !selected || selected.has(operation.operationId)));
  const imports = githubImportDependencies(operations);
  for (const resolution of resolutions) resolution.dependencies = [...new Set([...resolution.dependencies, ...imports.get(resolution.operationId) ?? []])];
  return resolutions;
}

function creationTarget(state: OperationSnapshot, operation: ChangeOperation, resolution: OperationResolution): string | undefined {
  if (operation.op === "upsert") return state.externalRefs.find((ref) => ref.entityType === operation.entity && ref.scopeId === operation.selector.scopeId && ref.system === operation.selector.system && ref.externalId === operation.selector.externalId)?.entityId;
  return resolution.changes.find((change) => change.entity === (operation.entity === "githubExternalRef" ? "externalRef" : operation.entity === "storyMapCopy" || operation.entity === "githubBoardImport" ? "storyMap" : operation.entity) && change.after && !change.before)?.entityId;
}

function resolveNext(context: ResolutionContext, retainOperationState = true): OperationResolution {
  context.state.githubLinks = projectGitHubRefs(context.state.externalRefs, context.state.remoteWorkItemLinks);
  validateMetadata(context);
  const key = `${context.operation.op}:${context.operation.entity}`;
  const resolver = RESOLVERS[key as keyof typeof RESOLVERS];
  if (!resolver) refuse(context, "Unsupported operation pair.");
  const writableCollections = resolverWriteCollections(key as ResolverKey);
  const before = copyWritableCollections(context.state, writableCollections);
  resolver(context);
  context.state.githubLinks = projectGitHubRefs(context.state.externalRefs, context.state.remoteWorkItemLinks);
  synchronizePublishedReferences(context);
  capturePublishedSourcePlans(context);
  const changes = entityChanges(before, context.state, context.operation, writableCollections);
  const affected = changeOwners(context, changes, before);
  const addressed = addressedOwner(context.operation.op === "delete" ? { ...context, state: before } : context);
  invalidateFingerprints(context, changes, ownersForChangedMaps(context, affected, before));
  const addressedOwners = addressed && !affected.some((owner) => owner.entity === addressed.entity && owner.entityId === addressed.entityId) ? [...affected, addressed] : affected;
  return { operationId: context.operation.operationId, index: context.index, kind: key, label: context.operation.op === "upsert" ? "may change" : context.operation.op, status: changes.length ? "changed" : "unchanged", dependencies: [...context.dependencies], owners: changes.length ? addressedOwners : [...addressedOwners, ...unchangedOwners(context).filter((owner) => !addressedOwners.some((existing) => existing.entity === owner.entity && existing.entityId === owner.entityId))], changes: retainOperationState ? changes : structuredClone(changes), state: retainOperationState ? structuredClone(context.state) : context.state };
}

function validateMetadata(context: ResolutionContext): void {
  const { operation } = context;
  if (operation.context?.projectId) projectOwner(context, operation.context.projectId);
  if (operation.context?.storyMapId) mapOwner(context, operation.context.storyMapId);
  if (operation.context?.productContextId) {
    const product = context.state.productContexts.find((entry) => entry.id === operation.context!.productContextId);
    if (!product) refuse(context, "Product Context is unknown.");
    projectOwner(context, product.projectId);
    if (product.storyMapId) mapOwner(context, product.storyMapId);
    if (product.storyMapId && operation.context.storyMapId && product.storyMapId !== operation.context.storyMapId) refuse(context, "Product Context belongs to another Story Map.");
  }
  for (const id of operation.context?.cardIds ?? []) cardOwner(context, id);
  for (const id of operation.context?.sourceChunkIds ?? []) validateChunk(context, id);
  for (const source of operation.sources ?? []) {
    if (source.kind === "chunk") validateChunk(context, source.chunkId);
    if (source.kind === "github") validateGithub(context, source.externalRefId);
  }
}

function entityChanges(before: OperationSnapshot, after: OperationSnapshot, operation: ChangeOperation, writableCollections: ReadonlySet<ChangeCollection>): ResolvedEntityChange[] {
  const changes: ResolvedEntityChange[] = [];
  for (const [entity, collection] of Object.entries(CHANGE_COLLECTIONS)) if (writableCollections.has(collection)) collectChanges(entity as ResolvedEntityChange["entity"], before[collection] ?? [], after[collection] ?? [], changes);
  if (operation.op === "upsert" && operation.entity === "card") for (const change of changes) if (change.entity === "card" && change.before && isCardArchived(change.before) && change.after && !isCardArchived(change.after)) change.implicit = "unarchive";
  return changes;
}

function collectChanges(entity: ResolvedEntityChange["entity"], before: Array<{ id: string }>, after: Array<{ id: string }>, changes: ResolvedEntityChange[]): void {
  const old = new Map(before.map((entry) => [entry.id, entry]));
  const current = new Map(after.map((entry) => [entry.id, entry]));
  for (const id of new Set([...old.keys(), ...current.keys()])) {
    const previous = old.get(id);
    const next = current.get(id);
    if (entity === "card" ? !sameScalarRow(previous, next) : JSON.stringify(previous) !== JSON.stringify(next)) changes.push({ entity, entityId: id, ...(previous ? { before: previous } : {}), ...(next ? { after: next } : {}) } as unknown as ResolvedEntityChange);
  }
}

function snapshotVersions(snapshot: OperationSnapshot): Map<string, number> {
  return new Map([...snapshot.storyMaps, ...snapshot.cards, ...snapshot.releases, ...snapshot.personas, ...snapshot.roadmaps].map((entry) => [entry.id, entry.version]));
}

function addressedOwner(context: ResolutionContext): OperationOwner | undefined {
  if (context.operation.entity === "sourcePlan") return mapOwner(context, context.operation.after.storyMapId);
  if (context.operation.entity === "cardDependency") return cardOwner(context, selectedEntityId(context, "card", context.operation.after.cardId));
  const operation = context.operation;
  if (operation.entity === "sourceLink" || operation.entity === "cardPersona" || operation.entity === "cardAnnotation") {
    const id = operation.after.cardId;
    const target = context.state.cards.find((entry) => entry.id === id) ?? context.state.cards.find((entry) => entry.id === context.aliases.get(id)?.id);
    return target && cardOwner(context, target.id);
  }
  if ((operation.entity === "externalRef" || operation.entity === "githubExternalRef") && operation.op === "set") {
    const after = operation.after;
    const rows = context.state[CHANGE_COLLECTIONS[after.entityType]];
    const row = rows.find((entry) => entry.id === after.entityId) ?? rows.find((entry) => entry.id === context.aliases.get(after.entityId)?.id);
    return row && ownersFor(context, after.entityType, row)[0];
  }
  if (operation.op === "create" || operation.op === "import" || operation.op === "set" || operation.op === "bulk") return undefined;
  if (operation.op === "upsert") { const id = targetId(context); const row = operation.entity === "card" ? context.state.cards.find((entry) => entry.id === id) : operation.entity === "release" ? context.state.releases.find((entry) => entry.id === id) : context.state.personas.find((entry) => entry.id === id); return row && ownersFor(context, operation.entity, row)[0]; }
  const collection = operation.entity === "githubExternalRef" ? "externalRefs" : CHANGE_COLLECTIONS[operation.entity as keyof typeof CHANGE_COLLECTIONS];
  const selector = operation.selector;
  const input = selector?.kind === "id" ? selector.id : selector?.kind === "local" ? selector.localId : operation.entityId;
  const row = collection && (context.state[collection] ?? []).find((entry) => entry.id === input || entry.id === context.aliases.get(input!)?.id);
  return row ? ownersFor(context, operation.entity, row)[0] : undefined;
}

function ownersForChangedMaps(context: ResolutionContext, owners: OperationOwner[], before: OperationSnapshot): string[] {
  const maps = new Set<string>();
  for (const owner of owners) {
    if (owner.entity === "storyMap") maps.add(owner.entityId);
    else if (owner.entity === "card" || owner.entity === "release" || owner.entity === "persona" || owner.entity === "roadmap") {
      const collection = CHANGE_COLLECTIONS[owner.entity];
      const row = (context.state[collection] ?? []).find((entry) => entry.id === owner.entityId) ?? before[collection].find((entry) => entry.id === owner.entityId);
      if (row?.storyMapId) maps.add(row.storyMapId);
    }
  }
  return [...maps];
}

function invalidateFingerprints(context: ResolutionContext, changes: ResolvedEntityChange[], mapIds: string[]): void {
  if (!context.state.mapFingerprints || !changes.some((change) => !["externalRef", "sourceDocument", "sourceChunk", "connection"].includes(change.entity))) return;
  const retained = { ...context.state.mapFingerprints };
  for (const id of mapIds) delete retained[id];
  context.state.mapFingerprints = retained;
}

function unchangedOwners(context: ResolutionContext): OperationOwner[] {
  const operation = context.operation;
  if (operation.entity === "sourceDocument" || operation.entity === "productContext") {
    const after = operation.after;
    if ("storyMapId" in after && after.storyMapId) return [mapOwner(context, referenceId(context, "storyMap", after.storyMapId))];
    projectOwner(context, after.projectId);
    return [{ entity: "project", entityId: after.projectId, projectId: after.projectId }];
  }
  if (operation.entity === "roadmapReference") {
    const id = remainingReference(context, "roadmapCard", operation.after.roadmapCardId);
    return ownersFor(context, "roadmapCard", context.state.roadmapCards.find((row) => row.id === id)!);
  }
  if (operation.entity === "card" && operation.op === "bulk") return operation.after.cards.map((target) => cardOwner(context, remainingReference(context, "card", target.id)));
  return [];
}

function sameScalarRow(before: { id: string } | undefined, after: { id: string } | undefined): boolean {
  if (!before || !after) return before === after;
  const previous = before as unknown as Record<string, unknown>;
  const next = after as unknown as Record<string, unknown>;
  return Object.keys(previous).length === Object.keys(next).length && Object.keys(previous).every((key) => Object.is(previous[key], next[key]));
}

function synchronizePublishedReferences(context: ResolutionContext): void {
  for (const ref of context.state.externalRefs) {
    if (!context.publishedRefIds.has(ref.id)) continue;
    const rows = ref.entityType === "card" ? context.state.cards : ref.entityType === "release" ? context.state.releases : context.state.personas;
    const root = rows.find((row) => row.id === ref.entityId);
    if (root) ref.syncedVersion = root.version;
  }
}
