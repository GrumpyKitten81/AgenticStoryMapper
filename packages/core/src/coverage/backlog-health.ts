import type { Card } from "@storymapper/contracts";
import { visibleCards } from "../story-map/visibility";

export interface BacklogHealthIssue {
  cardId: string;
  type: "missing-description" | "missing-estimate" | "missing-source" | "missing-github-link";
  severity: "info" | "warning" | "error";
}

export function calculateBacklogHealth(input: {
  cards: Card[];
  sourceLinkedCardIds: string[];
  githubLinkedCardIds: string[];
}): BacklogHealthIssue[] {
  const sourceLinks = new Set(input.sourceLinkedCardIds);
  const githubLinks = new Set(input.githubLinkedCardIds);
  const storyCards = visibleCards(input.cards).filter((card) => card.level === "story");

  return storyCards.flatMap((card) => {
    const issues: BacklogHealthIssue[] = [];
    if (!card.description.trim()) {
      issues.push({ cardId: card.id, type: "missing-description", severity: "warning" });
    }
    if (card.estimate === undefined || card.estimate === null) {
      issues.push({ cardId: card.id, type: "missing-estimate", severity: "info" });
    }
    if (!sourceLinks.has(card.id)) {
      issues.push({ cardId: card.id, type: "missing-source", severity: "warning" });
    }
    if (!githubLinks.has(card.id)) {
      issues.push({ cardId: card.id, type: "missing-github-link", severity: "info" });
    }
    return issues;
  });
}
