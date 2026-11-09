// @vitest-environment jsdom
import { act } from "react";
import { router } from "@storymapper/web/app/router";
import { releaseSchema } from "@storymapper/contracts";
import { expect, it } from "vitest";
import { useTreeCollapseStore } from "@storymapper/web/app/stores/tree-collapse-store";
import { useDiscoveryLaneCollapseStore } from "@storymapper/web/app/stores/discovery-lane-collapse-store";
import { mount, state, cardId, storyMapId, viewUrl } from "@storymapper/web/test-fixtures/card-detail";

const discovery = viewUrl.replace(/tree$/, "discovery");
const primary = (id: string) => document.querySelector<HTMLButtonElement>(`button[data-card-id="${id}"]`)!;
const toggle = (title: string, collapsed = false) => document.querySelector<HTMLButtonElement>(`button[aria-label="${collapsed ? "Expand" : "Collapse"} ${title}"]`)!;
const hidden = (id: string) => primary(id)?.closest("[hidden]") !== null;
async function key(id: string, value: string) {
  await act(async () => { primary(id).focus(); primary(id).dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true })); });
}

it("rehydrates serialized hierarchy preferences per map for Tree while Discovery ignores them", async () => {
  const [activity, step] = state.snapshot.cards;
  await mount(discovery);
  await act(async () => useTreeCollapseStore.getState().setCollapsed(storyMapId, [step!.id]));
  await act(async () => useTreeCollapseStore.getState().setCollapsed("other-map", ["other-activity"]));
  const persisted = localStorage.getItem("storymapper-tree-collapse")!;
  await act(async () => useTreeCollapseStore.setState({ collapsedByMap: {} }));
  localStorage.setItem("storymapper-tree-collapse", persisted);
  await act(async () => { await useTreeCollapseStore.persist.rehydrate(); });
  expect(hidden(cardId)).toBe(false);
  expect(useTreeCollapseStore.getState().collapsedByMap).toEqual({ [storyMapId]: [step!.id], "other-map": ["other-activity"] });
  await act(async () => state.root.unmount()); state.client.clear();
  await mount(viewUrl, activity!.title);
  expect(primary(cardId)).toBeNull();
  await act(async () => toggle(step!.title, true).click());
  expect(primary(cardId)).not.toBeNull();
  expect(useTreeCollapseStore.getState().collapsedByMap["other-map"]).toEqual(["other-activity"]);
});

it("recovers Tree focus when an external shared preference hides a focused child", async () => {
  const [activity] = state.snapshot.cards;
  await mount(viewUrl);
  await act(async () => primary(cardId).focus());
  await act(async () => useTreeCollapseStore.getState().setCollapsed(storyMapId, [activity!.id]));
  expect(document.activeElement).toBe(primary(activity!.id));
});

it("counts lane-hidden selections without treating unassigned Cards as release-lane content", async () => {
  const story = state.snapshot.cards[2]!;
  const unassigned = { ...story, id: crypto.randomUUID(), key: "LSM-4", parentId: null, releaseId: null };
  state.snapshot = { ...state.snapshot, cards: [...state.snapshot.cards.map((card) => ({ ...card, releaseId: null })), unassigned] };
  await mount(discovery);
  await key(cardId, " "); await key(unassigned.id, " ");
  await act(async () => useDiscoveryLaneCollapseStore.getState().setCollapsed(storyMapId, ["release:unscheduled"]));
  expect(document.querySelector(".bulk-action-bar [role=status]")!.textContent).toContain("2 selected: 1 visible, 1 hidden");
  expect(hidden(cardId)).toBe(true); expect(hidden(unassigned.id)).toBe(false);
  await act(async () => useDiscoveryLaneCollapseStore.getState().setCollapsed(storyMapId, []));
  expect(document.querySelector(".bulk-action-bar [role=status]")!.textContent).toContain("2 selected: 2 visible, 0 hidden");
});

it("counts only shown Planning Releases and updates counts when Show all changes", async () => {
  const release = releaseSchema.parse({ id: crypto.randomUUID(), storyMapId, name: "Delivered", version: 1, startDate: null, releaseDate: null, released: true, position: 0 });
  state.snapshot = { ...state.snapshot, releases: [release], cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, releaseId: release.id } : card) };
  await mount(discovery);
  await key(cardId, " ");
  await act(async () => router.navigate({ to: viewUrl.replace(/tree$/, "planning") }));
  expect(document.querySelector(".bulk-action-bar [role=status]")!.textContent).toContain("1 selected: 0 visible, 1 hidden");
  await act(async () => document.querySelector<HTMLInputElement>('.board-workspace > label input')!.click());
  expect(document.querySelector(".bulk-action-bar [role=status]")!.textContent).toContain("1 selected: 1 visible, 0 hidden");
});
