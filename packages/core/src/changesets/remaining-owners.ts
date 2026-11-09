import type { OperationOwner, OperationSnapshot, ResolvedEntityChange } from "@storymapper/contracts";
import { cardOwner, mapOwner, projectOwner, type ResolutionContext } from "@storymapper/core/changesets/resolution-context";

export const CHANGE_COLLECTIONS = { sourcePlanBaseline: "sourcePlanBaselines", syncRun: "syncRuns", syncConflict: "syncConflicts", storyMap: "storyMaps", card: "cards", release: "releases", persona: "personas", roadmap: "roadmaps", roadmapColumn: "roadmapColumns", roadmapSwimlane: "roadmapSwimlanes", roadmapCard: "roadmapCards", roadmapReference: "roadmapReferences", annotation: "annotations", workflowStatus: "workflowStatuses", storyTemplate: "storyTemplates", productContext: "productContexts", attachment: "attachments", cardPersona: "cardPersonas", cardAnnotation: "cardAnnotations", cardDependency: "cardDependencies", sourceDocument: "sourceDocuments", sourceChunk: "sourceChunks", sourceLink: "sourceLinks", externalRef: "externalRefs", remoteWorkItemLink: "remoteWorkItemLinks", connection: "connections" } as const;

export function changeOwners(context: ResolutionContext, changes: ResolvedEntityChange[], before: OperationSnapshot): OperationOwner[] {
  const owners = new Map<string, OperationOwner>();
  for (const change of changes) {
    const state = change.after ? context.state : before;
    const ownerContext = { ...context, state };
    for (const owner of ownersFor(ownerContext, change.entity, change.after ?? change.before!)) owners.set(`${owner.entity}:${owner.entityId}`, owner);
  }
  return [...owners.values()];
}

export function ownersFor(context: ResolutionContext, entity: string, row: unknown): OperationOwner[] {
  const value = row as { id: string; projectId?: string; storyMapId?: string | null; cardId?: string; releaseId?: string; roadmapId?: string; roadmapCardId?: string; documentId?: string; entityType?: string; entityId?: string };
  if (entity === "card") return [cardOwner(context, value.id)];
  if (entity === "storyMap") return [mapOwner(context, value.id)];
  if (entity === "release" || entity === "persona" || entity === "roadmap") {
    if (value.storyMapId) mapOwner(context, value.storyMapId);
    if (value.projectId) projectOwner(context, value.projectId);
    return [{ entity, entityId: value.id, projectId: context.state.projectId }];
  }
  if (value.cardId) return [cardOwner(context, value.cardId)];
  if (value.releaseId) return ownersFor(context, "release", context.state.releases.find((row) => row.id === value.releaseId));
  if (value.roadmapId) return ownersFor(context, "roadmap", context.state.roadmaps.find((row) => row.id === value.roadmapId));
  if (value.roadmapCardId) return ownersFor(context, "roadmapCard", context.state.roadmapCards.find((row) => row.id === value.roadmapCardId));
  if (value.documentId) return ownersFor(context, "sourceDocument", context.state.sourceDocuments.find((row) => row.id === value.documentId));
  if (entity === "externalRef" || entity === "githubExternalRef") return ownersFor(context, value.entityType!, (context.state[CHANGE_COLLECTIONS[value.entityType as keyof typeof CHANGE_COLLECTIONS]] ?? []).find((row) => row.id === value.entityId));
  if (value.storyMapId) return [mapOwner(context, value.storyMapId)];
  projectOwner(context, value.projectId ?? context.state.projectId);
  return [{ entity: "project", entityId: context.state.projectId, projectId: context.state.projectId }];
}
