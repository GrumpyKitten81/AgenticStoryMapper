import { isCardArchived } from "@storymapper/core/story-map/github-status";
import type { Card, ChangeOperation, ExternalRef, Persona, Release } from "@storymapper/contracts";
import { ownString } from "@storymapper/core/changesets/supply-values";
import type { ResolutionContext } from "@storymapper/core/changesets/resolution-context";
import { allocatedId, assertBaseline, bumpVersion, cardOwner, mapOwner, projectOwner, readDependency, refuse } from "@storymapper/core/changesets/resolution-context";
import { createCard, createPersona, createRelease, personaOwner } from "@storymapper/core/changesets/entity-resolution";
import { moveCardPosition, moveReleasePosition, parentReference, releaseReference } from "@storymapper/core/changesets/position-resolution";

type Upsert = Extract<ChangeOperation, { op: "upsert" }>;

export function upsertEntity(context: ResolutionContext): void {
  const operation = context.operation as Upsert;
  const { selector } = operation;
  const expectedScope = operation.entity === "persona" ? operation.after.storyMapId ?? operation.after.projectId : operation.after.storyMapId;
  if (selector.scopeId !== expectedScope) refuse(context, "External reference scope disagrees with entity ownership.");
  if (operation.entity === "persona") projectOwner(context, operation.after.projectId);
  if (operation.entity !== "persona" || operation.after.storyMapId) mapOwner(context, operation.after.storyMapId!);
  const refs = context.state.externalRefs.filter((entry) => entry.entityType === operation.entity && entry.scopeId === selector.scopeId && entry.system === selector.system && entry.externalId === selector.externalId);
  if (refs.length > 1) refuse(context, "External reference has conflicting bindings.", "conflict");
  const ref = refs[0];
  if (!ref) { createReferencedEntity(context, operation); return; }
  const entity = operation.entity === "card" ? context.state.cards.find((entry) => entry.id === ref.entityId) : operation.entity === "release" ? context.state.releases.find((entry) => entry.id === ref.entityId) : context.state.personas.find((entry) => entry.id === ref.entityId);
  if (!entity) refuse(context, "External reference points to an unknown entity.");
  const scope = "storyMapId" in entity ? entity.storyMapId : null;
  if ((scope ?? ("projectId" in entity ? entity.projectId : undefined)) !== selector.scopeId) refuse(context, "External reference binding has foreign ownership.");
  if (operation.entity === "card") cardOwner(context, entity.id);
  else if (operation.entity === "persona") personaOwner(context, entity as Persona);
  readDependency(context, operation.entity, entity.id);
  assertBaseline(context, entity.version, entity.id);
  const externalBaseline = context.initialExternalVersions.get(ref.id);
  const rootBaseline = context.initialVersions.get(entity.id);
  if (externalBaseline !== undefined && rootBaseline !== undefined && externalBaseline !== rootBaseline) refuse(context, "External reference baseline conflicts with current human changes.", "conflict");
  validateUniqueEntityRef(context, operation, ref);
  context.publishedRefIds.add(ref.id);
  const before = JSON.stringify(entity);
  applyPublication(context, operation, entity);
  if (JSON.stringify(entity) === before) return;
  bumpVersion(context, entity);
  if ("updatedAt" in entity) entity.updatedAt = context.supply.createdAt;
  ref.syncedVersion = entity.version;
}

function validateUniqueEntityRef(context: ResolutionContext, operation: Upsert, ref: ExternalRef): void {
  if (context.state.externalRefs.some((entry) => entry.id !== ref.id && entry.entityType === operation.entity && entry.entityId === ref.entityId && entry.system === ref.system)) refuse(context, "Entity has conflicting reference bindings for this system.", "conflict");
}

function createReferencedEntity(context: ResolutionContext, operation: Upsert): void {
  const { selector: _selector, ...fields } = operation;
  const creation = { ...fields, op: "create" as const };
  const creationContext: ResolutionContext = { ...context, operation: creation };
  if (operation.entity === "card") createCard(creationContext);
  else if (operation.entity === "release") createRelease(creationContext);
  else createPersona(creationContext);
  const id = ownString(context.supply.ids, operation.operationId)!;
  const refId = allocatedId(context, true);
  context.publishedRefIds.add(refId);
  context.state.externalRefs.push({ id: refId, entityType: operation.entity, entityId: id, system: operation.selector.system, externalId: operation.selector.externalId, scopeId: operation.selector.scopeId, syncedVersion: 1, createdAt: context.supply.createdAt });
}

function applyPublication(context: ResolutionContext, operation: Upsert, entity: Card | Release | Persona): void {
  if (operation.entity === "card") {
    const card = entity as Card;
    if (card.level === "note" && operation.after.cardType) refuse(context, "Notes cannot have a Card type.");
    if (card.level !== operation.after.level) refuse(context, "External Card publication cannot change hierarchy level.");
    const { storyMapId: _map, level: _level, parentId, position, releaseId, ...patch } = operation.after;
    const oldParent = card.parentId;
    if (parentId !== undefined) card.parentId = parentReference(context, card.storyMapId, card.level, parentId, card.id);
    if (releaseId !== undefined) card.releaseId = releaseReference(context, card.storyMapId, releaseId);
    if (patch.status !== undefined && context.state.remoteWorkItemLinks.some((link) => link.cardId === card.id)) refuse(context, "GitHub owns this Card status.");
    const wasArchived = isCardArchived(card);
    Object.assign(card, patch);
    if (wasArchived && operation.selector.system !== "github") { card.archived = false; if (card.status === "archived" && !context.state.remoteWorkItemLinks.some((link) => link.cardId === card.id)) card.status = "todo"; }
    if (position !== undefined || oldParent !== card.parentId) moveCardPosition(context, card, oldParent, position ?? card.position);
  } else if (operation.entity === "release") {
    const release = entity as Release;
    const { storyMapId: _map, ...patch } = operation.after;
    if (patch.position !== undefined) moveReleasePosition(context, release, patch.position);
    Object.assign(release, patch);
  } else {
    const { projectId: _project, storyMapId: _map, ...patch } = operation.after;
    Object.assign(entity, patch);
  }
}
