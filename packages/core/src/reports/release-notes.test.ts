import { describe, expect, it } from "vitest";
import type { Card, Release, WorkflowStatus } from "@storymapper/contracts";
import { buildReleaseNotes } from "@storymapper/core";

const release = { id: "release", storyMapId: "map", name: "MVP" } as Release;
const workflowStatuses = [{ id: "complete", storyMapId: null, name: "Shipped", group: "done" }, { id: "other", storyMapId: "other", name: "Foreign done", group: "done" }] as WorkflowStatus[];
function card(id: string, patch: Partial<Card> = {}): Card {
  return { id, storyMapId: "map", parentId: null, releaseId: release.id, key: `K-${id}`, level: "story", title: `Story ${id}`, status: "Shipped", position: 0, parked: false, ...patch } as Card;
}

describe("deterministic completed-Story release notes", () => {
  it("groups by ancestor Activity with stable group/Card positions and IDs, retaining unassigned", () => {
    const cards = [
      card("b", { level: "activity", title: "Checkout", position: 0 }), card("a", { level: "activity", title: "Browse", position: 0 }),
      card("step", { level: "step", parentId: "a" }), card("3", { parentId: "step" }), card("2", { parentId: "step" }),
      card("1", { parentId: "b" }), card("0", { parentId: "step", position: 1 }), card("unassigned"), card("orphan", { parentId: "missing" })
    ];
    const before = structuredClone(cards);
    const expected = "# Release notes: MVP\n\n## Browse\n\n- K-2: Story 2\n- K-3: Story 3\n- K-0: Story 0\n\n## Checkout\n\n- K-1: Story 1\n\n## Unassigned\n\n- K-orphan: Story orphan\n- K-unassigned: Story unassigned\n";
    expect(buildReleaseNotes({ release, cards, workflowStatuses })).toBe(expected);
    expect(buildReleaseNotes({ release, cards: [...cards].reverse(), workflowStatuses: [...workflowStatuses].reverse() })).toBe(expected);
    expect(cards).toEqual(before);
  });

  it("uses configured done names and excludes Notes, incomplete, foreign and invisible trees", () => {
    const cards = [card("archived", { status: "archived", level: "activity" }), card("archived-child", { parentId: "archived" }), card("parked", { level: "activity", parked: true }), card("parked-child", { parentId: "parked" }), card("note", { level: "note" }), card("incomplete", { status: "In Review" }), card("foreign-status", { status: "Foreign done" }), card("foreign-map", { storyMapId: "other" }), card("foreign-release", { releaseId: "other" }), card("visible")];
    expect(buildReleaseNotes({ release, cards, workflowStatuses })).toBe("# Release notes: MVP\n\n## Unassigned\n\n- K-visible: Story visible\n");
  });

  it("terminates broken ancestor cycles and avoids foreign Activity grouping", () => {
    const cards = [card("a", { parentId: "b", level: "step" }), card("b", { parentId: "a", level: "step" }), card("cycle", { parentId: "a" }), card("foreign", { storyMapId: "other", level: "activity" }), card("story", { parentId: "foreign" })];
    expect(buildReleaseNotes({ release, cards, workflowStatuses })).toBe("# Release notes: MVP\n\n## Unassigned\n\n- K-cycle: Story cycle\n- K-story: Story story\n");
  });

  it("renders explicit empty completion and keeps multiline Markdown content within text", () => {
    expect(buildReleaseNotes({ release, cards: [], workflowStatuses })).toBe("# Release notes: MVP\n\nNo completed Stories in this Release.\n");
    expect(buildReleaseNotes({ release, cards: [card("a", { title: "[link](url)\n*item*" })], workflowStatuses })).toContain("- K-a: \\[link\\](url) \\*item\\*");
  });
});
