import type { Card } from "@storymapper/contracts";
import { isCardArchived } from "@storymapper/core/story-map/github-status";

export function visibleCards(cards: readonly Card[]): Card[] {
  const children = new Map<string, string[]>();
  const hidden = new Set(cards.filter((card) => isCardArchived(card) || card.parked).map((card) => card.id));
  for (const card of cards) {
    if (!card.parentId) continue;
    const siblings = children.get(card.parentId) ?? [];
    siblings.push(card.id);
    children.set(card.parentId, siblings);
  }
  const pending = [...hidden];
  while (pending.length) {
    const parentId = pending.pop()!;
    for (const childId of children.get(parentId) ?? []) {
      if (hidden.has(childId)) continue;
      hidden.add(childId);
      pending.push(childId);
    }
  }
  return cards.filter((card) => !hidden.has(card.id));
}
