// @vitest-environment jsdom
import { act } from "react";
import { expect, it, vi } from "vitest";
import { liveUpdatesHeld, useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { auditAccessibility } from "@storymapper/web/test/audit-accessibility";
import { ConflictError } from "@storymapper/web/app/conflicts";
import { api } from "@storymapper/web/app/api";
import { cardId, storyMapId, mount, state, viewUrl } from "@storymapper/web/test-fixtures/card-detail";

async function type(input: HTMLInputElement, value: string) {
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value); input.dispatchEvent(new Event("input", { bubbles: true })); });
}
async function blur(input: HTMLInputElement) { await act(async () => { input.focus(); input.blur(); }); }
async function enter(input: HTMLInputElement) { await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); }); }

it("keeps replacement digits local, commits once on completion, and associates independent field errors", async () => {
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, businessValue: 12, effort: 5 };
  await mount(viewUrl.replace(/tree$/, "planning"));
  const writes = vi.spyOn(api, "updateCard");
  const [value, effort] = [...state.host.querySelectorAll<HTMLInputElement>('.planning-card-fields input')];
  await type(value!, ""); await type(value!, "3"); await type(value!, "34");
  expect(writes).not.toHaveBeenCalled();
  await enter(value!);
  await vi.waitFor(() => expect(writes).toHaveBeenCalledTimes(1));
  expect(writes).toHaveBeenCalledWith(cardId, { businessValue: 34 }, 1);
  await enter(value!);
  expect(writes).toHaveBeenCalledTimes(1);
  await type(value!, "-1"); await enter(value!);
  await type(effort!, "Infinity"); await enter(effort!);
  for (const field of [value!, effort!]) {
    expect(field.getAttribute("aria-invalid")).toBe("true");
    expect(document.getElementById(field.getAttribute("aria-describedby")!)?.getAttribute("role")).toBe("alert");
  }
  expect(value!.getAttribute("aria-describedby")).not.toBe(effort!.getAttribute("aria-describedby"));
  await type(effort!, "0"); await enter(effort!);
  await vi.waitFor(() => expect(writes).toHaveBeenCalledTimes(2));
  expect(value!.getAttribute("aria-invalid")).toBe("true");
  expect(effort!.getAttribute("aria-invalid")).toBe("false");
  expect(writes).toHaveBeenLastCalledWith(cardId, { effort: 0 }, 1);
});

it("blocks pending completion and permits retrying the same refused draft", async () => {
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, businessValue: 12 };
  await mount(viewUrl.replace(/tree$/, "planning"));
  let reject!: (reason: Error) => void;
  const original = api.updateCard;
  const writes = vi.spyOn(api, "updateCard").mockImplementationOnce(() => new Promise((_, refuse) => { reject = refuse; })).mockImplementation(original);
  const value = state.host.querySelector<HTMLInputElement>('.planning-card-fields input')!;
  await type(value, "34"); await enter(value);
  expect(value.disabled).toBe(true);
  await enter(value);
  expect(writes).toHaveBeenCalledTimes(1);
  await act(async () => reject(new Error("Save refused")));
  expect(value.value).toBe("34");
  expect(value.disabled).toBe(false);
  expect(value.getAttribute("aria-invalid")).toBe("true");
  await enter(value);
  await vi.waitFor(() => expect(writes).toHaveBeenCalledTimes(2));
  expect(writes).toHaveBeenLastCalledWith(cardId, { businessValue: 34 }, 1);
  await enter(value);
  expect(writes).toHaveBeenCalledTimes(2);
});

it("commits a dirty draft once on blur and does not flag a never-set empty field", async () => {
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, businessValue: 12, effort: undefined };
  await mount(viewUrl.replace(/tree$/, "planning"));
  const writes = vi.spyOn(api, "updateCard");
  const [value, effort] = [...state.host.querySelectorAll<HTMLInputElement>('.planning-card-fields input')];
  await act(async () => effort!.focus()); await blur(effort!);
  expect(effort!.getAttribute("aria-invalid")).toBe("false");
  await act(async () => value!.focus());
  await type(value!, "21"); await blur(value!);
  await vi.waitFor(() => expect(writes).toHaveBeenCalledTimes(1));
  expect(writes).toHaveBeenCalledWith(cardId, { businessValue: 21 }, 1);
  await blur(value!);
  expect(writes).toHaveBeenCalledTimes(1);
});


it.each(["invalid", "refused"])("holds a retained %s numeric draft after blur until its reviewed value is saved", async (failure) => {
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, businessValue: 12 };
  await mount(viewUrl.replace(/tree$/, "planning"));
  const writes = vi.spyOn(api, "updateCard");
  if (failure === "refused") writes.mockRejectedValueOnce(new Error("Save refused"));
  const input = state.host.querySelector<HTMLInputElement>('.planning-card-fields input')!;
  await type(input, failure === "invalid" ? "-1" : "34"); await blur(input);
  expect(document.activeElement).toBe(document.body);
  expect(liveUpdatesHeld(document)).toBe(true);
  await type(input, "34"); await blur(input);
  await vi.waitFor(() => expect(liveUpdatesHeld(document)).toBe(false));
});


it.each(["invalid", "refused"])("retains the reviewed version for a %s draft after an explicit snapshot refresh", async (failure) => {
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, businessValue: 12 };
  await mount(viewUrl.replace(/tree$/, "planning"));
  const writes = vi.spyOn(api, "updateCard");
  if (failure === "refused") writes.mockRejectedValueOnce(new Error("Save refused"));
  const input = state.host.querySelector<HTMLInputElement>('.planning-card-fields input')!;
  await type(input, failure === "invalid" ? "-1" : "34"); await blur(input);
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, businessValue: 50, version: 2 } : card) };
  await act(async () => { await state.client.invalidateQueries({ queryKey: ["story-map", storyMapId] }); });
  expect(input.value).toBe(failure === "invalid" ? "-1" : "34");
  writes.mockRejectedValueOnce(new Error("Version conflict"));
  await type(input, "34"); await enter(input);
  expect(writes).toHaveBeenLastCalledWith(cardId, { businessValue: 34 }, 1);
  expect(input.getAttribute("aria-invalid")).toBe("true");
  expect(state.snapshot.cards[2]!.businessValue).toBe(50);
});

it("clears acknowledged board versions when a Restore epoch adopts a lower canonical version", async () => {
  useLiveInteractionStore.setState({ epoch: "original", restorePending: false });
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, businessValue: 12, version: 9 };
  await mount(viewUrl.replace(/tree$/, "planning"));
  const original = api.updateCard;
  const writes = vi.spyOn(api, "updateCard").mockImplementationOnce(async (id, patch) => {
    state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, businessValue: patch.businessValue!, version: 10 };
    return state.snapshot.cards[2]!;
  }).mockImplementation(original);
  let input = state.host.querySelector<HTMLInputElement>('.planning-card-fields input')!;
  await type(input, "34"); await enter(input);
  expect(writes).toHaveBeenLastCalledWith(cardId, { businessValue: 34 }, 9);
  await act(async () => {
    useLiveInteractionStore.getState().recordEpoch("restored");
    state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, businessValue: 12, version: 4 };
    await state.client.invalidateQueries({ queryKey: ["story-map", storyMapId] });
    useLiveInteractionStore.getState().finishEpoch("restored");
  });
  input = state.host.querySelector<HTMLInputElement>('.planning-card-fields input')!;
  await type(input, "21"); await enter(input);
  expect(writes).toHaveBeenLastCalledWith(cardId, { businessValue: 21 }, 4);
});


it("retains and refuses a pre-Restore draft with an overlapping version until explicitly edited again", async () => {
  useLiveInteractionStore.setState({ epoch: "before", restorePending: false });
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, businessValue: 12, version: 4 };
  await mount(viewUrl.replace(/tree$/, "planning"));
  const writes = vi.spyOn(api, "updateCard").mockRejectedValueOnce(new Error("Save refused"));
  const input = state.host.querySelector<HTMLInputElement>('.planning-card-fields input')!;
  await type(input, "34"); await blur(input);
  await act(async () => useLiveInteractionStore.getState().recordEpoch("restored"));
  expect(state.host.querySelector<HTMLInputElement>('.planning-card-fields input')!.disabled).toBe(true);
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, businessValue: 50, version: 4 } : card) };
  await act(async () => {
    await state.client.invalidateQueries({ queryKey: ["story-map", storyMapId] });
    useLiveInteractionStore.getState().finishEpoch("restored");
  });
  const restored = state.host.querySelector<HTMLInputElement>('.planning-card-fields input')!;
  expect(restored.value).toBe("34");
  await enter(restored);
  expect(writes).toHaveBeenCalledTimes(1);
  expect(restored.getAttribute("aria-invalid")).toBe("true");
  expect(restored.closest("label")!.parentElement!.textContent).toContain("changed since you loaded it");
  await type(restored, "35"); await enter(restored);
  expect(writes).toHaveBeenLastCalledWith(cardId, { businessValue: 35 }, 4);
});


it.each(["Reload", "Keep mine"])("recovers a numeric version conflict using %s with the reviewed current value", async (choice) => {
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, businessValue: 12, version: 1 };
  await mount(viewUrl.replace(/tree$/, "planning"));
  const current = { ...state.snapshot.cards[2]!, businessValue: 50, version: 2 };
  const writes = vi.spyOn(api, "updateCard").mockRejectedValueOnce(new ConflictError("Version conflict", [{ entity: "card", id: cardId, baseVersion: 1, currentVersion: 2, current }]));
  const input = state.host.querySelector<HTMLInputElement>('.planning-card-fields input')!;
  await type(input, "34"); await enter(input);
  expect(input.value).toBe("34");
  const button = [...input.closest("label")!.parentElement!.querySelectorAll('button')].find((button) => button.textContent === choice);
  expect(button).toBeDefined();
  await auditAccessibility();
  await act(async () => button!.click());
  if (choice === "Reload") {
    expect(input.value).toBe("50");
    expect(writes).toHaveBeenCalledTimes(1);
    expect(liveUpdatesHeld(document)).toBe(false);
    await type(input, "51"); await enter(input);
    expect(writes).toHaveBeenLastCalledWith(cardId, { businessValue: 51 }, 2);
  } else expect(writes).toHaveBeenLastCalledWith(cardId, { businessValue: 34 }, 2);
});

it("admits an intentional numeric edit immediately after Restore without an extra refused submit", async () => {
  useLiveInteractionStore.setState({ epoch: "before", restorePending: false });
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, businessValue: 12, version: 4 };
  await mount(viewUrl.replace(/tree$/, "planning"));
  const writes = vi.spyOn(api, "updateCard").mockRejectedValueOnce(new Error("Save refused"));
  const input = state.host.querySelector<HTMLInputElement>('.planning-card-fields input')!;
  await type(input, "34"); await blur(input);
  await act(async () => {
    useLiveInteractionStore.getState().recordEpoch("after");
    state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, businessValue: 50, version: 2 } : card) };
    await state.client.invalidateQueries({ queryKey: ["story-map", storyMapId] });
    useLiveInteractionStore.getState().finishEpoch("after");
  });
  await type(input, "35"); await enter(input);
  expect(writes).toHaveBeenLastCalledWith(cardId, { businessValue: 35 }, 2);
});
