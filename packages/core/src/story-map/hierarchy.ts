import type { Card, CardLevel } from "@storymapper/contracts";

const allowedParents: Record<CardLevel, Array<CardLevel | null>> = {
  activity: [null],
  step: ["activity", null],
  story: ["step", null],
  note: [null, "activity", "step"]
};

export interface HierarchyIssue {
  cardId: string;
  message: string;
}

export function validateCardHierarchy(cards: Card[]): HierarchyIssue[] {
  const byId = new Map(cards.map((card) => [card.id, card]));
  const issues: HierarchyIssue[] = [];

  for (const card of cards) {
    const parent = card.parentId ? byId.get(card.parentId) : null;
    const parentLevel = parent?.level ?? null;

    if (card.parentId && !parent) {
      issues.push({ cardId: card.id, message: "Parent card does not exist." });
      continue;
    }

    if (!allowedParents[card.level].includes(parentLevel)) {
      issues.push({
        cardId: card.id,
        message: `${card.level} cannot be nested below ${parentLevel ?? "root"}.`
      });
    }
  }

  return issues;
}

export function getChildren(cards: Card[], parentId: string | null): Card[] {
  return cards
    .filter((card) => card.parentId === parentId)
    .sort((left, right) => left.position - right.position || left.title.localeCompare(right.title));
}

export function getStoryMapColumns(cards: Card[]): Card[] {
  return getChildren(cards, null).filter((card) => card.level === "activity" && !card.parked);
}

export function reindexSiblingPositions(cards: Card[], parentId: string | null): Card[] {
  const siblings = getChildren(cards, parentId);
  const nextPositions = new Map(siblings.map((card, index) => [card.id, index]));

  return cards.map((card) => {
    const position = nextPositions.get(card.id);
    return position === undefined ? card : { ...card, position };
  });
}
