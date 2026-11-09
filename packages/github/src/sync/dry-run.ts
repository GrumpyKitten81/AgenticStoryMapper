import type { Card } from "@storymapper/contracts";

export interface GitHubIssueDryRun {
  cardId: string;
  title: string;
  body: string;
  labels: string[];
}

export function buildIssueDryRun(card: Card, exportLabel = "local-story-map"): GitHubIssueDryRun {
  return {
    cardId: card.id,
    title: card.title,
    body: card.description,
    labels: [exportLabel, `status:${card.status}`]
  };
}
