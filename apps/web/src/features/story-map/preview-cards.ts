import type { Card, ChangeSetPreviewBoard } from "@storymapper/contracts";
import { visibleCards } from "@storymapper/core";

export function includePreviewGhosts(cards: Card[], preview: ChangeSetPreviewBoard): Card[] {
  const ghosts = new Set(preview.markers.filter((marker) => marker.entity === "card" && marker.kind === "removed").map((marker) => marker.entityId));
  const included = new Set(visibleCards(cards.filter((card) => !ghosts.has(card.id))).map((card) => card.id));
  return cards.filter((card) => included.has(card.id) || ghosts.has(card.id));
}
