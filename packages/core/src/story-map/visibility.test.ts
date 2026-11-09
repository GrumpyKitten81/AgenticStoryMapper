import { describe, expect, it } from "vitest";
import type { Card } from "@storymapper/contracts";
import { calculateBacklogHealth } from "../coverage/backlog-health";
import { visibleCards } from "./visibility";

function card(id: string, parentId: string | null, status = "todo", parked = false): Card {
  return {
    id, parentId, status, parked, version: 1, creationOrigin: "manual", provenance: "manual", storyMapId: "map", releaseId: null, key: id,
    level: "story", title: id, description: "", position: 0,
    createdAt: "2026-10-04T10:00:00.000Z", updatedAt: "2026-10-04T10:00:00.000Z"
  };
}

describe("effective Card visibility", () => {
  it("hides archived and parked trees regardless of input order, retaining root unassigned Cards", () => {
    const cards = [
      card("grandchild", "child"), card("child", "archived"), card("parked-child", "parked"),
      card("archived", null, "archived"), card("parked", null, "todo", true),
      card("unassigned", null), card("visible", "unassigned")
    ];
    const before = structuredClone(cards);
    expect(visibleCards(cards).map((item) => item.id)).toEqual(["unassigned", "visible"]);
    expect(cards).toEqual(before);
    expect(calculateBacklogHealth({ cards, sourceLinkedCardIds: [], githubLinkedCardIds: [] }).map((issue) => issue.cardId))
      .toEqual(["unassigned", "unassigned", "unassigned", "unassigned", "visible", "visible", "visible", "visible"]);
    expect(visibleCards(cards.map((item) => item.id === "archived" ? { ...item, status: "active" } : item)).map((item) => item.id))
      .toEqual(["grandchild", "child", "archived", "unassigned", "visible"]);
  });
});
