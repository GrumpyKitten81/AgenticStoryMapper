// @vitest-environment jsdom
import { createElement, act } from "react";
import { createRoot } from "react-dom/client";
import { expect, it, vi } from "vitest";
import { CardTile } from "@storymapper/web/features/story-map/components/CardTile";
import { cardId, mount, state, viewUrl } from "@storymapper/web/test-fixtures/card-detail";
import { useTreeColumnsStore } from "@storymapper/web/app/stores/tree-columns-store";

const tile = () => document.querySelector(`[data-live-card-id="${cardId}"]`)!;
async function press(element: Element, key: string) {
  await act(async () => element.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true })));
}
it("names current color and priority, offers selected listbox options, saves keyboard selection and returns focus on Escape", async () => {
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, color: "#e5484d", priority: "2" };
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const color = tile().querySelector<HTMLButtonElement>('[aria-label="Color: Red. Change color"]')!;
  expect(color.style.background).toBe("rgb(229, 72, 77)");
  await press(color, "ArrowDown");
  expect(color.getAttribute("aria-expanded")).toBe("true");
  const selected = tile().querySelector('[role="option"][aria-selected="true"]')!;
  expect(selected.getAttribute("aria-label")).toBe("Red"); expect(document.activeElement).toBe(selected);
  await press(selected, "ArrowDown");
  expect(document.activeElement?.getAttribute("aria-label")).toBe("Orange");
  await act(async () => (document.activeElement as HTMLButtonElement).click());
  expect(state.savedPatch).toMatchObject({ color: "#f5a623" }); expect(document.activeElement).toBe(color);
  const priority = tile().querySelector<HTMLButtonElement>('[aria-label="Priority 2. Change priority"]')!;
  await press(priority, "ArrowDown");
  expect(tile().querySelector('[aria-selected="true"]')!.textContent).toBe("2");
  await press(document.activeElement!, "Escape");
  expect(document.activeElement).toBe(tile().querySelector("button[data-card-id]")); expect(priority.getAttribute("aria-expanded")).toBe("false");
  expect(tile().querySelector("[data-live-popover]")).toBeNull();
  await act(async () => priority.click());
  await act(async () => tile().querySelector<HTMLButtonElement>('[role="option"]')!.click());
  expect(state.savedPatch).toMatchObject({ priority: "" });
});

it("preserves arbitrary existing values visibly and disables preview color/priority mutations", async () => {
  const update = vi.fn();
  state.root = createRoot(state.host);
  await act(async () => state.root.render(createElement(CardTile, { card: { ...state.snapshot.cards[2]!, color: "rebeccapurple", priority: "urgent-custom" }, estimationUnit: "hours", readOnly: true, bulkSelected: false, sourceLinkCount: 0, githubIssue: undefined, releaseName: "Delivery", onSelect: vi.fn(), onBulkToggle: vi.fn(), onUpdateCard: update })));
  expect(tile().textContent).toContain("rebeccapurple"); expect(tile().textContent).toContain("urgent-custom"); expect(tile().textContent).not.toContain("Delivery");
  for (const control of tile().querySelectorAll<HTMLButtonElement>('[aria-haspopup="listbox"]')) { expect(control.disabled).toBe(true); await act(async () => control.click()); }
  expect(tile().querySelector('[role="listbox"]')).toBeNull(); expect(update).not.toHaveBeenCalled();
});

it("uses actual zero map-unit estimates and displays Notes in Tree without substituting effort", async () => {
  state.snapshot.storyMap.estimationUnit = "hours";
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, level: "note", estimate: 0, effort: 8 };
  useTreeColumnsStore.setState({ hidden: [] });
  await mount(viewUrl);
  expect(tile().textContent).toContain("Note"); expect(tile().textContent).toContain("0 hours");
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, estimate: undefined };
  await act(async () => state.client.setQueryData(["story-map", state.snapshot.storyMap.id], state.snapshot));
  expect(tile().textContent).not.toContain("8 hours");
});

it("preserves arrow-navigation focus on parent rerenders and keeps popup options outside sequential Tab order", async () => {
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, color: "#e5484d" };
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const trigger = tile().querySelector<HTMLButtonElement>('[aria-label="Color: Red. Change color"]')!;
  await press(trigger, "ArrowDown");
  await press(document.activeElement!, "ArrowDown");
  const focused = document.activeElement;
  expect(focused?.getAttribute("aria-label")).toBe("Orange");
  expect([...tile().querySelectorAll<HTMLButtonElement>('[role="option"]')].every((option) => option.tabIndex === -1)).toBe(true);
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, status: "active" } : card) };
  await act(async () => state.client.setQueryData(["story-map", state.snapshot.storyMap.id], state.snapshot));
  expect(document.activeElement).toBe(focused);
  await act(async () => (focused as HTMLButtonElement).click());
  expect(state.savedPatch).toMatchObject({ color: "#f5a623" }); expect(document.activeElement).toBe(trigger);
});

it("keeps focus inside the popup on pointer press so browsers that do not focus buttons on click still register the option", async () => {
  await mount(viewUrl.replace(/tree$/, "discovery"));
  const trigger = tile().querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!;
  await act(async () => trigger.click());
  const option = tile().querySelector('[role="option"]')!;
  const press = new MouseEvent("mousedown", { bubbles: true, cancelable: true });
  await act(async () => { option.dispatchEvent(press); });
  expect(press.defaultPrevented).toBe(true);
});
