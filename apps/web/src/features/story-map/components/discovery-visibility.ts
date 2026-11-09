import type { Card, Release } from "@storymapper/contracts";

export function discoveryDisplayedCardIds(cards: Card[], filterIds: Set<string>, collapsedLaneIds: string[]): Set<string> {
  const lanes = new Set(collapsedLaneIds);
  const byId = new Map(cards.map((card) => [card.id, card]));
  return new Set(cards.filter((card) => {
    if (!filterIds.has(card.id)) return false;
    const parent = card.parentId ? byId.get(card.parentId) : undefined;
    const inReleaseLane = (card.level === "story" || card.level === "note") && parent?.level === "step" && parent.parentId !== null;
    return !inReleaseLane || !lanes.has(`release:${card.releaseId ?? "unscheduled"}`);
  }).map((card) => card.id));
}

export function planningDisplayedCardIds(cards: Card[], releases: Release[], showAll: boolean): Set<string> {
  const activities = new Set(cards.filter((card) => card.level === "activity" && card.parentId === null).map((card) => card.id));
  const steps = new Set(cards.filter((card) => card.level === "step" && card.parentId && activities.has(card.parentId)).map((card) => card.id));
  const availableReleases = new Set(releases.filter((release) => showAll || !release.released).map((release) => release.id));
  return new Set(cards.filter((card) => card.level === "story" && card.parentId && steps.has(card.parentId) && (!card.releaseId || availableReleases.has(card.releaseId))).map((card) => card.id));
}
