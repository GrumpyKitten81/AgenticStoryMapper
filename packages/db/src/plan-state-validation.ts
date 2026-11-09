import { DomainError, planStateSchema, type PlanState } from "@storymapper/contracts";
import { dependencyCycle, validateCardHierarchy, visibleCards } from "@storymapper/core";
import type { planStates } from "@storymapper/db/schema";

export function parseStoredPlanState(row: typeof planStates.$inferSelect, projectId: string): PlanState {
  let payload: unknown;
  try { payload = JSON.parse(row.payloadJson); }
  catch (error) {
    if (error instanceof SyntaxError) throw new DomainError("validation", "Plan state contains invalid JSON.");
    throw error;
  }
  const { payloadJson, ...summary } = row;
  const parsed = planStateSchema.safeParse({ ...summary, payload });
  if (!parsed.success) throw new DomainError("validation", "Plan state has an unsupported schema or invalid captured data.");
  const state = parsed.data;
  const captured = state.payload;
  if (state.projectId !== projectId || captured.storyMap.projectId !== projectId || captured.storyMap.id !== state.storyMapId) {
    throw new DomainError("validation", "Plan state ownership does not match its Story Map.");
  }
  validateProjection(state);
  return state;
}

function validateProjection(state: PlanState): void {
  const { cards, releases, workflowStatuses, cardDependencies, storyIds } = state.payload;
  const cardIds = new Set(cards.map((card) => card.id));
  const releaseIds = new Set(releases.map((release) => release.id));
  if (cardIds.size !== cards.length || releaseIds.size !== releases.length || new Set(storyIds).size !== storyIds.length ||
    cards.some((card) => card.storyMapId !== state.storyMapId || card.releaseId !== null && !releaseIds.has(card.releaseId)) ||
    releases.some((release) => release.storyMapId !== state.storyMapId) ||
    workflowStatuses.some((status) => status.projectId !== state.projectId || status.storyMapId !== null && status.storyMapId !== state.storyMapId) ||
    validateCardHierarchy(cards).length) throw new DomainError("validation", "Plan state contains inconsistent captured ownership or hierarchy.");
  const active = new Set(visibleCards(cards).filter((card) => card.level === "story").map((card) => card.id));
  if (active.size !== storyIds.length || storyIds.some((id) => !active.has(id))) throw new DomainError("validation", "Plan state contains an inconsistent active Story cut.");
  const edges: Array<{ cardId: string; prerequisiteCardId: string }> = [];
  const pairs = new Set<string>();
  for (const edge of cardDependencies) {
    const pair = `${edge.cardId}:${edge.prerequisiteCardId}`;
    if (!cardIds.has(edge.cardId) || !cardIds.has(edge.prerequisiteCardId) || pairs.has(pair) || dependencyCycle(edges, edge.cardId, edge.prerequisiteCardId)) {
      throw new DomainError("validation", "Plan state contains invalid captured dependencies.");
    }
    pairs.add(pair);
    edges.push(edge);
  }
}
