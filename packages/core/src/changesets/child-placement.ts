import type { Card } from "@storymapper/contracts";
import { visibleCards } from "@storymapper/core/story-map/visibility";
import { reindexCardPositions } from "@storymapper/core/changesets/position-resolution";

export function rehomeChildPositions(cards: Card[], card: Card, strategy: "unassign" | "reassign-left" | "reassign-right"): { moved: Card[]; error?: string } {
  const direct = cards.filter((row) => row.storyMapId === card.storyMapId && row.parentId === card.id).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  if (!direct.length) return { moved: [] };
  const visible = new Set(visibleCards(cards).map((row) => row.id));
  const siblings = cards.filter((row) => row.storyMapId === card.storyMapId && row.parentId === card.parentId && row.level === card.level && (row.id === card.id || visible.has(row.id))).sort((a, b) => a.position - b.position || a.createdAt.localeCompare(b.createdAt));
  const neighbor = strategy === "unassign" ? undefined : siblings[siblings.findIndex((row) => row.id === card.id) + (strategy === "reassign-left" ? -1 : 1)];
  if (strategy !== "unassign" && !neighbor) return { moved: [], error: `No visible ${strategy === "reassign-left" ? "left" : "right"} neighbor is available.` };
  const moved = [...direct];
  if (!neighbor) for (let index = 0; index < moved.length; index++) {
    for (const child of cards.filter((row) => row.parentId === moved[index]!.id && row.storyMapId === card.storyMapId)) {
      if (moved.includes(child) || child.id === card.id) return { moved: [], error: "Card ancestry contains a cycle." };
      moved.push(child);
    }
  }
  const base = neighbor ? Math.max(-1, ...cards.filter((row) => row.parentId === neighbor.id).map((row) => row.position)) + 1 : 0;
  moved.forEach((row, index) => { row.parentId = neighbor?.id ?? null; if (neighbor) row.position = base + index; });
  if (!neighbor) reindexCardPositions(cards, card.storyMapId, null);
  return { moved };
}
