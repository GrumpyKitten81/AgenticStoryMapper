import type { ActorContext, ChangeSetPreviewBoard, ChangeSetPreviewMarker, OperationSnapshot, ResolvedEntityChange, StoryMapSnapshot } from "@storymapper/contracts";
import { projectSourceLinks } from "@storymapper/core/changesets/github-evidence";
import { visibleCards } from "@storymapper/core";
import type { ApplicationDeps } from "@storymapper/server/application/deps";
import { visibleSnapshotSources } from "@storymapper/server/application/story-map/snapshot-source-visibility";

export function previewBoards(deps: ApplicationDeps, actor: ActorContext, state: OperationSnapshot, operations: readonly { operationId: string; changes: ResolvedEntityChange[] }[], original: OperationSnapshot = state): ChangeSetPreviewBoard[] {
  const markers = new Map<string, ChangeSetPreviewMarker>();
  const removed: ResolvedEntityChange[] = [];
  for (const operation of operations) for (const change of operation.changes) {
    const key = `${change.entity}:${change.entityId}`;
    const prior = markers.get(key);
    const kind = !change.after ? "removed" : !change.before ? "added" : change.entity === "card" && (change.before.parentId !== change.after.parentId || change.before.releaseId !== change.after.releaseId || change.before.position !== change.after.position) ? "moved" : "changed";
    markers.set(key, { entity: change.entity, entityId: change.entityId, kind: prior?.kind === "added" && kind !== "removed" ? "added" : prior?.kind === "moved" && kind === "changed" ? "moved" : kind, operationIds: [...(prior?.operationIds ?? []), operation.operationId] });
    if (!change.after) removed.push(change);
  }
  const resultingCards = visibleCards(state.cards);
  const visibleIds = new Set(resultingCards.map((card) => card.id));
  const visibilityGhosts = visibleCards(original.cards).filter((card) => !visibleIds.has(card.id));
  for (const card of visibilityGhosts) {
    if (markers.get(`card:${card.id}`)?.kind === "removed") continue;
    const ancestors = new Set([card.id]);
    let parentId = card.parentId;
    while (parentId && !ancestors.has(parentId)) { ancestors.add(parentId); parentId = original.cards.find((row) => row.id === parentId)?.parentId ?? null; }
    const related = operations.filter((operation) => operation.changes.some((change) => change.entity === "card" && ancestors.has(change.entityId) || change.entity === "storyMap" && change.entityId === card.storyMapId));
    markers.set(`card:${card.id}`, { entity: "card", entityId: card.id, kind: "removed", operationIds: related.map((operation) => operation.operationId) });
  }
  const ghostCards = removed.flatMap((change) => change.entity === "card" && change.before && !state.cards.some((card) => card.id === change.entityId) ? [change.before] : []);
  const ghostReleases = removed.flatMap((change) => change.entity === "release" && change.before && !state.releases.some((release) => release.id === change.entityId) ? [change.before] : []);
  const ghostMaps = removed.flatMap((change) => change.entity === "storyMap" && change.before && !state.storyMaps.some((map) => map.id === change.entityId) ? [change.before] : []);
  return [...state.storyMaps, ...ghostMaps].map((storyMap) => {
    const ghostIds = new Set(visibilityGhosts.map((card) => card.id));
    const cards = [...state.cards.filter((card) => !ghostIds.has(card.id)), ...ghostCards.filter((card) => !ghostIds.has(card.id)), ...visibilityGhosts].filter((card) => card.storyMapId === storyMap.id);
    const ids = new Set(cards.map((card) => card.id));
    const snapshot: StoryMapSnapshot = {
      storyMap, cards, releases: [...state.releases, ...ghostReleases].filter((release) => release.storyMapId === storyMap.id),
      personas: state.personas.filter((persona) => persona.storyMapId === storyMap.id || persona.storyMapId === null),
      externalRefs: state.externalRefs.filter((ref) => (ref.scopeId === storyMap.id || ref.scopeId === state.projectId) && (ref.entityType === "card" ? ids.has(ref.entityId) : ref.entityType === "release" ? snapshotReleaseIds(state, storyMap.id).has(ref.entityId) : state.personas.some((persona) => persona.id === ref.entityId && (!persona.storyMapId || persona.storyMapId === storyMap.id)))),
      githubStatusCatalogs: state.connections.flatMap((connection) => (connection.statusCatalogs ?? []).map((catalog) => ({ connectionId: connection.id, connectionName: connection.name, catalog }))),
      workflowStatuses: state.workflowStatuses.filter((row) => row.projectId === state.projectId && (!row.storyMapId || row.storyMapId === storyMap.id)),
      annotations: state.annotations.filter((row) => row.projectId === state.projectId && (!row.storyMapId || row.storyMapId === storyMap.id)),
      storyTemplates: state.storyTemplates.filter((row) => row.projectId === state.projectId && (!row.storyMapId || row.storyMapId === storyMap.id)),
      cardDependencies: state.cardDependencies.filter((row) => state.cards.some((card) => card.id === row.cardId && card.storyMapId === storyMap.id)),
      cardPersonas: state.cardPersonas.filter((row) => ids.has(row.cardId)), cardAnnotations: state.cardAnnotations.filter((row) => ids.has(row.cardId)),
      roadmaps: state.roadmaps.filter((row) => !row.storyMapId || row.storyMapId === storyMap.id),
      productContext: state.productContexts.find((row) => row.storyMapId === storyMap.id) ?? state.productContexts.find((row) => row.projectId === state.projectId && !row.storyMapId),
      sourceChunks: state.sourceChunks.filter((chunk) => state.sourceLinks.some((link) => ids.has(link.cardId) && link.kind === "chunk" && link.chunkId === chunk.id)), sourceLinks: projectSourceLinks(state).filter((row) => ids.has(row.cardId)),
      cardAttachments: state.attachments.filter((row) => ids.has(row.cardId)), githubLinks: state.githubLinks.filter((row) => ids.has(row.cardId ?? "") || snapshotReleaseIds(state, storyMap.id).has(row.releaseId ?? "")), remoteWorkItemLinks: state.remoteWorkItemLinks.filter((row) => ids.has(row.cardId ?? ""))
    };
    return { snapshot: visibleSnapshotSources(deps.repository, actor, snapshot), markers: [...markers.values()] };
  });
}

function snapshotReleaseIds(state: OperationSnapshot, storyMapId: string): Set<string> { return new Set(state.releases.filter((release) => release.storyMapId === storyMapId).map((release) => release.id)); }
