import { describe, expect, it } from "vitest";
import type { Card, StoryMapSnapshot } from "@storymapper/contracts";
import { buildGraphModel, EMPTY_GRAPH_FILTERS, topologicalCards } from "@storymapper/web/features/story-map/graph/graph-model";
import { dependencyCues } from "@storymapper/core";

const card = (id: string, patch: Partial<Card> = {}): Card => ({ id, key: id, title: id, storyMapId: "map", parentId: null, releaseId: "r1", level: "story", status: "todo", parked: false, ...patch } as Card);
function fixture(): StoryMapSnapshot {
  return { storyMap: { id: "map" }, cards: [card("activity", { level: "activity" }), card("step", { level: "step", parentId: "activity" }), card("story", { parentId: "step", assignee: "Ada" }), card("note", { level: "note", parentId: "activity", releaseId: null }), card("hidden", { status: "archived", releaseId: null }), card("child", { parentId: "hidden" }), card("park", { parked: true }), card("foreign", { storyMapId: "other" })], releases: [{ id: "r1", storyMapId: "map", position: 0 }, { id: "r2", storyMapId: "map", position: 0 }], workflowStatuses: [{ name: "Shipped", storyMapId: null, group: "done" }, { name: "todo", storyMapId: "other", group: "done" }], cardDependencies: [{ id: "a", cardId: "story", prerequisiteCardId: "step" }, { id: "b", cardId: "story", prerequisiteCardId: "hidden" }, { id: "c", cardId: "note", prerequisiteCardId: "story" }] } as unknown as StoryMapSnapshot;
}
describe("graph canonical model", () => {
  it("includes every active level and only edges with both endpoints visible, retaining hidden canonical names", () => {
    const model = buildGraphModel(fixture(), EMPTY_GRAPH_FILTERS);
    expect(model.cards.map((item) => item.id)).toEqual(["activity", "step", "story", "note"]);
    expect(model.edges.map((edge) => edge.id)).toEqual(["a", "c"]);
    expect(model.requires.get("story")!.map((item) => item.key)).toEqual(["step", "hidden"]);
    expect(model.cues.find((cue) => cue.prerequisite.id === "hidden")).toMatchObject({ open: true, blockedOrder: true });
  });
  it("intersects exact Activity ancestry, Slice, status and assignee filters including null values", () => {
    const input = fixture();
    expect(buildGraphModel(input, { ...EMPTY_GRAPH_FILTERS, activity: "activity" }).cards).toHaveLength(4);
    const model = buildGraphModel(input, { activity: "activity", slice: "r1", status: "todo", assignee: "assigned:Ada" });
    expect(model.cards.map((item) => item.id)).toEqual(["story"]); expect(model.edges).toEqual([]);
    expect(buildGraphModel(input, { ...EMPTY_GRAPH_FILTERS, slice: "unscheduled", assignee: "unassigned" }).cards.map((item) => item.id)).toEqual(["note"]);
    expect(buildGraphModel(input, { ...EMPTY_GRAPH_FILTERS, slice: "unscheduled", assignee: "assigned:Ada" }).cards).toEqual([]);
  });
  it.each(["activity", "step", "story", "note"] as const)("uses configured completion and position/ID ordering for %s dependents", (level) => {
    const input = fixture(); input.cards = [card("dependent", { level }), card("done", { releaseId: "r2", status: "Shipped" }), card("open", { releaseId: null, status: "archived" })];
    input.cardDependencies = [{ cardId: "dependent", prerequisiteCardId: "done" }, { cardId: "dependent", prerequisiteCardId: "open" }] as StoryMapSnapshot["cardDependencies"];
    const cues = dependencyCues(input, ["dependent"]);
    expect(cues.map(({ open, blockedOrder }) => [open, blockedOrder])).toEqual([[false, true], [true, true]]);
    input.cards[0]!.releaseId = null;
    expect(dependencyCues(input, ["dependent"]).every((cue) => !cue.blockedOrder)).toBe(true);
  });
  it("fails visibly for a missing canonical endpoint and cycles, and breaks title ties by ID", () => {
    const input = fixture(); input.cards = input.cards.filter((item) => item.id !== "hidden");
    expect(() => buildGraphModel(input, EMPTY_GRAPH_FILTERS)).toThrow("endpoint is missing");
    expect(topologicalCards([card("b", { title: "Same" }), card("a", { title: "Same" })], []).map((item) => item.id)).toEqual(["a", "b"]);
    expect(() => topologicalCards([card("a")], [{ cardId: "a", prerequisiteCardId: "a" }] as StoryMapSnapshot["cardDependencies"])).toThrow("cycle");
  });
});

it("distinguishes a literal unassigned assignee from an absent assignee", () => {
  const input = fixture();
  input.cards = [card("named", { assignee: "unassigned" }), card("absent")];
  input.cardDependencies = [];
  expect(buildGraphModel(input, { ...EMPTY_GRAPH_FILTERS, assignee: "assigned:unassigned" }).cards.map((item) => item.id)).toEqual(["named"]);
  expect(buildGraphModel(input, { ...EMPTY_GRAPH_FILTERS, assignee: "unassigned" }).cards.map((item) => item.id)).toEqual(["absent"]);
});

it("drops filter values that no longer match an option instead of silently emptying the dataset", () => {
  const model = buildGraphModel(fixture(), { activity: "gone", slice: "gone", status: "gone", assignee: "assigned:gone" });
  expect(model.filters).toEqual(EMPTY_GRAPH_FILTERS);
  expect(model.cards).toHaveLength(4);
});
