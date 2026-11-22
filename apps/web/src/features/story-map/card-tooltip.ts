import type { Card } from "@storymapper/contracts";

const DESCRIPTION_PREVIEW_LIMIT = 300;

export function cardDescriptionExcerpt(description: string): string {
  const characters = Array.from(description.replace(/\s+/gu, " ").trim());
  return `${characters.slice(0, DESCRIPTION_PREVIEW_LIMIT).join("")}${characters.length > DESCRIPTION_PREVIEW_LIMIT ? "…" : ""}`;
}

export function cardTooltip(card: Pick<Card, "title" | "description">): string {
  const excerpt = cardDescriptionExcerpt(card.description);
  return excerpt ? `${card.title}\n\n${excerpt}` : card.title;
}
