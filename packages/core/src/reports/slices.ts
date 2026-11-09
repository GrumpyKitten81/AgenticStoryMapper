import { isCardCompleted } from "@storymapper/core/story-map/github-status";
import type { Card, PlanState, PlanStateComparison, PlanStateProjection, SlicesReport, StoryMapSnapshot } from "@storymapper/contracts";
import { dependencyCues } from "@storymapper/core/reports/dependency-cues";
import { visibleCards } from "@storymapper/core/story-map/visibility";

export function buildPlanStateProjection(snapshot: StoryMapSnapshot): PlanStateProjection {
  return structuredClone(projectCanonicalState(snapshot));
}

function projectCanonicalState(snapshot: StoryMapSnapshot): PlanStateProjection {
  const mapId = snapshot.storyMap.id;
  const cards = snapshot.cards.filter((card) => card.storyMapId === mapId);
  const cardIds = new Set(cards.map((card) => card.id));
  return { storyMap: snapshot.storyMap, cards,
    completedCardIds: snapshot.cards.filter((card) => isCardCompleted(card, snapshot.remoteWorkItemLinks, snapshot.workflowStatuses)).map((card) => card.id),
    releases: snapshot.releases.filter((release) => release.storyMapId === mapId),
    workflowStatuses: snapshot.workflowStatuses.filter((status) => status.storyMapId === null || status.storyMapId === mapId),
    cardDependencies: snapshot.cardDependencies.filter((edge) => cardIds.has(edge.cardId)),
    storyIds: visibleCards(cards).filter((card) => card.level === "story").map((card) => card.id)
  };
}

function activityOf(card: Card, byId: Map<string, Card>): Card | undefined {
  const visited = new Set<string>();
  let parent = card.parentId;
  while (parent && !visited.has(parent)) {
    visited.add(parent);
    const ancestor = byId.get(parent);
    if (!ancestor) return undefined;
    if (ancestor.level === "activity") return ancestor;
    parent = ancestor.parentId;
  }
  return undefined;
}

function summarize(cards: Card[], done: Set<string>) {
  const statusCounts = new Map<string, number>();
  for (const card of cards) statusCounts.set(card.status, (statusCounts.get(card.status) ?? 0) + 1);
  return { storyCount: cards.length, doneCount: cards.filter((card) => done.has(card.id)).length,
    estimateTotal: cards.reduce((sum, card) => sum + (card.estimate ?? 0), 0), statusCounts: Object.fromEntries(statusCounts) };
}

export function buildSlicesReport(input: StoryMapSnapshot | PlanStateProjection): SlicesReport {
  const projection = "storyIds" in input ? input : projectCanonicalState(input);
  const done = new Set(projection.completedCardIds ?? projection.cards.filter((card) => isCardCompleted(card, [], projection.workflowStatuses)).map((card) => card.id));
  const byId = new Map(projection.cards.map((card) => [card.id, card]));
  const stories = projection.storyIds.map((id) => { const card = byId.get(id); if (!card) throw new Error("Plan state Story is missing"); return card; });
  const dependencies = dependencyCues(projection, projection.storyIds);
  const lanes = [...projection.releases].sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).map((release) => ({ releaseId: release.id as string | null, name: release.name }));
  lanes.push({ releaseId: null, name: "Unscheduled" });
  return { storyMapId: projection.storyMap.id, dependencies, lanes: lanes.map((lane) => {
    const cards = stories.filter((card) => card.releaseId === lane.releaseId);
    const groups = new Map<string | null, { activityId: string | null; name: string; cards: Card[] }>();
    for (const card of cards) {
      const activity = activityOf(card, byId);
      const id = activity?.id ?? null;
      const group = groups.get(id) ?? { activityId: id, name: activity?.title ?? "Unassigned", cards: [] };
      group.cards.push(card); groups.set(id, group);
    }
    const ids = new Set(cards.map((card) => card.id));
    return { ...lane, ...summarize(cards, done), storyIds: cards.map((card) => card.id), blockers: dependencies.filter((cue) => ids.has(cue.cardId) && cue.open),
      activities: [...groups.values()].map(({ cards: grouped, ...activity }) => ({ ...activity, ...summarize(grouped, done) })) };
  }) };
}

export function comparePlanStates(before: PlanState, after: PlanState): PlanStateComparison {
  if (before.projectId !== after.projectId || before.storyMapId !== after.storyMapId) throw new Error("Plan states must belong to the same Story Map");
  const beforeIds = new Set(before.payload.storyIds), afterIds = new Set(after.payload.storyIds);
  const left = new Map(before.payload.cards.filter((card) => beforeIds.has(card.id)).map((card) => [card.id, card]));
  const right = new Map(after.payload.cards.filter((card) => afterIds.has(card.id)).map((card) => [card.id, card]));
  const changes: PlanStateComparison["changes"] = [];
  for (const id of new Set([...left.keys(), ...right.keys()])) {
    const oldCard = left.get(id), newCard = right.get(id);
    const kind = !oldCard ? "added" : !newCard ? "removed" : oldCard.releaseId !== newCard.releaseId ? "moved" : undefined;
    if (kind) changes.push({ cardId: id, kind, beforeReleaseId: oldCard?.releaseId ?? null, afterReleaseId: newCard?.releaseId ?? null });
  }
  return { before, after, changes };
}
