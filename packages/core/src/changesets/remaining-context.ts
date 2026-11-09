import { parseWorkItemLocator, isWorkItemProvider } from "@storymapper/contracts";
import type { OperationSnapshot, Roadmap, Card } from "@storymapper/contracts";
import { allocatedId, assertBaseline, bumpVersion, cardOwner, mapOwner, projectOwner, readDependency, refuse, type ResolutionContext } from "@storymapper/core/changesets/resolution-context";

export const REMAINING_COLLECTIONS = { roadmap: "roadmaps", roadmapColumn: "roadmapColumns", roadmapSwimlane: "roadmapSwimlanes", roadmapCard: "roadmapCards", roadmapReference: "roadmapReferences", annotation: "annotations", workflowStatus: "workflowStatuses", storyTemplate: "storyTemplates", productContext: "productContexts", attachment: "attachments", cardPersona: "cardPersonas", cardAnnotation: "cardAnnotations", githubExternalRef: "externalRefs", externalRef: "externalRefs", persona: "personas", release: "releases", card: "cards" } as const;
export type RemainingEntity = keyof typeof REMAINING_COLLECTIONS;

export function remainingReference(context: ResolutionContext, entity: RemainingEntity, input: string): string {
  const rows = context.state[REMAINING_COLLECTIONS[entity]];
  if (rows.some((row) => row.id === input)) { readDependency(context, entity, input); return input; }
  const alias = context.aliases.get(input);
  if (alias?.entity === entity && rows.some((row) => row.id === alias.id)) { context.dependencies.add(alias.operationId); readDependency(context, entity, alias.id); return alias.id; }
  return refuse(context, `Unknown or forward ${entity} reference ${input}.`);
}

export function remainingTarget(context: ResolutionContext, entity: RemainingEntity): string {
  const selector = context.operation.selector;
  const input = selector?.kind === "id" ? selector.id : selector?.kind === "local" ? selector.localId : context.operation.entityId;
  if (!input || selector?.kind === "externalRef") refuse(context, "A persisted or earlier local target is required.");
  if (selector?.kind === "id" && !context.state[REMAINING_COLLECTIONS[entity]].some((row) => row.id === input)) refuse(context, "Persisted target does not exist.");
  return remainingReference(context, entity, input);
}

export function scopedOwner(context: ResolutionContext, entity: { projectId: string; storyMapId: string | null }): void {
  projectOwner(context, entity.projectId);
  if (entity.storyMapId) mapOwner(context, entity.storyMapId);
}

export function roadmapRoot(context: ResolutionContext, input: string): Roadmap {
  const id = remainingReference(context, "roadmap", input);
  const roadmap = context.state.roadmaps.find((row) => row.id === id)!;
  scopedOwner(context, roadmap);
  assertBaseline(context, roadmap.version, roadmap.id);
  return roadmap;
}

export function ownedCard(context: ResolutionContext, input: string): Card {
  const id = remainingReference(context, "card", input);
  cardOwner(context, id);
  const card = context.state.cards.find((row) => row.id === id)!;
  return card;
}

export function changedCard(context: ResolutionContext, input: string): Card {
  const card = ownedCard(context, input);
  assertBaseline(context, card.version, card.id);
  return card;
}

export function finalizeCard(context: ResolutionContext, card: Card): void {
  const hasEvidence = context.state.sourceLinks.some((link) => link.cardId === card.id) || context.state.externalRefs.some((ref) => isWorkItemProvider(ref.system) && ref.entityType === "card" && ref.entityId === card.id && parseWorkItemLocator(ref.system, ref.externalId)?.resource === "issues");
  card.provenance = hasEvidence ? "linked" : card.creationOrigin ?? "inference";
  bumpVersion(context, card);
}

export function allocatedChildId(context: ResolutionContext, id: string): string {
  return allocatedId({ ...context, supply: { ...context.supply, ids: Object.assign(Object.create(null), context.supply.ids, { [context.operation.operationId]: id }) } });
}
