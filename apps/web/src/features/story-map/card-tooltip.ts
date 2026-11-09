import type { Card } from "@storymapper/contracts";

const DESCRIPTION_PREVIEW_LIMIT = 300;

export function cardTooltip(card: Pick<Card, "title" | "description">): string {
  const description = card.description.replace(/\s+/gu, " ").trim();
  if (!description) return card.title;
  const characters = Array.from(description);
  const excerpt = characters.slice(0, DESCRIPTION_PREVIEW_LIMIT).join("");
  return `${card.title}\n\n${excerpt}${characters.length > DESCRIPTION_PREVIEW_LIMIT ? "…" : ""}`;
}
