import { expect, it } from "vitest";
import type { Card, StoryMapSnapshot } from "@storymapper/contracts";
import { dependencyCues } from "@storymapper/core/reports/dependency-cues";

it.each(["activity", "step", "story", "note"] as const)("analyzes configured completion and canonical Release ordering for %s", (level) => {
  const card = (id: string, patch: Partial<Card> = {}) => ({ id, key: id, title: id, storyMapId: "map", level, releaseId: "a", status: "todo", ...patch });
  const snapshot = { storyMap: { id: "map" }, cards: [card("dependent"), card("shipped", { releaseId: "b", status: "Released" }), card("hidden", { releaseId: null, status: "archived" })], releases: [{ id: "b", storyMapId: "map", position: 0 }, { id: "a", storyMapId: "map", position: 0 }], workflowStatuses: [{ storyMapId: "map", name: "Released", group: "done" }, { storyMapId: "other", name: "archived", group: "done" }], cardDependencies: [{ cardId: "dependent", prerequisiteCardId: "shipped" }, { cardId: "dependent", prerequisiteCardId: "hidden" }] } as unknown as StoryMapSnapshot;
  expect(dependencyCues(snapshot, ["dependent"]).map(({ prerequisite, open, blockedOrder }) => [prerequisite.key, open, blockedOrder])).toEqual([["shipped", false, true], ["hidden", true, true]]);
  snapshot.cards[0]!.releaseId = null;
  expect(dependencyCues(snapshot, ["dependent"]).every((cue) => !cue.blockedOrder)).toBe(true);
  expect(dependencyCues(snapshot, [])).toEqual([]);
  snapshot.cards.pop();
  expect(() => dependencyCues(snapshot, ["dependent"])).toThrow("Dependency endpoint is missing");
});

it("ignores Releases and Cards of other Story Maps", () => {
  const card = (id: string, storyMapId: string, releaseId: string | null) => ({ id, key: id, title: id, storyMapId, level: "story", releaseId, status: "todo" });
  const snapshot = { storyMap: { id: "map" }, cards: [card("dependent", "map", "mine"), card("prerequisite", "map", "mine")], releases: [{ id: "foreign", storyMapId: "other", position: -1 }, { id: "mine", storyMapId: "map", position: 0 }], workflowStatuses: [], cardDependencies: [{ cardId: "dependent", prerequisiteCardId: "prerequisite" }] } as unknown as StoryMapSnapshot;
  expect(dependencyCues(snapshot, ["dependent"]).map((cue) => cue.blockedOrder)).toEqual([false]);
  snapshot.cards[1] = card("prerequisite", "other", "mine") as never;
  expect(() => dependencyCues(snapshot, ["dependent"])).toThrow("Dependency endpoint is missing");
});
