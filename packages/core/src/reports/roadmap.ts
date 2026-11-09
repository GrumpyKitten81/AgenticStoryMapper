import { isCardCompleted } from "@storymapper/core/story-map/github-status";
import type { Card, RoadmapCardReport, RoadmapDetails, RoadmapDetailsData, RoadmapReference } from "@storymapper/contracts";
import { visibleCards } from "@storymapper/core";

export function buildRoadmapDetails(data: RoadmapDetailsData | undefined): RoadmapDetails | undefined {
  if (!data) return undefined;
  const { storyCards, remoteWorkItemLinks = [], workflowStatuses = [], ...details } = data;
  return { ...details, reports: details.cards.map((card) => buildRoadmapCardReport(card.id, details.references.filter((reference) => reference.roadmapCardId === card.id), storyCards, { remoteWorkItemLinks, workflowStatuses })) };
}

export function buildRoadmapCardReport(roadmapCardId: string, references: RoadmapReference[], cards: Card[], statusContext?: { matchingCardIds?: ReadonlySet<string> | undefined; remoteWorkItemLinks?: readonly import("@storymapper/contracts").RemoteWorkItemLink[]; workflowStatuses?: readonly import("@storymapper/contracts").WorkflowStatus[] }): RoadmapCardReport {
  const allCards = visibleCards(cards);
  const storyCards = new Map<string, Card>();
  for (const reference of references) {
    const ids = reference.targetType === "card" ? descendantIds(reference.targetId, allCards) : undefined;
    for (const card of allCards.filter((item) => item.level === "story" && (ids ? ids.has(item.id) : item.releaseId === reference.targetId))) storyCards.set(card.id, card);
  }
  const stories = [...storyCards.values()].filter((card) => !statusContext?.matchingCardIds || statusContext.matchingCardIds.has(card.id));
  const statusCounts: Record<string, number> = {};
  for (const story of stories) statusCounts[story.status] = (statusCounts[story.status] ?? 0) + 1;
  const doneStories = stories.filter((story) => isCardCompleted(story, statusContext?.remoteWorkItemLinks, statusContext?.workflowStatuses)).length;
  return { roadmapCardId, totalCards: stories.length, totalStories: stories.length, doneStories, estimateTotal: stories.reduce((sum, story) => sum + (story.estimate ?? 0), 0), progressRatio: stories.length ? doneStories / stories.length : 0, statusCounts };
}

function descendantIds(targetId: string, cards: Card[]): Set<string> {
  const ids = new Set<string>();
  if (!cards.some((card) => card.id === targetId)) return ids;
  ids.add(targetId);
  let changed = true;
  while (changed) {
    changed = false;
    for (const card of cards) if (card.parentId && ids.has(card.parentId) && !ids.has(card.id)) { ids.add(card.id); changed = true; }
  }
  return ids;
}
