import { isCardCompleted } from "@storymapper/core/story-map/github-status";
import type { PlanStateProjection, SliceDependencyCue, StoryMapSnapshot } from "@storymapper/contracts";

export function dependencyCues(snapshot: StoryMapSnapshot | PlanStateProjection, activeIds: readonly string[]): SliceDependencyCue[] {
  const mapId = snapshot.storyMap.id;
  const cards = new Map(snapshot.cards.filter((card) => card.storyMapId === mapId).map((card) => [card.id, card]));
  const active = new Set(activeIds);
  const ranks = new Map(snapshot.releases.filter((release) => release.storyMapId === mapId).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).map((release, index) => [release.id, index]));
  const rank = (id: string | null) => id === null ? Infinity : ranks.get(id) ?? Infinity;
  return snapshot.cardDependencies.filter((edge) => active.has(edge.cardId)).map((edge) => {
    const dependent = cards.get(edge.cardId);
    const prerequisite = cards.get(edge.prerequisiteCardId);
    if (!dependent || !prerequisite) throw new Error("Dependency endpoint is missing");
    const { id, key, title, status, releaseId } = prerequisite;
    return { cardId: dependent.id, prerequisite: { id, key, title, status, releaseId }, open: !("completedCardIds" in snapshot && snapshot.completedCardIds ? snapshot.completedCardIds.includes(prerequisite.id) : isCardCompleted(prerequisite, "remoteWorkItemLinks" in snapshot ? snapshot.remoteWorkItemLinks : [], snapshot.workflowStatuses)), blockedOrder: rank(dependent.releaseId) < rank(releaseId) };
  });
}
