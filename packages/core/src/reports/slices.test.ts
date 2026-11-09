import { describe, expect, it } from "vitest";
import type { Card, PlanState, Release, StoryMapSnapshot } from "@storymapper/contracts";
import { buildPlanStateProjection, buildSlicesReport, comparePlanStates } from "@storymapper/core";

function card(id: string, patch: Partial<Card> = {}): Card {
  return { id, key: id, storyMapId: "map", parentId: null, releaseId: "r1", level: "story", title: id, status: "todo", parked: false, position: 0, ...patch } as Card;
}
function snapshot(cards: Card[]): StoryMapSnapshot {
  return { storyMap: { id: "map", projectId: "project" }, cards, releases: [{ id: "r1", storyMapId: "map", name: "First", position: 0 }, { id: "r2", storyMapId: "map", name: "Second", position: 1 }] as Release[], workflowStatuses: [{ storyMapId: null, name: "Shipped", group: "done" }, { storyMapId: "other", name: "Foreign", group: "done" }], cardDependencies: [] } as unknown as StoryMapSnapshot;
}
function state(input: StoryMapSnapshot): PlanState {
  return { id: "state", projectId: "project", storyMapId: "map", schemaVersion: 1, capturedAt: "2026-10-15T00:00:00Z", actor: "human", payload: buildPlanStateProjection(input) };
}

describe("Slices canonical analysis", () => {
  it("counts Stories and configured completion, excludes hidden hierarchies, retains named unknown statuses and Activity progress", () => {
    const input = snapshot([card("activity", { level: "activity", estimate: 100 }), card("step", { parentId: "activity", level: "step", estimate: 100 }), card("a", { parentId: "step", estimate: 3, status: "Shipped" }), card("b", { parentId: "step", estimate: 5, status: "Foreign", releaseId: null }), card("archived", { level: "activity", status: "archived" }), card("hidden", { parentId: "archived", estimate: 500 }), card("parked", { parked: true }), card("note", { level: "note" })]);
    const report = buildSlicesReport(input);
    expect(report.lanes.map(({ name, storyCount, doneCount, estimateTotal, statusCounts, activities }) => ({ name, storyCount, doneCount, estimateTotal, statusCounts, activities }))).toEqual([
      { name: "First", storyCount: 1, doneCount: 1, estimateTotal: 3, statusCounts: { Shipped: 1 }, activities: [{ activityId: "activity", name: "activity", storyCount: 1, doneCount: 1, estimateTotal: 3, statusCounts: { Shipped: 1 } }] },
      { name: "Second", storyCount: 0, doneCount: 0, estimateTotal: 0, statusCounts: {}, activities: [] },
      { name: "Unscheduled", storyCount: 1, doneCount: 0, estimateTotal: 5, statusCounts: { Foreign: 1 }, activities: [{ activityId: "activity", name: "activity", storyCount: 1, doneCount: 0, estimateTotal: 5, statusCounts: { Foreign: 1 } }] }
    ]);
  });
  it("keeps ordering independent of completion and names archived/non-Story/unscheduled prerequisites", () => {
    const input = snapshot([card("dependent"), card("done-later", { releaseId: "r2", status: "Shipped" }), card("hidden", { level: "step", status: "archived", releaseId: null }), card("unscheduled", { releaseId: null })]);
    input.cardDependencies = [{ cardId: "dependent", prerequisiteCardId: "done-later" }, { cardId: "dependent", prerequisiteCardId: "hidden" }, { cardId: "unscheduled", prerequisiteCardId: "done-later" }] as StoryMapSnapshot["cardDependencies"];
    const report = buildSlicesReport(input);
    expect(report.dependencies.map(({ cardId, prerequisite, open, blockedOrder }) => [cardId, prerequisite.key, open, blockedOrder])).toEqual([["dependent", "done-later", false, true], ["dependent", "hidden", true, true], ["unscheduled", "done-later", false, false]]);
    expect(report.lanes[0]!.blockers.map((cue) => cue.prerequisite.id)).toEqual(["hidden"]);
  });
  it("compares complete identity sets once, reverses categories, ignores names and positions and treats null as a move", () => {
    const before = state(snapshot([card("a"), card("b")]));
    const after = state(snapshot([card("a", { releaseId: "r2", title: "Changed" }), card("c", { releaseId: null })]));
    expect(comparePlanStates(before, after).changes).toEqual([{ cardId: "a", kind: "moved", beforeReleaseId: "r1", afterReleaseId: "r2" }, { cardId: "b", kind: "removed", beforeReleaseId: "r1", afterReleaseId: null }, { cardId: "c", kind: "added", beforeReleaseId: null, afterReleaseId: null }]);
    expect(comparePlanStates(after, before).changes.map((change) => [change.cardId, change.kind])).toEqual([["a", "moved"], ["c", "removed"], ["b", "added"]]);
    const renamed = structuredClone(before); renamed.payload.releases[0]!.name = "Renamed"; renamed.payload.cards[0]!.position = 99;
    expect(comparePlanStates(before, renamed).changes).toEqual([]);
    const unscheduled = state(snapshot([card("a", { releaseId: null }), card("b")]));
    expect(comparePlanStates(before, unscheduled).changes[0]).toMatchObject({ kind: "moved", afterReleaseId: null });
    expect(comparePlanStates(before, before).changes).toEqual([]);
    expect(() => comparePlanStates(before, { ...after, storyMapId: "other" })).toThrow("same Story Map");
  });
  it("captures independent values without mutating canonical data", () => {
    const input = snapshot([card("a")]); const captured = buildPlanStateProjection(input);
    input.cards[0]!.title = "Edited"; input.releases.splice(0); input.cards.splice(0);
    expect(captured.cards[0]!.title).toBe("a"); expect(captured.releases).toHaveLength(2);
  });
});
