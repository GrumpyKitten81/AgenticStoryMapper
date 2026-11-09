import type { Card } from "@storymapper/contracts";
import { pointerWithin, rectIntersection, type CollisionDetection } from "@dnd-kit/core";
import { getChildren } from "@storymapper/core";

export const storyBoardCollisionDetection: CollisionDetection = (args) => {
  const pointerCollisions = pointerWithin(args);
  return pointerCollisions.length > 0 ? pointerCollisions : rectIntersection(args);
};

export interface StoryCellDropTarget {
  parentId: string;
  position: number;
  releaseId: string | null;
}

export function resolveStoryCellDropTarget(cards: Card[], overId: string): StoryCellDropTarget | null {
  if (overId.startsWith("cell:")) {
    const [, parentId, releaseValue] = overId.split(":");
    if (!parentId) return null;
    const releaseId = !releaseValue || releaseValue === "none" ? null : releaseValue;
    const position = getChildren(cards, parentId).filter((card) => card.level === "story" && (card.releaseId ?? null) === releaseId).length;
    return { parentId, position, releaseId };
  }

  const overCard = cards.find((card) => card.id === overId);
  if (!overCard?.parentId) return null;
  const releaseId = overCard.releaseId ?? null;
  const siblings = getChildren(cards, overCard.parentId).filter((card) => card.level === "story" && (card.releaseId ?? null) === releaseId);
  return {
    parentId: overCard.parentId,
    position: Math.max(0, siblings.findIndex((card) => card.id === overCard.id)),
    releaseId
  };
}
