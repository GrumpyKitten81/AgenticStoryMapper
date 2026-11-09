import { parseWorkItemLocator, isWorkItemProvider } from "@storymapper/contracts";
import { githubImportDependencies } from "@storymapper/core/changesets/github-import-dependencies";
import { normalizeDeletionSelection, selectedDeletionEffects } from "@storymapper/core/changesets/selected-deletion";
import { ownValue, ownString } from "@storymapper/core/changesets/supply-values";
import { OperationResolutionError } from "@storymapper/core/changesets/resolution-context";
import type { Card, ChangeOperation, OperationSnapshot, OperationSupply, OperationSelector } from "@storymapper/contracts";
import { visibleCards } from "@storymapper/core/story-map/visibility";
import { CHANGE_COLLECTIONS } from "@storymapper/core/changesets/remaining-owners";
import { placeCard, placeRelease, type CardPlacement, type ReleasePlacement } from "@storymapper/core/changesets/position-resolution";

interface Address { entity: string; id: string; }
interface DependencyState {
  aliases: Map<string, Address>;
  owners: Map<string, Address>;
  references: Map<string, string>;
  bindingWrites: Map<string, string>;
  previous: Map<string, string>;
  cards: Map<string, CardPlacement & Pick<Card, "status" | "parked" | "archived">>;
  releases: Map<string, string>;
  personas: Map<string, string | null>;
  releasePositions: Map<string, ReleasePlacement>;
  dependencies: Map<string, string[]>;
  githubCards: Map<string, Set<string>>;
  githubEvidence: Map<string, string>;
  snapshot: OperationSnapshot;
  supply: OperationSupply;
}

export function operationDependencies(snapshot: OperationSnapshot, operations: readonly ChangeOperation[], supply: OperationSupply, trace?: (operation: ChangeOperation, target: Address, owner: Address | undefined, reference: (entity: string, id: string) => Address) => void): Map<string, string[]> {
  const githubCards = new Map(snapshot.githubLinks.map((link) => [link.id, new Set(link.cardId ? [link.cardId] : [])]));
  const githubEvidence = new Map<string, string>();
  for (const link of snapshot.sourceLinks) if (link.kind === "github") { githubCards.get(link.externalRefId)?.add(link.cardId); githubEvidence.set(link.id, link.externalRefId); }
  const state: DependencyState = { aliases: new Map(), owners: snapshotOwners(snapshot), bindingWrites: new Map(), references: new Map(snapshot.externalRefs.map((ref) => [referenceKey(ref.entityType, ref.scopeId, ref.system, ref.externalId), ref.entityId])), previous: new Map(), cards: new Map(structuredClone(snapshot.cards).map((card) => [card.id, card])), releases: new Map(snapshot.releases.map((release) => [release.id, release.storyMapId])), personas: new Map(snapshot.personas.map((persona) => [persona.id, persona.storyMapId])), releasePositions: new Map(structuredClone(snapshot.releases).map((release) => [release.id, release])), dependencies: new Map(), githubCards, githubEvidence, snapshot: structuredClone(snapshot), supply };
  for (const operation of operations) {
    if (operation.entity === "sourceLink" && operation.op === "link" && operation.after.kind === "chunk" && "chunk" in operation.after && operation.after.chunk.kind === "import") {
      const imported = operation.after.chunk.operationId;
      if (!operations.slice(0, operations.indexOf(operation)).some((candidate) => candidate.operationId === imported && candidate.entity === "sourceDocument")) throw new OperationResolutionError(operation.operationId, operations.indexOf(operation), "validation", "Source import dependency is unknown or forward.");
    }
    const dependencies = new Set<string>();
    const target = operationTarget(state, operation);
    trace?.(operation, target, rootOwner(state, state.owners.get(addressKey(target)) ?? inferredOwner(state, operation, target)), (entity, id) => reference(state, entity, id));
    readAddress(state, target, dependencies);
    readPayload(state, operation, target, dependencies);
    registerOperation(state, operation, target, dependencies);
    dependencies.delete(operation.operationId);
    state.dependencies.set(operation.operationId, [...dependencies]);
  }
  for (const [id, group] of githubImportDependencies(operations)) state.dependencies.set(id, [...new Set([...state.dependencies.get(id)!, ...group])]);
  return state.dependencies;
}

function snapshotOwners(snapshot: OperationSnapshot): Map<string, Address> {
  const owners = new Map<string, Address>();
  for (const [entity, collection] of Object.entries(CHANGE_COLLECTIONS)) for (const row of (snapshot[collection as typeof CHANGE_COLLECTIONS[keyof typeof CHANGE_COLLECTIONS]] ?? [])) {
    if ("cardId" in row && row.cardId) owners.set(`${entity}:${row.id}`, { entity: "card", id: row.cardId });
    else if (["githubExternalRef", "remoteWorkItemLink"].includes(entity) && "releaseId" in row && row.releaseId) owners.set(`${entity}:${row.id}`, { entity: "release", id: row.releaseId });
    else if ("entityType" in row && "entityId" in row) owners.set(`${entity}:${row.id}`, { entity: row.entityType, id: row.entityId });
    else if ("roadmapId" in row) owners.set(`${entity}:${row.id}`, { entity: "roadmap", id: row.roadmapId });
    else if ("roadmapCardId" in row) owners.set(`${entity}:${row.id}`, { entity: "roadmapCard", id: row.roadmapCardId });
    else if ("storyMapId" in row && row.storyMapId && !["card", "release", "persona", "roadmap"].includes(entity)) owners.set(`${entity}:${row.id}`, { entity: "storyMap", id: row.storyMapId });
  }
  for (const ref of snapshot.externalRefs) if (isWorkItemProvider(ref.system)) owners.set(`githubExternalRef:${ref.id}`, { entity: ref.entityType, id: ref.entityId });
  return owners;
}

function inferredOwner(state: DependencyState, operation: ChangeOperation, target: Address): Address | undefined {
  const after = operation.after;
  if ("roadmapId" in after) return reference(state, "roadmap", after.roadmapId);
  if ("roadmapCardId" in after) return reference(state, "roadmapCard", after.roadmapCardId);
  if ("cardId" in after && typeof after.cardId === "string") return reference(state, "card", after.cardId);
  if (operation.entity === "remoteWorkItemLink") { const ref = state.snapshot.externalRefs.find((row) => row.id === reference(state, "githubExternalRef", operation.after.externalRefId).id); return ref ? reference(state, ref.entityType, ref.entityId) : undefined; }
  if (operation.entity === "githubExternalRef" && operation.op !== "delete") return reference(state, operation.after.entityType, operation.after.entityId);
  if (operation.entity === "externalRef" && operation.op === "set") return reference(state, operation.after.entityType, operation.after.entityId);
  if (operation.entity === "productContext" && "storyMapId" in after && after.storyMapId) return reference(state, "storyMap", after.storyMapId);
  return state.owners.get(addressKey(target));
}

function referenceKey(entity: string, scope: string, system: string, externalId: string): string { return `${entity}:${scope}:${system}:${externalId}`; }
function addressKey(address: Address): string { return `${address.entity}:${address.id}`; }

function reference(state: DependencyState, entity: string, id: string): Address {
  const collection = entity === "githubExternalRef" ? "externalRefs" : CHANGE_COLLECTIONS[entity as keyof typeof CHANGE_COLLECTIONS];
  const persisted = collection ? state.snapshot[collection] ?? [] : [];
  if (persisted.some((entry) => entry.id === id)) return { entity, id };
  const alias = state.aliases.get(id);
  return alias?.entity === entity ? alias : { entity, id };
}

function externalTarget(state: DependencyState, operation: Extract<ChangeOperation, { op: "upsert" }>): Address {
  const selector = operation.selector;
  const key = referenceKey(operation.entity, scopeReference(state, selector.scopeId), selector.system, selector.externalId);
  return { entity: operation.entity, id: state.references.get(key) ?? ownString(state.supply.ids, operation.operationId) ?? `new:${operation.operationId}` };
}

function dependencyEndpoint(state: DependencyState, selector: OperationSelector, dependencies?: Set<string>): Address {
  if (selector.kind === "id") return { entity: "card", id: selector.id };
  if (selector.kind === "local") return reference(state, "card", selector.localId);
  const key = referenceKey("card", scopeReference(state, selector.scopeId), selector.system, selector.externalId);
  const previous = state.bindingWrites.get(key);
  if (previous && dependencies) dependencies.add(previous);
  return { entity: "card", id: state.references.get(key) ?? `external:${key}` };
}

function operationTarget(state: DependencyState, operation: ChangeOperation): Address {
  if (operation.entity === "sourcePlan") return { entity: "sourcePlanBaseline", id: operation.after.baselineId };
  if (operation.entity === "cardDependency") return dependencyEndpoint(state, operation.after.cardId);
  if (operation.entity === "externalRef" && operation.op === "set") {
    const after = operation.after;
    const entityId = reference(state, after.entityType, after.entityId).id;
    const existing = state.snapshot.externalRefs.find((row) => row.entityType === after.entityType && row.entityId === entityId && row.system === after.system);
    return { entity: "externalRef", id: existing?.id ?? ownString(state.supply.ids, operation.operationId) ?? `new:${operation.operationId}` };
  }
  if (operation.op === "upsert") return externalTarget(state, operation);
  if (operation.entity === "remoteWorkItemLink") { const existing = state.snapshot.remoteWorkItemLinks.find((row) => row.externalRefId === reference(state, "githubExternalRef", operation.after.externalRefId).id); return { entity: operation.entity, id: existing?.id ?? ownString(state.supply.ids, operation.operationId)! }; }
  if (operation.entity === "cardPersona" || operation.entity === "cardAnnotation") return reference(state, "card", operation.after.cardId);
  if (operation.entity === "sourceLink") return reference(state, "card", operation.after.cardId);
  if (operation.op === "create" || operation.op === "import") return { entity: operation.entity, id: ownString(state.supply.ids, operation.operationId) ?? `new:${operation.operationId}` };
  const selector = operation.selector;
  if (selector?.kind === "id") return { entity: operation.entity, id: selector.id };
  if (selector?.kind === "local") return reference(state, operation.entity, selector.localId);
  if (selector?.kind === "externalRef") return { entity: operation.entity, id: state.references.get(referenceKey(operation.entity, scopeReference(state, selector.scopeId), selector.system, selector.externalId)) ?? `external:${operation.entity}:${selector.scopeId}:${selector.system}:${selector.externalId}` };
  return reference(state, operation.entity, operation.entityId!);
}

function readAddress(state: DependencyState, target: Address, dependencies: Set<string>): void {
  const previous = state.previous.get(addressKey(target));
  if (previous) dependencies.add(previous);
  const owner = state.owners.get(addressKey(target));
  if (owner) readAddress(state, owner, dependencies);
  readRemainingOwner(state, target, dependencies);
  if (target.entity === "card") {
    const seen = new Set<string>();
    let card = state.cards.get(target.id);
    while (card && !seen.has(card.id)) {
      seen.add(card.id);
      const parentWrite = state.previous.get(`card:${card.id}`);
      if (parentWrite) dependencies.add(parentWrite);
      readMap(state, card.storyMapId, dependencies);
      card = card.parentId ? state.cards.get(card.parentId) : undefined;
    }
  }
  if (target.entity === "release") { const map = state.releases.get(target.id); if (map) readMap(state, map, dependencies); }
  if (target.entity === "persona") { const map = state.personas.get(target.id); if (map) readMap(state, map, dependencies); }
}

function readRemainingOwner(state: DependencyState, target: Address, dependencies: Set<string>): void {
  if (["card", "release", "persona", "storyMap"].includes(target.entity)) return;
  const collection = CHANGE_COLLECTIONS[target.entity as keyof typeof CHANGE_COLLECTIONS];
  const row = collection && (state.snapshot[collection] ?? []).find((entry) => entry.id === target.id);
  if (!row) return;
  if ("storyMapId" in row && row.storyMapId) readMap(state, row.storyMapId, dependencies);
  if ("cardId" in row && row.cardId) readAddress(state, reference(state, "card", row.cardId), dependencies);
  if ("roadmapId" in row) readAddress(state, reference(state, "roadmap", row.roadmapId), dependencies);
  if ("roadmapCardId" in row) readAddress(state, reference(state, "roadmapCard", row.roadmapCardId), dependencies);
}

function readMap(state: DependencyState, id: string, dependencies: Set<string>): void {
  id = reference(state, "storyMap", id).id;
  const previous = state.previous.get(`storyMap:${id}`);
  if (previous) dependencies.add(previous);
}

function readPayload(state: DependencyState, operation: ChangeOperation, target: Address, dependencies: Set<string>): void {
  const after = operation.after;
  if (operation.entity === "remoteWorkItemLink") {
    readGithub(state, reference(state, "githubExternalRef", operation.after.externalRefId).id, dependencies);
    const releaseId = operation.after.baseline?.acknowledgedLocal.releaseId;
    if (releaseId) readAddress(state, reference(state, "release", releaseId), dependencies);
  }
  if (operation.entity === "sourcePlan") for (const entry of operation.after.entries) {
    readAddress(state, { entity: "card", id: entry.cardId }, dependencies);
    if (entry.binding) readAddress(state, { entity: "externalRef", id: entry.binding.id }, dependencies);
  }
  if (operation.entity === "cardDependency") {
    for (const selector of [operation.after.cardId, operation.after.prerequisiteCardId]) readAddress(state, dependencyEndpoint(state, selector, dependencies), dependencies);
    const mapId = state.cards.get(target.id)?.storyMapId;
    const graphWrite = mapId && state.previous.get(`cardDependencyGraph:${mapId}`);
    if (graphWrite) dependencies.add(graphWrite);
  }
  if (operation.selector?.kind === "externalRef") {
    const selector = operation.selector;
    const previous = state.bindingWrites.get(referenceKey(operation.entity, scopeReference(state, selector.scopeId), selector.system, selector.externalId));
    if (previous) dependencies.add(previous);
  }
  if (operation.entity === "workflowStatus" && (operation.op === "delete" || operation.op === "update")) for (const card of state.cards.values()) readAddress(state, { entity: "card", id: card.id }, dependencies);
  if (operation.entity === "workflowStatus" && operation.op === "delete" && operation.after.replacementBefore) readAddress(state, { entity: "workflowStatus", id: operation.after.replacementBefore.id }, dependencies);
  const fields = { cardId: "card", personaId: "persona", annotationId: "annotation", syncRunId: "syncRun", connectionId: "connection", roadmapId: "roadmap", roadmapCardId: "roadmapCard", columnId: "roadmapColumn", swimlaneId: "roadmapSwimlane" };
  for (const [field, entity] of Object.entries(fields)) if (field in after) { const id = after[field as keyof typeof after]; if (typeof id === "string") readAddress(state, reference(state, entity, id), dependencies); }
  if (operation.entity === "card" && operation.op === "bulk") {
    for (const card of operation.after.cards) readAddress(state, reference(state, "card", card.id), dependencies);
    const patch = operation.after.patch;
    if (patch.releaseId) readAddress(state, reference(state, "release", patch.releaseId), dependencies);
    for (const field of ["addPersonaId", "removePersonaId", "addAnnotationId", "removeAnnotationId"] as const) if (patch[field]) readAddress(state, reference(state, field.includes("Persona") ? "persona" : "annotation", patch[field]), dependencies);
  }
  if (operation.entity === "roadmapReference") readAddress(state, reference(state, operation.after.targetType, operation.after.targetId), dependencies);
  if (operation.entity === "externalRef" && operation.op === "set") readAddress(state, reference(state, operation.after.entityType, operation.after.entityId), dependencies);
  if ("storyMapId" in after && after.storyMapId) readMap(state, after.storyMapId, dependencies);
  if ("parentId" in after && after.parentId) readAddress(state, reference(state, "card", after.parentId), dependencies);
  if ("releaseId" in after && after.releaseId) readAddress(state, reference(state, "release", after.releaseId), dependencies);
  if (operation.entity === "release" && "position" in after && after.position !== undefined) {
    const map = "storyMapId" in after ? after.storyMapId : state.releases.get(target.id);
    for (const [id, owner] of state.releases) if (owner === map) readAddress(state, { entity: "release", id }, dependencies);
  }
  if (operation.entity === "sourceLink" && operation.op === "link" && operation.after.kind === "chunk" && "chunk" in operation.after && operation.after.chunk.kind === "import") dependencies.add(operation.after.chunk.operationId);
  readPayloadContext(state, operation, target, dependencies);
}

function readGithub(state: DependencyState, id: string, dependencies: Set<string>): void {
  readAddress(state, { entity: "githubExternalRef", id }, dependencies);
  const identity = state.snapshot.githubLinks.find((link) => link.id === id);
  if (identity?.cardId) readAddress(state, { entity: "card", id: identity.cardId }, dependencies);
  if (identity?.releaseId) readAddress(state, { entity: "release", id: identity.releaseId }, dependencies);
}

function registerOperation(state: DependencyState, operation: ChangeOperation, target: Address, dependencies: Set<string>): void {
  registerPlacement(state, operation, target, dependencies);
  state.previous.set(addressKey(target), operation.operationId);
  if (operation.entity === "storyMapCopy" || operation.entity === "githubBoardImport") state.previous.set(`storyMap:${target.id}`, operation.operationId);
  const owner = rootOwner(state, inferredOwner(state, operation, target));
  if (owner && addressKey(owner) !== addressKey(target)) { readAddress(state, owner, dependencies); state.owners.set(addressKey(target), owner); state.previous.set(addressKey(owner), operation.operationId); }
  if ((operation.op === "create" || operation.op === "upsert") && operation.entityId) state.aliases.set(operation.entityId, { ...target, entity: operation.entity === "storyMapCopy" || operation.entity === "githubBoardImport" ? "storyMap" : target.entity });
  if (operation.op === "upsert") {
    const selector = operation.selector;
    state.references.set(referenceKey(operation.entity, scopeReference(state, selector.scopeId), selector.system, selector.externalId), target.id);
  }
  const after = operation.after;
  if (operation.entity === "release" && "storyMapId" in after && after.storyMapId) state.releases.set(target.id, after.storyMapId);
  if (operation.entity === "persona" && "storyMapId" in after) state.personas.set(target.id, after.storyMapId ?? null);
  registerExternalBindings(state, operation, target);
  registerCompositeEffects(state, operation, target);
  registerGithubEffects(state, operation, target);
  registerRemainingEffects(state, operation, target, dependencies);
}

function registerPlacement(state: DependencyState, operation: ChangeOperation, target: Address, dependencies: Set<string>): void {
  if (operation.entity === "card" && ["create", "update", "move", "upsert"].includes(operation.op)) registerCardPlacement(state, operation, target, dependencies);
  if (operation.entity !== "release" || operation.op === "delete") return;
  const before = state.releasePositions.get(target.id);
  const after = operation.after;
  if (!before && "storyMapId" in after && after.storyMapId) {
    state.releasePositions.set(target.id, { id: target.id, storyMapId: after.storyMapId, position: after.position ?? [...state.releasePositions.values()].filter((entry) => entry.storyMapId === after.storyMapId).length });
  } else if (before && "position" in after && after.position !== undefined && after.position <= [...state.releasePositions.values()].filter((entry) => entry.storyMapId === before.storyMapId && entry.id !== before.id).length) {
    for (const changed of placeRelease([...state.releasePositions.values()], before, after.position)) if (changed.id !== target.id) registerSiblingWrite(state, operation, { entity: "release", id: changed.id }, dependencies);
  }
}

function registerCardPlacement(state: DependencyState, operation: Extract<ChangeOperation, { entity: "card" }>, target: Address, dependencies: Set<string>): void {
  const before = state.cards.get(target.id);
  const after = operation.after;
  if (!("level" in after || before)) return;
  const map = "storyMapId" in after ? after.storyMapId : before?.storyMapId;
  if (!map) return;
  const oldParent = before?.parentId ?? null;
  const parentId = "parentId" in after && after.parentId !== undefined ? after.parentId === null ? null : reference(state, "card", after.parentId).id : oldParent;
  const card: CardPlacement & Pick<Card, "status" | "parked" | "archived"> = { archived: "archived" in after ? after.archived ?? before?.archived : before?.archived, status: "status" in after ? after.status ?? before?.status ?? "todo" : before?.status ?? "todo", parked: "parked" in after ? after.parked ?? before?.parked ?? false : before?.parked ?? false, id: target.id, storyMapId: map, parentId, level: "level" in after ? after.level : before!.level, position: "position" in after && after.position !== undefined ? after.position : before?.position ?? [...state.cards.values()].filter((entry) => entry.storyMapId === map && entry.parentId === parentId).length, createdAt: before?.createdAt ?? state.supply.createdAt };
  const positions = new Map([...state.cards.values()].map((entry) => [entry.id, entry.position]));
  state.cards.set(target.id, card);
  if (!before || operation.op === "update" || !(operation.op === "move" || "position" in after && after.position !== undefined || oldParent !== parentId)) return;
  placeCard([...state.cards.values()], card, oldParent, card.position);
  for (const entry of state.cards.values()) if (entry.id !== target.id && positions.get(entry.id) !== entry.position) registerSiblingWrite(state, operation, { entity: "card", id: entry.id }, dependencies);
}

function registerSiblingWrite(state: DependencyState, operation: ChangeOperation, target: Address, dependencies: Set<string>): void {
  readAddress(state, target, dependencies);
  state.previous.set(addressKey(target), operation.operationId);
}

function removeGithubIdentities(state: DependencyState, ids: Set<string>): void {
  state.snapshot.githubLinks = state.snapshot.githubLinks.filter((row) => !ids.has(row.id));
  state.snapshot.externalRefs = state.snapshot.externalRefs.filter((row) => !ids.has(row.id));
  state.snapshot.sourceLinks = state.snapshot.sourceLinks.filter((row) => row.kind !== "github" || !ids.has(row.externalRefId));
  for (const id of ids) { state.githubCards.delete(id); state.owners.delete(`githubExternalRef:${id}`); }
  for (const [evidence, identity] of state.githubEvidence) if (ids.has(identity)) state.githubEvidence.delete(evidence);
}

function registerGithubIdentity(state: DependencyState, operation: Extract<ChangeOperation, { entity: "githubExternalRef" }>, target: Address): void {
  if (operation.op === "delete") { removeGithubIdentities(state, new Set([target.id])); return; }
  const fields = operation.after;
  const locator = parseWorkItemLocator(fields.provider ?? "github", fields.externalId)!;
  const entityId = reference(state, fields.entityType, fields.entityId).id;
  const cardId = fields.entityType === "card" ? entityId : undefined;
  const previous = state.snapshot.githubLinks.find((row) => row.id === target.id);
  const row = { id: target.id, ...(locator.provider === "github" ? {} : { provider: locator.provider }), ...(cardId ? { cardId } : { releaseId: entityId }), repo: locator.repo, ...(locator.resource === "issues" ? { issueNumber: locator.number } : {}), url: locator.url, syncState: "unsynced" as const };
  if (previous) Object.assign(previous, row); else state.snapshot.githubLinks.push(row);
  const canonical = state.snapshot.externalRefs.find((ref) => ref.id === target.id);
  const { provider: _provider, ...identityFields } = fields;
  const ref = { ...identityFields, entityId, scopeId: scopeReference(state, fields.scopeId), id: target.id, system: fields.provider ?? "github", syncedVersion: 1, createdAt: state.supply.createdAt };
  if (canonical) Object.assign(canonical, ref); else state.snapshot.externalRefs.push(ref);
  state.owners.set(`githubExternalRef:${target.id}`, { entity: fields.entityType, id: entityId });
  const evidence = state.snapshot.sourceLinks.filter((link) => link.kind === "github" && link.externalRefId === target.id).map((link) => link.cardId);
  state.githubCards.set(target.id, new Set([...(cardId && locator.resource === "issues" ? [cardId] : []), ...evidence]));
}

function registerGithubEffects(state: DependencyState, operation: ChangeOperation, target: Address): void {
  if (operation.entity !== "sourceLink" || operation.after.kind !== "github") return;
  if (operation.op === "link") {
    const id = operation.after.externalRefId;
    state.githubCards.get(id)?.add(target.id);
    const evidenceId = ownString(state.supply.ids, operation.operationId);
    if (evidenceId && !state.githubEvidence.has(evidenceId)) {
      const identity = state.snapshot.githubLinks.find((row) => row.id === id);
      if (identity && identity.cardId !== target.id && !state.snapshot.sourceLinks.some((row) => row.kind === "github" && row.externalRefId === id && row.cardId === target.id)) {
        state.githubEvidence.set(evidenceId, id);
        state.snapshot.sourceLinks.push({ kind: "github", id: evidenceId, cardId: target.id, externalRefId: id, repoFullName: identity.repo, issueNumber: identity.issueNumber!, url: identity.url });
      }
    }
    return;
  }
  const identity = state.snapshot.githubLinks.find((link) => link.id === operation.after.id && link.cardId === target.id);
  if (identity) {
    state.previous.set(`githubExternalRef:${identity.id}`, operation.operationId);
    for (const id of state.githubCards.get(identity.id) ?? []) state.previous.set(`card:${id}`, operation.operationId);
    removeGithubIdentities(state, new Set([identity.id]));
  } else {
    const id = state.githubEvidence.get(operation.after.id);
    if (id && state.snapshot.githubLinks.find((row) => row.id === id)?.cardId !== target.id) state.githubCards.get(id)?.delete(target.id);
    state.githubEvidence.delete(operation.after.id);
    state.snapshot.sourceLinks = state.snapshot.sourceLinks.filter((row) => row.id !== operation.after.id);
  }
}

function rootOwner(state: DependencyState, owner: Address | undefined): Address | undefined {
  const seen = new Set<string>();
  while (owner && state.owners.has(addressKey(owner))) { const key = addressKey(owner); if (seen.has(key)) return owner; seen.add(key); owner = state.owners.get(key); }
  return owner;
}

function registerRemainingEffects(state: DependencyState, operation: ChangeOperation, target: Address, dependencies: Set<string>): void {
  const affected = new Set<string>();
  if (operation.entity === "workflowStatus" && (operation.op === "delete" || operation.op === "update")) for (const card of operation.after.affectedCards ?? []) affected.add(card.id);
  if (operation.entity === "card" && operation.op === "delete" && operation.after.selection) return registerSelectedDeletionEffects(state, operation, dependencies);
  registerDependencyEffects(state, operation, target, dependencies);
  registerCardStructuralEffects(state, operation, target, dependencies);
  if (operation.entity === "persona" && operation.op === "delete") for (const link of state.snapshot.cardPersonas) if (link.personaId === target.id) affected.add(link.cardId);
  if (operation.entity === "annotation" && operation.op === "delete") for (const link of state.snapshot.cardAnnotations) if (link.annotationId === target.id) affected.add(link.cardId);
  if (operation.entity === "release" && operation.op === "delete") for (const card of state.snapshot.cards) if (card.releaseId === target.id) affected.add(card.id);
  if (operation.entity === "githubExternalRef" || (operation.op === "delete" && (operation.entity === "release" || operation.entity === "card"))) {
    const identities = state.snapshot.githubLinks.filter((row) => operation.entity === "githubExternalRef" ? row.id === target.id : operation.entity === "card" ? row.cardId === target.id : row.releaseId === target.id);
    for (const row of identities) {
      if (operation.entity !== "githubExternalRef") readAddress(state, { entity: "githubExternalRef", id: row.id }, dependencies);
      state.previous.set(`githubExternalRef:${row.id}`, operation.operationId);
      for (const card of state.githubCards.get(row.id) ?? []) if (card !== target.id) affected.add(card);
    }
    if (operation.entity !== "githubExternalRef") removeGithubIdentities(state, new Set(identities.map((row) => row.id)));
  }
  if (operation.entity === "card" && operation.op === "bulk") { registerBulkEffects(state, operation); for (const card of operation.after.cards) affected.add(reference(state, "card", card.id).id); }
  if (operation.entity === "cardPersona") {
    const cardId = target.id; const personaId = reference(state, "persona", operation.after.personaId).id;
    state.snapshot.cardPersonas = state.snapshot.cardPersonas.filter((row) => row.cardId !== cardId || row.personaId !== personaId);
    if (operation.op === "set") state.snapshot.cardPersonas.push({ id: ownString(state.supply.ids, operation.operationId) ?? `new:${operation.operationId}`, cardId, personaId, createdAt: state.supply.createdAt });
  }
  if (operation.entity === "cardAnnotation") {
    const cardId = target.id; const annotationId = reference(state, "annotation", operation.after.annotationId).id;
    state.snapshot.cardAnnotations = state.snapshot.cardAnnotations.filter((row) => row.cardId !== cardId || row.annotationId !== annotationId);
    if (operation.op === "set") state.snapshot.cardAnnotations.push({ id: ownString(state.supply.ids, operation.operationId) ?? `new:${operation.operationId}`, cardId, annotationId, createdAt: state.supply.createdAt });
  }
  if (operation.entity === "githubExternalRef") {
    registerGithubIdentity(state, operation, target);
    for (const card of state.githubCards.get(target.id) ?? []) affected.add(card);
  }
  for (const id of affected) registerSiblingWrite(state, operation, { entity: "card", id }, dependencies);
}

function registerDependencyEffects(state: DependencyState, operation: ChangeOperation, target: Address, dependencies: Set<string>): void {
  if (operation.entity === "cardDependency") {
    const prerequisiteCardId = dependencyEndpoint(state, operation.after.prerequisiteCardId).id;
    const existing = state.snapshot.cardDependencies.find((row) => row.cardId === target.id && row.prerequisiteCardId === prerequisiteCardId);
    if (operation.op === "set" && !existing) state.snapshot.cardDependencies.push({ id: ownString(state.supply.ids, operation.operationId)!, cardId: target.id, prerequisiteCardId, createdAt: state.supply.createdAt });
    if (operation.op === "unset" && existing) state.snapshot.cardDependencies = state.snapshot.cardDependencies.filter((row) => row.id !== existing.id);
    if ((operation.op === "set") !== Boolean(existing)) {
      const mapId = state.cards.get(target.id)?.storyMapId;
      if (mapId) state.previous.set(`cardDependencyGraph:${mapId}`, operation.operationId);
    }
  }
  if (operation.entity !== "card" || operation.op !== "delete") return;
  const mapId = state.cards.get(target.id)?.storyMapId;
  const previous = mapId && state.previous.get(`cardDependencyGraph:${mapId}`);
  if (previous) dependencies.add(previous);
  const incident = state.snapshot.cardDependencies.filter((row) => row.cardId === target.id || row.prerequisiteCardId === target.id);
  for (const edge of incident) if (edge.cardId !== target.id) registerSiblingWrite(state, operation, { entity: "card", id: edge.cardId }, dependencies);
  state.snapshot.cardDependencies = state.snapshot.cardDependencies.filter((row) => row.cardId !== target.id && row.prerequisiteCardId !== target.id);
  if (incident.length && mapId) state.previous.set(`cardDependencyGraph:${mapId}`, operation.operationId);
}

function registerCardStructuralEffects(state: DependencyState, operation: ChangeOperation, target: Address, dependencies: Set<string>): void {
  if (operation.entity !== "card") return;
  const owner = state.owners.get(addressKey(target));
  if (owner?.entity === "storyMap" && ["park", "unpark", "delete", "move"].includes(operation.op)) {
    for (const [key, candidateOwner] of state.owners) if (key.startsWith("card:") && key !== addressKey(target) && candidateOwner.entity === owner.entity && candidateOwner.id === owner.id) {
      const previous = state.previous.get(key);
      if (previous) dependencies.add(previous);
    }
  }
  const existing = state.cards.get(target.id);
  if (existing && operation.op === "archive") existing.archived = true;
  if (existing && operation.op === "unarchive") { existing.archived = false; if (!state.snapshot.remoteWorkItemLinks.some((link) => link.cardId === existing.id)) existing.status = operation.after.status; }
  if (existing && operation.op === "unpark") {
    const active = visibleCards([...state.cards.values()] as Card[]).filter((row) => row.storyMapId === existing.storyMapId && row.level === "activity" && row.id !== existing.id);
    for (const row of state.cards.values()) if (row.storyMapId === existing.storyMapId && row.level === "activity" && row.id !== existing.id) readAddress(state, { entity: "card", id: row.id }, dependencies);
    existing.parked = false; existing.parentId = null; existing.position = Math.max(-1, ...active.map((row) => row.position)) + 1;
  }
  if (operation.op !== "delete" && operation.op !== "park") return;
  const card = state.cards.get(target.id);
  if (!card) return;
  const strategy = operation.op === "delete" ? operation.after.strategy : operation.after.childStrategy;
  const all = [...state.cards.values()].filter((row) => row.storyMapId === card.storyMapId);
  const order = (rows: CardPlacement[]) => rows.sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  const children = order(all.filter((row) => row.parentId === card.id));
  if (children.length) {
    const visible = new Set(visibleCards([...state.cards.values()] as Card[]).map((row) => row.id));
    for (const row of all) if (row.id !== card.id && row.parentId === card.parentId && row.level === card.level) readAddress(state, { entity: "card", id: row.id }, dependencies);
    const siblings = order(all.filter((row) => row.parentId === card.parentId && row.level === card.level && (row.id === card.id || visible.has(row.id))));
    const neighbor = strategy === "unassign" ? undefined : siblings[siblings.indexOf(card) + (strategy === "reassign-left" ? -1 : 1)];
    if (strategy === "unassign" || neighbor) {
      const retained = neighbor ? children : all.filter((row) => { let parent = row.parentId; const seen = new Set<string>(); while (parent && !seen.has(parent)) { if (parent === card.id) return true; seen.add(parent); parent = state.cards.get(parent)?.parentId ?? null; } return false; });
      const base = neighbor ? Math.max(-1, ...all.filter((row) => row.parentId === neighbor.id).map((row) => row.position)) + 1 : 0;
      retained.forEach((row, index) => { registerSiblingWrite(state, operation, { entity: "card", id: row.id }, dependencies); row.parentId = neighbor?.id ?? null; if (neighbor) row.position = base + index; });
      if (!neighbor) registerReindex(state, operation, card.storyMapId, null, dependencies);
    }
  }
  if (operation.op === "park") card.parked = true;
  if (operation.op === "delete") { state.cards.delete(card.id); registerReindex(state, operation, card.storyMapId, card.parentId, dependencies); }
}

function registerReindex(state: DependencyState, operation: ChangeOperation, mapId: string, parentId: string | null, dependencies: Set<string>): void {
  [...state.cards.values()].filter((row) => row.storyMapId === mapId && row.parentId === parentId).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)).forEach((row, position) => { if (row.position !== position) { registerSiblingWrite(state, operation, { entity: "card", id: row.id }, dependencies); row.position = position; } });
}

function registerCompositeEffects(state: DependencyState, operation: ChangeOperation, target: Address): void {
  if (operation.entity === "storyMapCopy") {
    const ids = ownValue(state.supply.copyIds, operation.operationId) ?? {};
    for (const [entity, collection] of Object.entries(CHANGE_COLLECTIONS)) for (const row of (state.snapshot[collection as typeof CHANGE_COLLECTIONS[keyof typeof CHANGE_COLLECTIONS]] ?? [])) {
      const id = ownString(ids, row.id);
      if (!id) continue;
      state.previous.set(`${entity}:${id}`, operation.operationId);
      if (entity !== "storyMap") state.owners.set(`${entity}:${id}`, { entity: "storyMap", id: target.id });
    }
    for (const row of state.cards.values()) if (ownString(ids, row.id)) state.cards.set(ownString(ids, row.id)!, { ...row, id: ownString(ids, row.id)!, storyMapId: target.id, parentId: row.parentId ? ownString(ids, row.parentId) ?? row.parentId : null });
  }
  if (operation.entity === "githubBoardImport") {
    const mapId = operation.after.input.storyMapId ?? target.id;
    for (const [key, id] of Object.entries(ownValue(state.supply.boardIds, operation.operationId) ?? {})) {
      const entity = key.startsWith("github:") ? "githubExternalRef" : key.startsWith("remote:") ? "remoteWorkItemLink" : key.startsWith("connection:") ? "connection" : "card";
      state.previous.set(`${entity}:${id}`, operation.operationId);
      state.owners.set(`${entity}:${id}`, { entity: "storyMap", id: mapId });
    }
    state.previous.set(`storyMap:${mapId}`, operation.operationId);
  }
}

function registerBulkEffects(state: DependencyState, operation: Extract<ChangeOperation, { entity: "card"; op: "bulk" }>): void {
  const patch = operation.after.patch;
  for (const target of operation.after.cards) {
    const cardId = reference(state, "card", target.id).id;
    const card = state.cards.get(cardId);
    if (card && patch.status !== undefined) card.status = patch.status;
    const snapshotCard = state.snapshot.cards.find((row) => row.id === cardId);
    if (snapshotCard && patch.releaseId !== undefined) snapshotCard.releaseId = patch.releaseId === null ? null : reference(state, "release", patch.releaseId).id;
    for (const [add, entity, value] of [[true, "persona", patch.addPersonaId], [false, "persona", patch.removePersonaId], [true, "annotation", patch.addAnnotationId], [false, "annotation", patch.removeAnnotationId]] as const) {
      if (!value) continue;
      const id = reference(state, entity, value).id;
      if (entity === "persona") {
        state.snapshot.cardPersonas = state.snapshot.cardPersonas.filter((row) => row.cardId !== cardId || row.personaId !== id);
        if (add) state.snapshot.cardPersonas.push({ id: ownString(ownValue(ownValue(state.supply.bulkRelationshipIds, operation.operationId), target.id), "persona") ?? `${operation.operationId}:${cardId}:persona`, cardId, personaId: id, createdAt: state.supply.createdAt });
      } else {
        state.snapshot.cardAnnotations = state.snapshot.cardAnnotations.filter((row) => row.cardId !== cardId || row.annotationId !== id);
        if (add) state.snapshot.cardAnnotations.push({ id: ownString(ownValue(ownValue(state.supply.bulkRelationshipIds, operation.operationId), target.id), "annotation") ?? `${operation.operationId}:${cardId}:annotation`, cardId, annotationId: id, createdAt: state.supply.createdAt });
      }
    }
  }
}

function scopeReference(state: DependencyState, id: string): string {
  return state.snapshot.projects.some((project) => project.id === id) ? id : reference(state, "storyMap", id).id;
}

function registerExternalBindings(state: DependencyState, operation: ChangeOperation, target: Address): void {
  if (operation.entity === "card" && operation.op === "delete" && operation.after.selection) {
    for (const card of operation.after.selection.cards) registerExternalBindings(state, { ...operation, after: { strategy: operation.after.strategy } }, reference(state, "card", card.id));
    return;
  }
  if (operation.op === "delete" && ["card", "release", "persona"].includes(operation.entity)) {
    for (const row of state.snapshot.externalRefs.filter((ref) => ref.entityType === operation.entity && ref.entityId === target.id)) {
      const key = referenceKey(row.entityType, row.scopeId, row.system, row.externalId);
      state.references.delete(key);
      state.bindingWrites.set(key, operation.operationId);
    }
    state.snapshot.externalRefs = state.snapshot.externalRefs.filter((ref) => ref.entityType !== operation.entity || ref.entityId !== target.id);
    return;
  }
  if (operation.op === "upsert") {
    const selector = operation.selector;
    const scopeId = scopeReference(state, selector.scopeId);
    const key = referenceKey(operation.entity, scopeId, selector.system, selector.externalId);
    state.references.set(key, target.id);
    state.bindingWrites.set(key, operation.operationId);
    if (!state.snapshot.externalRefs.some((row) => row.entityType === operation.entity && row.entityId === target.id && row.system === selector.system)) state.snapshot.externalRefs.push({ id: ownString(state.supply.externalRefIds, operation.operationId) ?? `new-ref:${operation.operationId}`, entityType: operation.entity, entityId: target.id, scopeId, system: selector.system, externalId: selector.externalId, syncedVersion: 1, createdAt: state.supply.createdAt });
    return;
  }
  if (operation.entity !== "externalRef") return;
  if (operation.op === "delete") {
    const row = state.snapshot.externalRefs.find((ref) => ref.id === target.id);
    if (!row) return;
    const key = referenceKey(row.entityType, row.scopeId, row.system, row.externalId);
    state.references.delete(key);
    state.bindingWrites.set(key, operation.operationId);
    state.snapshot.externalRefs = state.snapshot.externalRefs.filter((ref) => ref.id !== target.id);
  } else {
    const after = operation.after;
    const scopeId = scopeReference(state, after.scopeId);
    const entityId = reference(state, after.entityType, after.entityId).id;
    const key = referenceKey(after.entityType, scopeId, after.system, after.externalId);
    state.references.set(key, entityId);
    state.bindingWrites.set(key, operation.operationId);
    if (!state.snapshot.externalRefs.some((row) => row.id === target.id)) state.snapshot.externalRefs.push({ ...after, scopeId, entityId, id: target.id, syncedVersion: 1, createdAt: state.supply.createdAt });
  }
}

function registerSelectedDeletionEffects(state: DependencyState, operation: Extract<ChangeOperation, { entity: "card"; op: "delete" }>, dependencies: Set<string>): void {
  const selection = normalizeDeletionSelection(operation.after.selection!, (entity, id) => reference(state, entity, id).id);
  const placement = selectedDeletionEffects({ ...state.snapshot, cards: [...state.cards.values()] as Card[] }, selection.storyMapId, selection.cards.map((row) => row.id), operation.after.strategy);
  for (const id of placement.requiredIds) registerSiblingWrite(state, operation, { entity: "card", id }, dependencies);
  for (const card of selection.cards) {
    registerDependencyEffects(state, operation, { entity: "card", id: card.id }, dependencies);
    state.cards.delete(card.id);
  }
  const selected = new Set(selection.cards.map((card) => card.id));
  const identities = state.snapshot.githubLinks.filter((row) => row.cardId && selected.has(row.cardId));
  for (const identity of identities) {
    readAddress(state, { entity: "githubExternalRef", id: identity.id }, dependencies);
    state.previous.set(`githubExternalRef:${identity.id}`, operation.operationId);
    for (const id of state.githubCards.get(identity.id) ?? []) if (!selected.has(id)) registerSiblingWrite(state, operation, { entity: "card", id }, dependencies);
  }
  removeGithubIdentities(state, new Set(identities.map((row) => row.id)));
  state.snapshot.cards = state.snapshot.cards.filter((card) => !selected.has(card.id));
  for (const card of placement.cards) state.cards.set(card.id, card);
}

function readPayloadContext(state: DependencyState, operation: ChangeOperation, target: Address, dependencies: Set<string>): void {
  if (operation.context?.storyMapId) readMap(state, operation.context.storyMapId, dependencies);
  const product = state.snapshot.productContexts.find((entry) => entry.id === operation.context?.productContextId);
  if (product?.storyMapId) readMap(state, product.storyMapId, dependencies);
  for (const id of operation.context?.cardIds ?? []) readAddress(state, { entity: "card", id }, dependencies);
  if (operation.entity === "sourceLink" && operation.op === "link" && operation.after.kind === "github") readGithub(state, operation.after.externalRefId, dependencies);
  for (const source of operation.sources ?? []) if (source.kind === "github") readGithub(state, source.externalRefId, dependencies);
  if (operation.entity === "sourceLink" && operation.op === "unlink" && operation.after.kind === "github") {
    const identity = state.snapshot.githubLinks.find((link) => link.id === operation.after.id && link.cardId === target.id);
    if (identity) for (const id of state.githubCards.get(identity.id) ?? []) readAddress(state, { entity: "card", id }, dependencies);
  }
}
