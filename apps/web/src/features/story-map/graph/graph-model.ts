import type { Card, CardDependency, StoryMapSnapshot } from "@storymapper/contracts";
import { dependencyCues, visibleCards } from "@storymapper/core";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

export interface GraphFilters { activity: string; slice: string; status: string; assignee: string }
export const EMPTY_GRAPH_FILTERS: GraphFilters = { activity: "", slice: "", status: "", assignee: "" };

export function assigneeFilterValue(name: string): string { return `assigned:${name}`; }

export function activityId(card: Card, cards: ReadonlyMap<string, Card>): string | undefined {
  const visited = new Set<string>();
  let current: Card | undefined = card;
  while (current && !visited.has(current.id)) {
    if (current.level === "activity") return current.id;
    visited.add(current.id);
    current = current.parentId ? cards.get(current.parentId) : undefined;
  }
  return undefined;
}

export function graphFilterOptions(snapshot: StoryMapSnapshot, active: Card[]): Record<keyof GraphFilters, { id: string; name: string }[]> {
  return {
    activity: active.filter((card) => card.level === "activity").map((card) => ({ id: card.id, name: `${card.key}: ${card.title}` })),
    slice: [...snapshot.releases.filter((release) => release.storyMapId === snapshot.storyMap.id).sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)), { id: "unscheduled", name: strings.graphUnscheduled }],
    status: [...new Set(active.map((card) => card.status))].sort().map((name) => ({ id: name, name })),
    assignee: [...new Set(active.flatMap((card) => card.assignee ? [card.assignee] : []))].sort().map((name) => ({ id: assigneeFilterValue(name), name })).concat({ id: "unassigned", name: strings.unassigned })
  };
}

export function topologicalCards(cards: Card[], edges: CardDependency[]): Card[] {
  const compare = (a: Card, b: Card) => a.title.localeCompare(b.title) || a.id.localeCompare(b.id);
  const byId = new Map(cards.map((card) => [card.id, card]));
  const degree = new Map(cards.map((card) => [card.id, 0]));
  const dependents = new Map<string, string[]>();
  for (const edge of edges) {
    degree.set(edge.cardId, degree.get(edge.cardId)! + 1);
    const group = dependents.get(edge.prerequisiteCardId) ?? [];
    group.push(edge.cardId); dependents.set(edge.prerequisiteCardId, group);
  }
  const ready = cards.filter((card) => !degree.get(card.id)).sort(compare);
  const ordered: Card[] = [];
  while (ready.length) {
    const card = ready.shift()!; ordered.push(card);
    for (const id of dependents.get(card.id) ?? []) {
      degree.set(id, degree.get(id)! - 1);
      if (!degree.get(id)) { ready.push(byId.get(id)!); ready.sort(compare); }
    }
  }
  if (ordered.length !== cards.length) throw new Error("Dependency graph contains a cycle");
  return ordered;
}

export function buildGraphModel(snapshot: StoryMapSnapshot, requestedFilters: GraphFilters, selection?: { visibleCardIds: ReadonlySet<string>; matchingCardIds: ReadonlySet<string> }) {
  const canonical = snapshot.cards.filter((card) => card.storyMapId === snapshot.storyMap.id);
  const byId = new Map(canonical.map((card) => [card.id, card]));
  const active = visibleCards(canonical);
  const cues = dependencyCues(snapshot, active.map((card) => card.id));
  const options = graphFilterOptions(snapshot, active);
  const keep = (key: keyof GraphFilters) => options[key].some(({ id }) => id === requestedFilters[key]) ? requestedFilters[key] : "";
  const filters: GraphFilters = { activity: keep("activity"), slice: keep("slice"), status: keep("status"), assignee: keep("assignee") };
  const cards = active.filter((card) => (!selection || selection.visibleCardIds.has(card.id)) && (!filters.activity || activityId(card, byId) === filters.activity)
    && (!filters.slice || (filters.slice === "unscheduled" ? card.releaseId === null : card.releaseId === filters.slice))
    && (!filters.status || card.status === filters.status)
    && (!filters.assignee || (filters.assignee === "unassigned" ? !card.assignee : Boolean(card.assignee) && assigneeFilterValue(card.assignee!) === filters.assignee)));
  const ids = new Set(cards.map((card) => card.id));
  const edges = snapshot.cardDependencies.filter((edge) => ids.has(edge.cardId) && ids.has(edge.prerequisiteCardId));
  const requires = new Map<string, Card[]>(), requiredBy = new Map<string, Card[]>();
  for (const edge of snapshot.cardDependencies) {
    if (!byId.has(edge.cardId)) continue;
    const dependent = byId.get(edge.cardId)!;
    const prerequisite = byId.get(edge.prerequisiteCardId);
    if (!prerequisite) throw new Error("Dependency endpoint is missing");
    const forward = requires.get(dependent.id) ?? [], reverse = requiredBy.get(prerequisite.id) ?? [];
    forward.push(prerequisite); reverse.push(dependent);
    requires.set(dependent.id, forward); requiredBy.set(prerequisite.id, reverse);
  }
  const contextIds = new Set(cards.filter((card) => selection && !selection.matchingCardIds.has(card.id)).map((card) => card.id));
  return { cards: topologicalCards(cards, edges), edges, ids, contextIds, active, byId, cues, requires, requiredBy, filters, options };
}
export type GraphModel = ReturnType<typeof buildGraphModel>;
