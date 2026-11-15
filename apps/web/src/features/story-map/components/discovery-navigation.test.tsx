// @vitest-environment jsdom
import { api } from "@storymapper/web/app/api";
import { act } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useDiscoveryZoomStore } from "@storymapper/web/app/stores/discovery-zoom-store";
import { discoveryDestination } from "@storymapper/web/features/story-map/components/discovery-navigation";
import { mount, state, cardId, storyMapId, viewUrl } from "@storymapper/web/test-fixtures/card-detail";

const locations = [
  { id: "a", lane: 0, column: 0, stack: 0 }, { id: "b", lane: 0, column: 1, stack: 0 },
  { id: "c", lane: 1, column: 0, stack: 0 }, { id: "d", lane: 1, column: 0, stack: 1 }, { id: "e", lane: 1, column: 1, stack: 0 },
  { id: "f", lane: 3, column: 0, stack: 0 }
];
afterEach(async () => { await act(async () => useDiscoveryZoomStore.getState().resetZoom()); });
it("traverses columns, stacks, rows, grid ends and skips absent lanes", () => {
  for (const [id, key, control, expected] of [
    ["a", "ArrowRight", false, "b"], ["b", "ArrowLeft", false, "a"],
    ["c", "ArrowDown", false, "d"], ["d", "ArrowUp", false, "c"], ["d", "ArrowDown", false, "f"],
    ["f", "ArrowUp", false, "d"], ["d", "Home", false, "c"], ["c", "End", false, "e"],
    ["d", "Home", true, "a"], ["c", "End", true, "f"], ["d", "PageDown", false, "f"], ["f", "PageUp", false, "c"]
  ] as const) expect(discoveryDestination(locations, id, key, control), `${id} ${key}`).toBe(expected);
});
const primary = (id: string) => document.querySelector<HTMLButtonElement>(`button[data-card-id="${id}"]`)!;
async function key(target: HTMLElement, value: string, init: KeyboardEventInit = {}) {
  await act(async () => { target.dispatchEvent(new KeyboardEvent("keydown", { key: value, bubbles: true, cancelable: true, ...init })); });
}
it("roves primary focus, scopes keys, orders secondary controls and opens complete Move", async () => {
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const [activity, step] = state.snapshot.cards;
  expect(document.querySelector('[role="grid"]')).not.toBeNull();
  for (const cell of document.querySelectorAll('[role="gridcell"]')) expect(cell.closest('[role="row"]')).not.toBeNull();
  expect([...document.querySelectorAll<HTMLButtonElement>('[data-card-id]')].filter((button) => button.tabIndex === 0)).toHaveLength(1);
  await act(async () => primary(activity!.id).focus());
  await key(primary(activity!.id), "ArrowDown"); expect(document.activeElement).toBe(primary(step!.id));
  await key(primary(step!.id), "ArrowDown"); expect(document.activeElement).toBe(primary(cardId));
  await key(primary(cardId), " ");
  const tile = primary(cardId).closest('article')!;
  const checkbox = tile.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
  expect(checkbox.checked).toBe(true);
  expect(primary(cardId).getAttribute("aria-pressed")).toBe("true");
  expect(tile.closest('[role="gridcell"]')?.getAttribute("aria-selected")).toBe("true");
  expect(primary(cardId).compareDocumentPosition(checkbox) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  expect(primary(activity!.id).closest('article')!.querySelector<HTMLInputElement>('input')!.tabIndex).toBe(-1);
  await act(async () => checkbox.focus()); await key(checkbox, "m"); await key(checkbox, "Delete");
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await key(checkbox, "Escape"); expect(document.activeElement).toBe(primary(cardId));
  await key(primary(cardId), "m", { ctrlKey: true }); expect(document.querySelector('[role="dialog"]')).toBeNull();
  await key(primary(cardId), "m"); expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  expect(document.querySelector('[role="dialog"] select')).not.toBeNull();
});
it("repairs removed focused identity to the next previous-order survivor and then grid", async () => {
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const [activity, step] = state.snapshot.cards;
  await act(async () => primary(step!.id).focus());
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.filter((card) => card.id !== step!.id).map((card) => card.id === cardId ? { ...card, parentId: null } : card) };
  await act(async () => state.client.setQueryData(["story-map", storyMapId], state.snapshot));
  expect(document.activeElement).toBe(primary(cardId));
  state.snapshot = { ...state.snapshot, cards: [] };
  await act(async () => state.client.setQueryData(["story-map", storyMapId], state.snapshot));
  expect(primary(activity!.id)).toBeNull();
  expect(document.activeElement).toBe(document.querySelector('[role="grid"]'));
});

it("does not pull focus back into the grid after the user leaves it", async () => {
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const step = state.snapshot.cards[1]!;
  await act(async () => primary(step.id).focus());
  await act(async () => primary(step.id).blur());
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === step.id ? { ...card, title: "Renamed after blur" } : card) };
  await act(async () => state.client.setQueryData(["story-map", storyMapId], state.snapshot));
  expect(document.activeElement).toBe(document.body);
});
it("confirms the full selection without writes, retains captured baselines on conflicts and cancels safely", async () => {
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const activity = state.snapshot.cards[0]!;
  await act(async () => primary(activity.id).focus()); await key(primary(activity.id), " ");
  await act(async () => primary(cardId).focus()); await key(primary(cardId), " ");
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  const requests: Array<Record<string, unknown>> = [];
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (String(input) === "/api/cards/delete-set") {
      requests.push(JSON.parse(String(init?.body)) as Record<string, unknown>);
      return new Response(JSON.stringify({ message: "Two Cards changed" }), { status: 409, headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(input, init);
  });
  await key(primary(cardId), "Delete");
  expect(requests).toHaveLength(0);
  const dialog = document.querySelector('[role="alertdialog"]')!;
  expect(dialog.textContent).toContain("Delete 2 Cards");
  expect(dialog.textContent).toContain("1 unselected child Cards");
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => ({ ...card, version: card.version + 1 })) };
  await act(async () => state.client.setQueryData(["story-map", storyMapId], state.snapshot));
  await act(async () => dialog.querySelector<HTMLInputElement>('input[type="radio"]')!.click());
  const confirm = [...dialog.querySelectorAll('button')].at(-1)!;
  await act(async () => confirm.click());
  expect(requests).toHaveLength(1);
  expect(requests[0]!.cards).toEqual([{ id: activity.id, baseVersion: 1 }, { id: cardId, baseVersion: 1 }]);
  expect(dialog.textContent).toContain("Request failed: 409");
  await act(async () => confirm.click()); expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
  await act(async () => dialog.querySelector<HTMLButtonElement>('[data-dialog-cancel]')!.click());
  expect(document.querySelector('[role="alertdialog"]')).toBeNull(); expect(requests).toHaveLength(2);
});

it("restores next prior-order tile after successful confirmed deletion and dialog cleanup", async () => {
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const step = state.snapshot.cards[1]!;
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (String(input) === "/api/cards/delete-set") {
      state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.filter((card) => card.id !== step.id).map((card) => card.id === cardId ? { ...card, parentId: null } : card) };
      return new Response(JSON.stringify({ ok: true, cardIds: [step.id] }), { headers: { "Content-Type": "application/json" } });
    }
    return originalFetch(input, init);
  });
  await act(async () => primary(step.id).focus()); await key(primary(step.id), "Delete");
  await act(async () => document.querySelector<HTMLInputElement>('[role="alertdialog"] input[type="radio"]')!.click());
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>('[role="alertdialog"] button')].at(-1)!.click());
  await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).toBeNull());
  expect(document.activeElement).toBe(primary(cardId));
});

it("skips collapsed retained lane Cards and repairs focus to the previous surviving tile", async () => {
  const releaseId = crypto.randomUUID();
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, releaseId } : card), releases: [{ id: releaseId, storyMapId, version: 1, name: "Delivery", goal: "", released: false, position: 0, startDate: "2026-10-01", releaseDate: "2026-10-31" }] };
  await mount(viewUrl.replace(/tree$/, "discovery"));
  await act(async () => primary(cardId).focus());
  const collapse = document.querySelector<HTMLButtonElement>('.lane-collapse')!;
  await act(async () => { collapse.focus(); collapse.click(); });
  expect(primary(cardId).closest('[hidden]')).not.toBeNull();
  expect(primary(cardId).tabIndex).toBe(-1);
  expect(document.activeElement).toBe(primary(state.snapshot.cards[1]!.id));
  await key(document.activeElement as HTMLElement, "PageDown");
  expect(document.activeElement).toBe(primary(state.snapshot.cards[1]!.id));
});

it("blocks Delete until external affected roots are captured and preserves their displayed baselines", async () => {
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const external = { ...state.snapshot.cards[2]!, id: crypto.randomUUID(), storyMapId: crypto.randomUUID(), key: "OTHER-1", title: "Shared evidence owner", version: 8 };
  let complete: (cards: typeof external[]) => void = () => {};
  vi.spyOn(api, "captureDeleteAffectedCards").mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
  const originalFetch = vi.mocked(fetch).getMockImplementation()!;
  let command: Record<string, unknown> | undefined;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (String(input) === "/api/cards/delete-set") {
      command = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ message: "Conflict" }), { status: 409 });
    }
    return originalFetch(input, init);
  });
  await act(async () => primary(cardId).focus()); await key(primary(cardId), "Delete");
  const dialog = document.querySelector('[role="alertdialog"]')!;
  const confirm = [...dialog.querySelectorAll('button')].at(-1)!;
  expect(confirm.disabled).toBe(true); expect(command).toBeUndefined();
  await act(async () => complete([external]));
  expect(dialog.textContent).toContain("Shared evidence owner"); expect(confirm.disabled).toBe(false);
  await act(async () => confirm.click());
  expect(command!.affectedCards).toContainEqual({ id: external.id, baseVersion: 8 });
});

it("uses spanning Activity columns for vertical navigation across multi-Step groups", async () => {
  const [activity, step] = state.snapshot.cards;
  const secondStep = { ...step!, id: crypto.randomUUID(), key: "LSM-4", position: 1 };
  const otherActivity = { ...activity!, id: crypto.randomUUID(), key: "LSM-5", position: 1 };
  const otherStep = { ...step!, id: crypto.randomUUID(), key: "LSM-6", parentId: otherActivity.id };
  state.snapshot = { ...state.snapshot, cards: [...state.snapshot.cards, secondStep, otherActivity, otherStep] };
  await mount(viewUrl.replace(/tree$/, "discovery"));
  await act(async () => primary(otherActivity.id).focus()); await key(primary(otherActivity.id), "ArrowDown");
  expect(document.activeElement).toBe(primary(otherStep.id));
  await act(async () => primary(secondStep.id).focus()); await key(primary(secondStep.id), "ArrowUp");
  expect(document.activeElement).toBe(primary(activity!.id));
});
it("blocks modified native activation keys and preview-query Move/Delete/drag mutations", async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  const writes: string[] = [];
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (init?.method && init.method !== "GET") writes.push(String(path));
    if (String(path).startsWith("/api/changesets/")) return new Response(JSON.stringify({ message: "Preview unavailable" }), { status: 503, headers: { "content-type": "application/json" } });
    return original(path, init);
  });
  await mount(`${viewUrl.replace(/tree$/, "discovery")}?preview=${crypto.randomUUID()}`);
  const tile = primary(cardId).closest('article')!;
  for (const control of tile.querySelectorAll<HTMLButtonElement>('button')) {
    expect(control.disabled).toBe(!control.hasAttribute("data-card-id")); await act(async () => control.click());
  }
  await act(async () => primary(state.snapshot.cards[0]!.id).focus());
  await key(primary(state.snapshot.cards[0]!.id), "ArrowDown"); expect(document.activeElement).toBe(primary(state.snapshot.cards[1]!.id));
  for (const value of ["Enter", "m", "Delete", " "]) await key(primary(cardId), value);
  expect(document.querySelector('[role="dialog"], [role="alertdialog"]')).toBeNull(); expect(writes).toHaveLength(0);
  for (const value of ["Enter", " "]) {
    const event = new KeyboardEvent("keydown", { key: value, ctrlKey: true, bubbles: true, cancelable: true });
    await act(async () => primary(cardId).dispatchEvent(event)); expect(event.defaultPrevented).toBe(true);
  }
});

it("traverses Not assigned tiles as columns in their visible order", async () => {
  const note = { ...state.snapshot.cards[2]!, id: crypto.randomUUID(), key: "LSM-4", level: "note" as const, parentId: null, position: 1 };
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, parentId: null } : card).concat(note) };
  await mount(viewUrl.replace(/tree$/, "discovery"));
  await act(async () => primary(cardId).focus()); await key(primary(cardId), "ArrowRight"); expect(document.activeElement).toBe(primary(note.id));
  await key(primary(note.id), "ArrowLeft"); expect(document.activeElement).toBe(primary(cardId));
});

it.each([1, 0.66])("captures pointer-drag baseline and restores moved focus at zoom %s", async (zoom) => {
  useDiscoveryZoomStore.getState().setZoom(zoom);
  class TestPointerEvent extends MouseEvent { readonly pointerId = 1; readonly isPrimary = true; readonly pointerType = "mouse"; }
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const source = this.matches("div") && this.firstElementChild?.matches(`article[data-live-card-id="${cardId}"]`);
    const x = (this.closest(".discovery-notassigned") ? 400 : source ? 0 : -1000) * zoom;
    return { x, y: 0, left: x, right: x + 300 * zoom, top: 0, bottom: 500 * zoom, width: 300 * zoom, height: 500 * zoom, toJSON() { return {}; } };
  });
  const original = vi.mocked(fetch).getMockImplementation()!;
  let command: Record<string, unknown> | undefined;
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (String(path) === `/api/cards/${cardId}/move`) {
      command = JSON.parse(String(init?.body)) as Record<string, unknown>;
      state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, parentId: null, releaseId: null, version: 8 } : card) };
      return Response.json(state.snapshot.cards.find((card) => card.id === cardId));
    }
    return original(path, init);
  });
  await mount(viewUrl.replace(/tree$/, "discovery"));
  await act(async () => primary(state.snapshot.cards[0]!.id).focus());
  const drag = primary(cardId).closest('article')!.querySelector<HTMLButtonElement>('.drag-handle')!;
  await act(async () => drag.dispatchEvent(new TestPointerEvent("pointerdown", { bubbles: true, button: 0, buttons: 1, clientX: 50 * zoom, clientY: 50 * zoom })));
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, version: 7 } : card) };
  await act(async () => state.client.setQueryData(["story-map", storyMapId], state.snapshot));
  await act(async () => document.dispatchEvent(new TestPointerEvent("pointermove", { bubbles: true, buttons: 1, clientX: 250 * zoom, clientY: 50 * zoom })));
  await vi.waitFor(() => expect(drag.closest("article")!.parentElement!.style.transform).toContain("translate3d(200px, 0px, 0)"));
  await act(async () => document.dispatchEvent(new TestPointerEvent("pointermove", { bubbles: true, buttons: 1, clientX: 450 * zoom, clientY: 50 * zoom })));
  await act(async () => document.dispatchEvent(new TestPointerEvent("pointerup", { bubbles: true, button: 0, clientX: 450 * zoom, clientY: 50 * zoom })));
  await vi.waitFor(() => expect(command).toMatchObject({ baseVersion: 1, parentId: null }));
  expect(primary(cardId).closest('.discovery-notassigned')).not.toBeNull(); await vi.waitFor(() => expect(document.activeElement).toBe(primary(cardId)));
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
});
