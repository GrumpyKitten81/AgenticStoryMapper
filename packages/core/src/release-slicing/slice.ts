import type { Card } from "@storymapper/contracts";
import { visibleCards } from "@storymapper/core";

export interface ReleaseSliceCandidate {
  name: string;
  goal: string;
  cardIds: string[];
}

export function proposeHappyPathSlice(cards: Card[]): ReleaseSliceCandidate {
  const storyCards = visibleCards(cards)
    .filter((card) => card.level === "story")
    .sort((left, right) => left.position - right.position || (left.id < right.id ? -1 : left.id > right.id ? 1 : 0))
    .slice(0, 12);

  return {
    name: "MVP Happy Path",
    goal: "Deliver the smallest coherent user journey across the highest-priority story cards.",
    cardIds: storyCards.map((card) => card.id)
  };
}
