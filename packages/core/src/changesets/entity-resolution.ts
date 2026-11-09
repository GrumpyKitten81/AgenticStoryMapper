import { personaSchema, type ChangeOperation, type Card, type Persona, type OperationSelector } from "@storymapper/contracts";
import type { ResolutionContext } from "@storymapper/core/changesets/resolution-context";
import { allocatedId, assertBaseline, bumpVersion, cardOwner, mapOwner, projectOwner, readDependency, referenceId, refuse, resolvedRootVersion } from "@storymapper/core/changesets/resolution-context";
import { moveCardPosition, moveReleasePosition, parentReference, releaseReference } from "@storymapper/core/changesets/position-resolution";

type OperationFor<E extends ChangeOperation["entity"], O extends ChangeOperation["op"]> = Extract<ChangeOperation, { entity: E; op: O }>;

export function targetId(context: ResolutionContext): string {
  const { operation } = context;
  if (operation.entity !== "card" && operation.entity !== "release" && operation.entity !== "persona" && operation.entity !== "storyMap") refuse(context, "Operation has no entity selector.");
  if (!operation.selector && !operation.entityId) refuse(context, "Target identity is required.");
  return selectedEntityId(context, operation.entity, operation.selector ?? { kind: "local", localId: operation.entityId! });
}

export function selectedEntityId(context: ResolutionContext, entity: "card" | "release" | "persona" | "storyMap", selector: OperationSelector): string {
  if (selector.kind === "id") {
    const rows = entity === "card" ? context.state.cards : entity === "release" ? context.state.releases : entity === "persona" ? context.state.personas : context.state.storyMaps;
    if (!rows.some((entry) => entry.id === selector.id)) refuse(context, `Persisted target does not exist: ${entity} ${selector.id}.`);
    return referenceId(context, entity, selector.id);
  }
  if (selector.kind === "local") return referenceId(context, entity, selector.localId);
  const scopeId = context.state.projects.some((entry) => entry.id === selector.scopeId) ? selector.scopeId : referenceId(context, "storyMap", selector.scopeId);
  const ref = context.state.externalRefs.find((entry) => entry.entityType === entity && entry.scopeId === scopeId && entry.system === selector.system && entry.externalId === selector.externalId);
  if (!ref) refuse(context, `External ${entity} reference ${selector.system}:${selector.externalId} does not exist.`);
  readDependency(context, "externalRef", ref.id);
  const id = referenceId(context, entity, ref.entityId);
  const owner = entity === "card" ? context.state.cards.find((entry) => entry.id === id) : entity === "release" ? context.state.releases.find((entry) => entry.id === id) : entity === "persona" ? context.state.personas.find((entry) => entry.id === id) : undefined;
  const scope = owner && (owner.storyMapId ?? ("projectId" in owner ? owner.projectId : undefined));
  if (scope !== scopeId) refuse(context, "External reference scope disagrees with the persisted owner.");
  return id;
}

export function createMap(context: ResolutionContext): void {
  const { after } = context.operation as OperationFor<"storyMap", "create">;
  projectOwner(context, after.projectId);
  context.state.storyMaps.push({ ...after, id: allocatedId(context), version: 1, estimationUnit: "points", cardKeyPrefix: "LSM", createdAt: context.supply.createdAt, updatedAt: context.supply.createdAt });
}

export function updateMap(context: ResolutionContext): void {
  const { after } = context.operation as OperationFor<"storyMap", "update">;
  const id = targetId(context);
  mapOwner(context, id);
  validateConnection(context, after.defaultConnectionId);
  const map = context.state.storyMaps.find((entry) => entry.id === id)!;
  assertBaseline(context, map.version, map.id);
  Object.assign(map, after, { version: resolvedRootVersion(context, map.id), updatedAt: context.supply.createdAt });
}

function validateConnection(context: ResolutionContext, id: string | null | undefined): void {
  if (id && !context.state.connections.some((entry) => entry.id === id && entry.projectId === context.state.projectId)) refuse(context, "Default connection is unknown or foreign.");
}

export function createCard(context: ResolutionContext): void {
  const { after } = context.operation as OperationFor<"card", "create">;
  mapOwner(context, after.storyMapId);
  if (after.level === "note" && after.cardType) refuse(context, "Notes cannot have a Card type.");
  const parentId = parentReference(context, after.storyMapId, after.level, after.parentId ?? null);
  const releaseId = releaseReference(context, after.storyMapId, after.releaseId ?? null);
  const card: Card = { ...after, cardType: after.cardType ?? null, id: allocatedId(context), parentId, releaseId, version: 1, key: `NEW-${context.state.cards.filter((entry) => entry.key.startsWith("NEW-")).length + 1}`, description: after.description ?? "", status: after.status ?? "todo", archived: false, parked: false,
    position: after.position ?? context.state.cards.filter((entry) => entry.storyMapId === after.storyMapId && entry.parentId === parentId).length,
    creationOrigin: context.supply.creationOrigin, provenance: context.supply.creationOrigin, createdAt: context.supply.createdAt, updatedAt: context.supply.createdAt };
  context.state.cards.push(card);
}

export function updateCard(context: ResolutionContext): void {
  const { after } = context.operation as OperationFor<"card", "update">;
  const id = targetId(context);
  cardOwner(context, id);
  const card = context.state.cards.find((entry) => entry.id === id)!;
  if (card.level === "note" && after.cardType) refuse(context, "Notes cannot have a Card type.");
  if (after.status !== undefined && context.state.remoteWorkItemLinks.some((link) => link.cardId === card.id)) refuse(context, "GitHub owns this Card status. Detach its sync link before editing status.");
  assertBaseline(context, card.version, card.id);
  const addressedRef = deliveryReference(context, card);
  const releaseId = after.releaseId === undefined ? card.releaseId : releaseReference(context, card.storyMapId, after.releaseId);
  Object.assign(card, after, { releaseId, updatedAt: context.supply.createdAt });
  bumpVersion(context, card);
  if (addressedRef) { addressedRef.syncedVersion = card.version; context.publishedRefIds.add(addressedRef.id); }
}

function deliveryReference(context: ResolutionContext, card: Card) {
  const operation = context.operation as OperationFor<"card", "update">;
  if (operation.selector?.kind !== "externalRef" || operation.after.status === undefined) return;
  if (operation.before && operation.before.id !== card.id) refuse(context, "Reviewed external reference owner changed.");
  if (!context.state.workflowStatuses.some((status) => status.projectId === context.state.projectId && (status.storyMapId === null || status.storyMapId === card.storyMapId) && status.name === operation.after.status)) refuse(context, "Workflow Status name is not configured for this Story Map.");
  const selector = operation.selector;
  const ref = context.state.externalRefs.find((ref) => ref.entityType === "card" && ref.entityId === card.id && ref.scopeId === card.storyMapId && ref.system === selector.system && ref.externalId === selector.externalId)!;
  const externalBaseline = context.initialExternalVersions.get(ref.id);
  const rootBaseline = context.initialVersions.get(card.id);
  if (externalBaseline !== undefined && rootBaseline !== undefined && externalBaseline !== rootBaseline) refuse(context, "External reference baseline conflicts with current human changes.", "conflict");
  return ref;
}

export function moveCard(context: ResolutionContext): void {
  const { after } = context.operation as OperationFor<"card", "move">;
  const id = targetId(context);
  cardOwner(context, id);
  const card = context.state.cards.find((entry) => entry.id === id)!;
  assertBaseline(context, card.version, card.id);
  const oldParent = card.parentId;
  card.parentId = parentReference(context, card.storyMapId, card.level, after.parentId, id);
  if (after.releaseId !== undefined) card.releaseId = releaseReference(context, card.storyMapId, after.releaseId);
  moveCardPosition(context, card, oldParent, after.position);
  if (oldParent !== card.parentId) for (const link of context.state.remoteWorkItemLinks) if (link.cardId === card.id) link.parentOverrideLocal = true;
  bumpVersion(context, card);
  card.updatedAt = context.supply.createdAt;
}

export function createRelease(context: ResolutionContext): void {
  const { after } = context.operation as OperationFor<"release", "create"> | OperationFor<"release", "upsert">;
  mapOwner(context, after.storyMapId);
  context.state.releases.push({ ...after, id: allocatedId(context), version: 1, goal: after.goal ?? "", released: after.released ?? false, startDate: after.startDate ?? null, releaseDate: after.releaseDate ?? null, position: after.position ?? context.state.releases.filter((entry) => entry.storyMapId === after.storyMapId).length });
}

export function updateRelease(context: ResolutionContext): void {
  const { after } = context.operation as OperationFor<"release", "update">;
  const id = targetId(context);
  const release = context.state.releases.find((entry) => entry.id === id)!;
  mapOwner(context, release.storyMapId);
  assertBaseline(context, release.version, release.id);
  if (after.position !== undefined) moveReleasePosition(context, release, after.position);
  Object.assign(release, after, { version: resolvedRootVersion(context, release.id) });
}

export function createPersona(context: ResolutionContext): void {
  const { after } = context.operation as OperationFor<"persona", "create">;
  projectOwner(context, after.projectId);
  if (after.storyMapId) mapOwner(context, after.storyMapId);
  context.state.personas.push(personaSchema.parse({ ...after, id: allocatedId(context), version: 1, storyMapId: after.storyMapId ?? null, role: after.role ?? "User" }));
}

export function personaOwner(context: ResolutionContext, persona: Persona): void {
  projectOwner(context, persona.projectId);
  if (persona.storyMapId) mapOwner(context, persona.storyMapId);
}

export function updatePersona(context: ResolutionContext): void {
  const { after } = context.operation as OperationFor<"persona", "update">;
  const persona = context.state.personas.find((entry) => entry.id === targetId(context))!;
  personaOwner(context, persona);
  assertBaseline(context, persona.version, persona.id);
  Object.assign(persona, after, { version: resolvedRootVersion(context, persona.id) });
}
