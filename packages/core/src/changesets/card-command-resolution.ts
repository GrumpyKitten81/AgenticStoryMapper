import { assertCustomizationReview } from "@storymapper/core/changesets/customization-impact";
import { customizationGuard, reviewCardVersions } from "@storymapper/core/changesets/customization-resolution";
import { normalizeDeletionSelection, selectedDeletionEffects } from "@storymapper/core/changesets/selected-deletion";
import { ownValue, ownString } from "@storymapper/core/changesets/supply-values";
import { rehomeChildPositions } from "@storymapper/core/changesets/child-placement";
import type { Card, ChangeOperation, GitHubLink } from "@storymapper/contracts";
import { targetId, updateCard } from "@storymapper/core/changesets/entity-resolution";
import { assertBaseline, bumpVersion, mapOwner, referenceId, refuse, type ResolutionContext } from "@storymapper/core/changesets/resolution-context";
import { ownedCard, changedCard, finalizeCard, remainingTarget, scopedOwner } from "@storymapper/core/changesets/remaining-context";
import { resolveRelationship } from "@storymapper/core/changesets/customization-resolution";
import { visibleCards } from "@storymapper/core/story-map/visibility";

export function resolveCardCommand(context: ResolutionContext): void {
  const operation = context.operation as Extract<ChangeOperation, { entity: "card"; op: "park" | "unpark" | "archive" | "unarchive" | "bulk" }>;
  if (operation.op === "bulk") return resolveBulk(context, operation);
  if (operation.op === "archive" && operation.selector?.kind === "externalRef") trackExternalArchive(context);
  const card = changedCard(context, targetId(context));
  if (operation.op === "park") {
    if (card.level !== "activity") refuse(context, "Only Activities can be parked.");
    rehomeChildren(context, card, operation.after.childStrategy);
    card.parked = true;
  } else if (operation.op === "unpark") {
    const active = visibleCards(context.state.cards.filter((row) => row.storyMapId === card.storyMapId)).filter((row) => row.level === "activity" && row.id !== card.id);
    card.parked = false; card.parentId = null; card.position = Math.max(-1, ...active.map((row) => row.position)) + 1;
  } else {
    card.archived = operation.op === "archive";
    if (operation.op === "unarchive" && !context.state.remoteWorkItemLinks.some((link) => link.cardId === card.id)) card.status = operation.after.status;
  }
  card.updatedAt = context.supply.createdAt;
  bumpVersion(context, card);
}

function resolveBulk(context: ResolutionContext, operation: Extract<ChangeOperation, { entity: "card"; op: "bulk" }>): void {
  const storyMapId = referenceId(context, "storyMap", operation.after.storyMapId);
  mapOwner(context, storyMapId);
  const targets = operation.after.cards;
  if (new Set(targets.map((target) => target.id)).size !== targets.length) refuse(context, "Duplicate Card target.");
  const cards = targets.map((target) => changedCard({ ...context, operation: { ...operation, baseVersion: target.baseVersion } }, target.id));
  if (new Set(cards.map((card) => card.id)).size !== cards.length) refuse(context, "Duplicate Card target.");
  if (cards.some((card) => card.storyMapId !== storyMapId)) refuse(context, "Card belongs to another Story Map.");
  const { addPersonaId, removePersonaId, addAnnotationId, removeAnnotationId, ...patch } = operation.after.patch;
  cards.forEach((card, index) => {
    const cardContext = { ...context, operation: { ...operation, baseVersion: targets[index]!.baseVersion } };
    if (Object.keys(patch).length) updateCard({ ...cardContext, operation: { ...cardContext.operation, op: "update", entityId: card.id, after: patch } });
    for (const [op, entity, value] of [["set", "cardPersona", addPersonaId], ["unset", "cardPersona", removePersonaId], ["set", "cardAnnotation", addAnnotationId], ["unset", "cardAnnotation", removeAnnotationId]] as const) {
      if (!value) continue;
      resolveRelationship({ ...cardContext, supply: { ...context.supply, ids: Object.assign(Object.create(null), context.supply.ids, { [operation.operationId]: ownString(ownValue(ownValue(context.supply.bulkRelationshipIds, operation.operationId), targets[index]!.id), entity === "cardPersona" ? "persona" : "annotation")! }) }, operation: { ...cardContext.operation, op, entity, after: entity === "cardPersona" ? { cardId: card.id, personaId: value } : { cardId: card.id, annotationId: value } } as ChangeOperation });
    }
    card.updatedAt = context.supply.createdAt;
    bumpVersion(context, card);
  });
}

function reindex(context: ResolutionContext, mapId: string, parentId: string | null): void {
  context.state.cards.filter((row) => row.storyMapId === mapId && row.parentId === parentId).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt)).forEach((row, position) => { if (row.position !== position) { ownedCard(context, row.id); row.position = position; bumpVersion(context, row); } });
}

export function rehomeChildren(context: ResolutionContext, card: Card, strategy: "unassign" | "reassign-left" | "reassign-right"): void {
  const before = new Map(context.state.cards.map((row) => [row.id, { position: row.position, parentId: row.parentId }]));
  const result = rehomeChildPositions(context.state.cards, card, strategy);
  if (result.error) refuse(context, result.error);
  for (const row of context.state.cards) if (before.get(row.id)?.position !== row.position || before.get(row.id)?.parentId !== row.parentId) {
    ownedCard(context, row.id);
    if (result.moved.includes(row)) row.updatedAt = context.supply.createdAt;
    bumpVersion(context, row);
  }
}

export function resolveDeletion(context: ResolutionContext): void {
  const operation = context.operation as Extract<ChangeOperation, { op: "delete"; entity: "card" | "release" | "persona" | "storyMap" }>;
  const id = targetId(context);
  if (operation.entity === "card" && operation.after.selection) { resolveSelectedDeletion(context, operation.after.selection, operation.after.strategy); return; }
  if (operation.entity === "card") { rehomeChildren(context, changedCard(context, id), operation.after.strategy); deleteCardRows(context, id); return; }
  if (operation.entity === "storyMap") { const owner = mapOwner(context, id); const map = context.state.storyMaps.find((row) => row.id === owner.entityId)!; assertBaseline(context, map.version, id); context.state.storyMaps = context.state.storyMaps.filter((row) => row.id !== id); return; }
  const row = operation.entity === "persona" ? context.state.personas.find((entry) => entry.id === id)! : context.state.releases.find((entry) => entry.id === id)!;
  if (operation.entity === "persona") scopedOwner(context, context.state.personas.find((entry) => entry.id === id)!); else mapOwner(context, context.state.releases.find((entry) => entry.id === id)!.storyMapId);
  assertBaseline(context, row.version, id);
  if (operation.entity === "persona") {
    if (context.state.removedMapCustomizationReferences?.personas.includes(id)) refuse(context, "Customization is linked to Cards in a removed Story Map; restore the map before unlinking.", "conflict");
    customizationGuard(context, () => assertCustomizationReview(context.state.personas.find((entry) => entry.id === id)!, reviewCardVersions(context, context.state.cards.filter((card) => context.state.cardPersonas.some((link) => link.personaId === id && link.cardId === card.id))), operation.after, true));
    for (const link of context.state.cardPersonas.filter((entry) => entry.personaId === id)) bumpVersion(context, ownedCard(context, link.cardId));
    context.state.cardPersonas = context.state.cardPersonas.filter((entry) => entry.personaId !== id);
    context.state.personas = context.state.personas.filter((entry) => entry.id !== id);
  } else {
    for (const card of context.state.cards.filter((entry) => entry.releaseId === id)) { ownedCard(context, card.id); card.releaseId = null; card.updatedAt = context.supply.createdAt; bumpVersion(context, card); }
    removeGithubOwners(context, (entry) => entry.releaseId === id);
    context.state.remoteWorkItemLinks = context.state.remoteWorkItemLinks.filter((entry) => entry.releaseId !== id);
    context.state.releases = context.state.releases.filter((entry) => entry.id !== id);
  }
  context.state.externalRefs = context.state.externalRefs.filter((entry) => entry.entityType !== operation.entity || entry.entityId !== id);
}

function deleteCardRows(context: ResolutionContext, id: string, reindexSiblings = true, deleting?: ReadonlySet<string>): void {
  const card = context.state.cards.find((row) => row.id === id)!;
  removeGithubOwners(context, (row) => row.cardId === id, deleting);
  for (const edge of context.state.cardDependencies.filter((row) => row.prerequisiteCardId === id && row.cardId !== id)) {
    if (deleting?.has(edge.cardId)) continue;
    const owner = ownedCard(context, edge.cardId);
    bumpVersion(context, owner);
    owner.updatedAt = context.supply.createdAt;
  }
  context.state.cardDependencies = context.state.cardDependencies.filter((row) => row.cardId !== id && row.prerequisiteCardId !== id);
  context.state.cards = context.state.cards.filter((row) => row.id !== id);
  context.state.externalRefs = context.state.externalRefs.filter((row) => row.entityType !== "card" || row.entityId !== id);
  for (const key of ["cardPersonas", "cardAnnotations", "attachments", "sourceLinks", "remoteWorkItemLinks"] as const) context.state[key] = context.state[key].filter((row) => row.cardId !== id) as never;
  if (reindexSiblings) reindex(context, card.storyMapId, card.parentId);
}

function removeGithubOwners(context: ResolutionContext, predicate: (row: GitHubLink) => boolean, deleting?: ReadonlySet<string>): void {
  const ids = new Set(context.state.githubLinks.filter(predicate).map((row) => row.id));
  const affected = new Set(context.state.sourceLinks.filter((row) => row.kind === "github" && ids.has(row.externalRefId)).map((row) => row.cardId));
  context.state.githubLinks = context.state.githubLinks.filter((row) => !ids.has(row.id));
  context.state.externalRefs = context.state.externalRefs.filter((row) => !ids.has(row.id));
  context.state.remoteWorkItemLinks = context.state.remoteWorkItemLinks.filter((row) => !ids.has(row.externalRefId));
  context.state.sourceLinks = context.state.sourceLinks.filter((row) => row.kind !== "github" || !ids.has(row.externalRefId));
  for (const id of affected) if (!deleting?.has(id)) finalizeCard(context, ownedCard(context, id));
}

function trackExternalArchive(context: ResolutionContext): void {
  const operation = context.operation;
  const selector = operation.selector;
  if (!selector || selector.kind !== "externalRef") return;
  const cardId = targetId(context);
  const scopeId = context.state.cards.find((card) => card.id === cardId)!.storyMapId;
  const ref = context.state.externalRefs.find((ref) => ref.entityType === "card" && ref.entityId === cardId && ref.scopeId === scopeId && ref.system === selector.system && ref.externalId === selector.externalId)!;
  const externalBaseline = context.initialExternalVersions.get(ref.id);
  const rootBaseline = context.initialVersions.get(cardId);
  if (externalBaseline !== undefined && rootBaseline !== undefined && externalBaseline !== rootBaseline) refuse(context, "External reference baseline conflicts with current human changes.", "conflict");
  context.publishedRefIds.add(ref.id);
}

function resolveSelectedDeletion(context: ResolutionContext, selection: NonNullable<Extract<ChangeOperation, { entity: "card"; op: "delete" }>["after"]["selection"]>, strategy: "unassign" | "reassign-left" | "reassign-right"): void {
  selection = normalizeDeletionSelection(selection, (entity, id) => entity === "card" && !context.state.cards.some((card) => card.id === id) && !context.aliases.has(id) ? id : referenceId(context, entity, id));
  mapOwner(context, selection.storyMapId);
  const selected = new Set(selection.cards.map((card) => card.id));
  if (selected.size !== selection.cards.length) refuse(context, "Duplicate Card target.");
  if (!selected.has(targetId(context))) refuse(context, "Deletion target is absent from the selected set.");
  for (const target of selection.cards) if (ownedCard(context, target.id).storyMapId !== selection.storyMapId) refuse(context, "Card belongs to another Story Map.");
  const placement = selectedDeletionEffects(context.state, selection.storyMapId, [...selected], strategy);
  if (placement.error) refuse(context, placement.error);
  const baselines = new Map<string, number>();
  for (const target of [...selection.cards, ...selection.affectedCards]) {
    if (!placement.requiredIds.has(target.id)) continue;
    if (baselines.has(target.id) && baselines.get(target.id) !== target.baseVersion) refuse(context, "Inconsistent Card baseline.");
    baselines.set(target.id, target.baseVersion);
    const card = ownedCard(context, target.id);
    assertBaseline({ ...context, operation: { ...context.operation, baseVersion: target.baseVersion } }, card.version, card.id);
  }
  for (const id of placement.requiredIds) if (!baselines.has(id)) refuse(context, "Deletion affects a Card absent from the captured baselines; review the selection again.", "conflict");
  for (const after of placement.cards) {
    const before = context.state.cards.find((row) => row.id === after.id)!;
    if (before.parentId === after.parentId && before.position === after.position) continue;
    ownedCard(context, before.id);
    if (before.parentId !== after.parentId) before.updatedAt = context.supply.createdAt;
    before.parentId = after.parentId; before.position = after.position; bumpVersion(context, before);
  }
  for (const id of selected) deleteCardRows(context, id, false, selected);
}
