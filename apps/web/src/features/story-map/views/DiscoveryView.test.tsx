// @vitest-environment jsdom // REQ Story5.4 measured Discovery filter budget
import { readStylesheet } from "@storymapper/web/test-fixtures/styles";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { expect, it } from "vitest";
import { button, cardId, mount, openBoardSearch, state, storyMapId, viewUrl } from "@storymapper/web/test-fixtures/card-detail";

const url = viewUrl.replace(/tree$/, "discovery");
async function search(value: string) {
  await openBoardSearch();
  const input = document.querySelector<HTMLInputElement>('[aria-label="Search cards"]')!;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => { setter.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
const tile = (id: string) => document.querySelector<HTMLElement>(`.discovery-workspace [data-live-card-id="${id}"]`)!;

it("gives the empty board a card-width track and preserves populated column widths", async () => {
  const populated = state.snapshot;
  state.snapshot = { ...state.snapshot, cards: [] };
  await mount(url, "Discovery");
  const matrix = document.querySelector<HTMLElement>(".discovery-matrix")!;
  expect(matrix.getAttribute("aria-colcount")).toBe("1");
  expect(matrix.style.gridTemplateColumns).toBe("232px");
  state.snapshot = populated;
  await act(async () => state.client.setQueryData(["story-map", storyMapId], state.snapshot));
  expect(matrix.style.gridTemplateColumns).toBe("232px 42px 42px");
});

function extraLane() {
  const [activity, step, story] = state.snapshot.cards;
  const secondActivity = { ...activity!, id: randomUUID(), key: "LSM-4", title: "Second Activity", position: 1 };
  const secondStep = { ...step!, id: randomUUID(), key: "LSM-5", title: "Second Step", parentId: secondActivity.id };
  const secondStory = { ...story!, id: randomUUID(), key: "LSM-6", title: "Second Story", parentId: secondStep.id };
  state.snapshot = { ...state.snapshot, cards: [...state.snapshot.cards, secondActivity, secondStep, secondStory] };
  return { secondActivity, secondStep, secondStory };
}
it("retains filtered lanes and Stories, excludes their controls/drag sources and restores the same nodes and accurate counts", async () => {
  const other = extraLane(); await mount(url);
  const first = tile(cardId), second = tile(other.secondStory.id);
  expect(second.querySelector('.drag-handle')!.getAttribute('aria-disabled')).toBe("false");
  await search("Create traceable");
  expect(tile(cardId)).toBe(first); expect(first.closest("[hidden]")).toBeNull();
  expect(tile(other.secondStory.id)).toBe(second); expect(second.closest("[hidden]")).not.toBeNull();
  expect(second.querySelector('.drag-handle')!.getAttribute('aria-disabled')).toBe("true");
  expect(tile(other.secondActivity.id).closest("[hidden]")).not.toBeNull();
  expect(document.querySelector('.board-search-row')!.textContent).toContain("1 matches / 6 cards");
  expect(document.querySelector('.release-band-header')!.textContent).toContain("1 stories");
  const matrix = document.querySelector<HTMLElement>('.discovery-matrix')!;
  expect(matrix.style.gridTemplateColumns.split(" ")).toHaveLength(3);
  expect(matrix.getAttribute("aria-colcount")).toBe("3");
  const visibleHeaders = [...matrix.querySelectorAll('[role="columnheader"]')].filter((header) => !header.closest("[hidden]"));
  expect(visibleHeaders.map((header) => Number(header.getAttribute("aria-colindex")))).toEqual([1, 3, 1, 2, 3]);
  expect(visibleHeaders[0]!.getAttribute("aria-colspan")).toBe("2");
  await act(async () => button("Clear").click());
  expect(tile(other.secondStory.id)).toBe(second); expect(second.closest("[hidden]")).toBeNull();
  expect(second.querySelector('.drag-handle')!.getAttribute('aria-disabled')).toBe("false");
  expect(matrix.style.gridTemplateColumns.split(" ")).toHaveLength(5);
  expect(matrix.getAttribute("aria-colcount")).toBe("5");
  await search("no matching card");
  expect(document.querySelector<HTMLElement>('.discovery-matrix-scroll')!.hidden).toBe(false);
  expect(tile(cardId)).toBe(first);
  await act(async () => button("Clear").click());
  expect(tile(cardId)).toBe(first); expect(first.closest("[hidden]")).toBeNull();
});
it("updates retained filtered cards from canonical refetch and removes newly archived/deleted cards instead of reviving them on reset", async () => {
  const other = extraLane(); await mount(url);
  const second = tile(other.secondStory.id);
  await search("Create traceable");
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === other.secondStory.id ? { ...card, title: "Renamed while filtered", version: card.version + 1 } : card) };
  await act(async () => state.client.setQueryData(["story-map", storyMapId], state.snapshot));
  expect(tile(other.secondStory.id)).toBe(second); expect(second.textContent).toContain("Renamed while filtered");
  expect(second.closest("[hidden]")).not.toBeNull();
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === other.secondStory.id ? { ...card, status: "archived", version: card.version + 1 } : card).filter((card) => card.id !== cardId) };
  await act(async () => state.client.setQueryData(["story-map", storyMapId], state.snapshot));
  await act(async () => button("Clear").click());
  expect(tile(other.secondStory.id)).toBeNull(); expect(tile(cardId)).toBeNull();
});
it("derives Activity move controls from the filtered order", async () => {
  const other = extraLane(); await mount(url);
  const moves = (id: string) => tile(id).querySelectorAll('.card-move[aria-label$=" left"], .card-move[aria-label$=" right"]').length;
  const firstActivityId = state.snapshot.cards[0]!.id;
  expect(moves(firstActivityId)).toBe(1); expect(moves(other.secondActivity.id)).toBe(1);
  await search("Create traceable");
  expect(moves(firstActivityId)).toBe(0);
});
it("keeps filtered Cards display:none from the real stylesheet, including in a standalone export clone outside the workspace", async () => {
  const style = document.createElement("style");
  style.textContent = readStylesheet(join(process.cwd(), "src/styles/global.css"));
  document.head.append(style);
  const other = extraLane(); await mount(url);
  await search("Create traceable");
  const exported = document.body.appendChild(document.createElement("div"));
  exported.append(document.querySelector(".discovery-matrix-scroll")!.cloneNode(true));
  const hiddenNodes = [...exported.querySelectorAll<HTMLElement>("[hidden]")];
  expect(hiddenNodes.some((node) => node.contains(exported.querySelector(`[data-live-card-id="${other.secondStory.id}"]`)))).toBe(true);
  expect(exported.closest(".discovery-workspace")).toBeNull();
  expect(hiddenNodes.map((node) => getComputedStyle(node).display)).toEqual(hiddenNodes.map(() => "none"));
  exported.remove(); style.remove();
});

it("indexes unequal Activity groups exactly through filtering", async () => {
  const [activity, step, story] = state.snapshot.cards;
  const secondStep = { ...step!, id: randomUUID(), key: "LSM-4", title: "Second first-group Step", position: 1 };
  const other = { ...activity!, id: randomUUID(), key: "LSM-5", title: "Larger Activity", position: 1 };
  const otherSteps = Array.from({ length: 3 }, (_, index) => ({ ...step!, id: randomUUID(), parentId: other.id, key: `LSM-${index + 6}`, title: `Other Step ${index}`, position: index }));
  const needle = { ...story!, id: randomUUID(), key: "LSM-9", title: "Unique needle", parentId: otherSteps[1]!.id };
  state.snapshot.cards.push(secondStep, other, ...otherSteps, needle);
  await mount(url);
  const grid = document.querySelector('[role="grid"]')!;
  const indices = (row: number) => [...grid.querySelector(`[role="row"][aria-rowindex="${row}"]`)!.querySelectorAll('[role="columnheader"]')].filter((cell) => !cell.closest('[hidden]')).map((cell) => [Number(cell.getAttribute("aria-colindex")), Number(cell.getAttribute("aria-colspan") ?? 1)]);
  expect(grid.getAttribute("aria-colcount")).toBe("8");
  expect(grid.getAttribute("aria-rowcount")).toBe("7");
  expect(indices(1)).toEqual([[1, 3], [4, 4], [8, 1]]);
  expect(indices(2)).toEqual(Array.from({ length: 8 }, (_, index) => [index + 1, 1]));
  await search("Unique needle");
  expect(grid.getAttribute("aria-colcount")).toBe("3");
  expect(indices(1)).toEqual([[1, 2], [3, 1]]);
  expect(indices(2)).toEqual([[1, 1], [2, 1], [3, 1]]);
});

it("guides the saved hierarchy through existing composers, ignores filters and recovers after deletion or archival", async () => {
  const [activity, step, story] = state.snapshot.cards;
  state.snapshot = { ...state.snapshot, cards: [] };
  await mount(url, "Discovery");
  const trigger = document.querySelector<HTMLButtonElement>('[aria-label="Story Map help"]')!;
  expect(trigger.closest(".view-toolbar-actions")).not.toBeNull();
  expect(document.body.textContent).not.toContain("Changes are saved automatically");
  const setCards = async (cards: typeof state.snapshot.cards) => {
    state.snapshot = { ...state.snapshot, cards };
    await act(async () => state.client.setQueryData(["story-map", storyMapId], state.snapshot));
  };
  const openGuidedComposer = async (label: string, parent: string) => {
    await act(async () => { trigger.focus(); trigger.click(); });
    const action = button(label);
    await act(async () => { action.focus(); action.click(); });
    const dialog = document.querySelector('[role="dialog"]')!;
    expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
    expect(dialog.contains(document.activeElement)).toBe(true);
    const parentSelect = [...dialog.querySelectorAll("label")].find((label) => label.firstChild?.textContent === "Parent")?.querySelector("select");
    expect(parentSelect?.value).toBe(parent);
    await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.activeElement).toBe(trigger);
  };
  await openGuidedComposer("Create your first Activity", "");
  await setCards([activity!]);
  await openGuidedComposer("Create a Step in your Activity", activity!.id);
  await setCards([activity!, step!]);
  await openGuidedComposer("Create a Story in your Step", step!.id);
  await setCards([activity!, step!, { ...story!, parentId: null }]);
  await act(async () => trigger.click());
  expect(document.body.textContent).toContain("Create a Story in your Step");
  await setCards([activity!, step!, story!]);
  const progress = document.querySelector('[role="dialog"] [role="status"]');
  expect(progress!.textContent).toContain("Your Activity, Step and Story are ready");
  expect(document.body.textContent).not.toContain("Create a Story in your Step");
  expect(document.body.textContent).toContain("Changes are saved automatically on this computer");
  await act(async () => button("Close").click());
  await search("no matching card");
  await act(async () => trigger.click());
  expect(state.host.textContent).not.toContain("Create your first Activity");
  await setCards([activity!, step!]);
  expect(document.body.textContent).toContain("Create a Story in your Step");
  await setCards([{ ...activity!, parked: true }, step!, story!]);
  expect(document.body.textContent).toContain("Create your first Activity");
  await setCards([activity!, { ...step!, parentId: null }, story!]);
  expect(document.body.textContent).toContain("Create a Step in your Activity");
});

it("keeps Tree help in the existing toolbar and restores focus after closing", async () => {
  state.snapshot = { ...state.snapshot, cards: [] };
  await mount(viewUrl, "Tree");
  const trigger = document.querySelector<HTMLButtonElement>('[aria-label="Story Map help"]')!;
  expect(trigger.closest(".view-toolbar-actions")).not.toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(state.host.textContent).not.toContain("Create your first Activity");
  await act(async () => { trigger.focus(); trigger.click(); });
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog.contains(document.activeElement)).toBe(true);
  expect(dialog.textContent).toContain("Create your first Activity");
  await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(document.activeElement).toBe(trigger);
});
