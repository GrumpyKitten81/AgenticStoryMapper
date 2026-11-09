// @vitest-environment jsdom // REQ FR-62
import { randomUUID } from "node:crypto";
import { act } from "react";
import { expect, it, vi } from "vitest";
import { cardSchema, releaseSchema, type PlanState, type PlanDriftReport } from "@storymapper/contracts";
import { buildPlanStateProjection, comparePlanStates } from "@storymapper/core";
import { readStylesheet } from "@storymapper/web/test-fixtures/styles";
import { button, cardId, mount, projectId, state, storyMapId, viewUrl } from "@storymapper/web/test-fixtures/card-detail";

function prepare() {
  const now = state.snapshot.storyMap.createdAt;
  const first = releaseSchema.parse({ id: randomUUID(), storyMapId, name: "First", position: 0, version: 1, startDate: null, releaseDate: null, createdAt: now, updatedAt: now });
  const second = { ...first, id: randomUUID(), name: "Second", position: 1 };
  const story = state.snapshot.cards[2]!;
  const prerequisite = { ...story, id: randomUUID(), key: "LSM-4", title: "Prerequisite", releaseId: second.id, status: "Shipped", estimate: 5 };
  state.snapshot = { ...state.snapshot, releases: [first, second], cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, releaseId: first.id, estimate: 3 } : { ...card, estimate: 100 }), cardDependencies: [{ id: randomUUID(), cardId, prerequisiteCardId: prerequisite.id, createdAt: now }] };
  state.snapshot.cards.push(prerequisite);
  state.snapshot.workflowStatuses.push({ id: randomUUID(), projectId, storyMapId: null, name: "Shipped", group: "done", position: 5 });
  return { first, second };
}

function transport(states: PlanState[], moves: unknown[] = []) {
  const original = fetch;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (path === `/api/story-maps/${storyMapId}/plan-states`) {
      if (init?.method === "POST") {
        const captured = { id: randomUUID(), projectId, storyMapId, capturedAt: new Date().toISOString(), schemaVersion: 1 as const, actor: "human", payload: buildPlanStateProjection(state.snapshot) };
        states.push(captured);
        return Response.json({ state: captured });
      }
      return Response.json({ states: states.map(({ payload: _, ...summary }) => summary) });
    }
    if (path.includes("/plan-states/compare?")) {
      const query = new URL(path, "http://localhost").searchParams;
      return Response.json(comparePlanStates(states.find((item) => item.id === query.get("beforeId"))!, states.find((item) => item.id === query.get("afterId"))!));
    }
    if (path === `/api/cards/${cardId}/move`) {
      const patch = JSON.parse(String(init?.body));
      moves.push(patch);
      state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, ...patch, version: card.version + 1 } : card) };
      return Response.json(state.snapshot.cards.find((card) => card.id === cardId));
    }
    return original(path, init);
  }));
}

it("shows Story-only configured totals and order cues, and moves by keyboard buttons and form through the move endpoint", async () => {
  const { first, second } = prepare();
  const moves: unknown[] = [];
  transport([], moves);
  await mount(viewUrl.replace(/tree$/u, "slices"));
  expect(document.querySelector(".slice-lanes")!.textContent).toContain("Estimate sum: 3");
  expect(document.querySelector(".slice-lanes")!.textContent).not.toContain("Estimate sum: 103");
  expect(document.querySelector(".slice-order-violation")!.textContent).toContain("LSM-4");
  expect(document.querySelector(".slice-lanes")!.textContent).not.toContain("Open prerequisites:");
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Move LSM-3"]')!.click());
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Move LSM-3 to next Slice"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
  await vi.waitFor(() => expect(document.querySelector(".slice-order-violation")).toBeNull());
  expect(moves[0]).toMatchObject({ parentId: state.snapshot.cards.find((card) => card.id === cardId)!.parentId, releaseId: second.id, position: 1, baseVersion: 1 });
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Move LSM-3"]')!.click());
  const select = document.querySelector<HTMLSelectElement>('[aria-label="Target Slice LSM-3"]')!;
  await act(async () => { select.value = first.id; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await act(async () => document.querySelector<HTMLFormElement>('form[aria-label="Move LSM-3"]')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  await vi.waitFor(() => expect(document.querySelector(".slice-order-violation")).not.toBeNull());
  expect(moves[1]).toMatchObject({ parentId: state.snapshot.cards.find((card) => card.id === cardId)!.parentId, releaseId: first.id, position: 0, baseVersion: 2 });
});

it("shows a refused Slice move in the shell on every view and clears it on Reload", async () => {
  prepare();
  transport([]);
  const original = fetch;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => path === `/api/cards/${cardId}/move` ? Response.json({ code: "conflict", message: "Card changed.", conflicts: [{ entity: "card", id: cardId, baseVersion: 1, currentVersion: 2, current: { id: cardId } }] }, { status: 409 }) : original(path, init)));
  await mount(viewUrl.replace(/tree$/u, "slices"));
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Move LSM-3"]')!.click());
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Move LSM-3 to next Slice"]')!.dispatchEvent(new MouseEvent("click", { bubbles: true, detail: 0 })));
  const moveAlert = () => [...document.querySelectorAll('[role="alert"]')].find((alert) => alert.textContent?.includes("Reload"));
  await vi.waitFor(() => expect(moveAlert()).toBeDefined());
  await act(async () => button("Reload").click());
  expect(moveAlert()).toBeUndefined();
});

it("records canonical states and compares captured values after edits with reversible and equal-state markers", async () => {
  prepare();
  const states: PlanState[] = [];
  transport(states);
  await mount(viewUrl.replace(/tree$/u, "slices"));
  await act(async () => button("Record plan state").click());
  await vi.waitFor(() => expect(states).toHaveLength(1));
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, title: "Edited after capture", releaseId: null } : card) };
  await act(async () => button("Record plan state").click());
  await vi.waitFor(() => expect(states).toHaveLength(2));
  const before = document.querySelectorAll<HTMLSelectElement>(".plan-state-selectors select")[0]!;
  await act(async () => { before.value = states[0]!.id; before.dispatchEvent(new Event("change", { bubbles: true })); });
  await vi.waitFor(() => expect(document.querySelector(".plan-state-columns")?.textContent).toContain("> Moved First → Unscheduled"));
  expect(document.querySelectorAll(".plan-change-moved")).toHaveLength(1);
  expect(document.querySelector('.plan-state-columns section[aria-label="Before"]')!.textContent).toContain("Create traceable story cards");
  expect(document.querySelector('.plan-state-columns section[aria-label="Before"] .slice-order-violation')!.textContent).toContain("LSM-4");
  expect(document.querySelector('.plan-state-columns section[aria-label="Before"] .slice-order-summary')!.textContent).toContain("LSM-3: Blocked order behind LSM-4");
  expect(document.querySelector('.plan-state-columns section[aria-label="After"]')!.textContent).toContain("Edited after capture");
  const after = document.querySelectorAll<HTMLSelectElement>(".plan-state-selectors select")[1]!;
  await act(async () => { before.value = states[1]!.id; before.dispatchEvent(new Event("change", { bubbles: true })); after.value = states[0]!.id; after.dispatchEvent(new Event("change", { bubbles: true })); });
  await vi.waitFor(() => expect(document.querySelector(".plan-state-columns")?.textContent).toContain("> Moved Unscheduled → First"));
  await act(async () => { after.value = states[1]!.id; after.dispatchEvent(new Event("change", { bubbles: true })); });
  await vi.waitFor(() => expect(state.host.textContent).toContain("No membership changes."));
});

it("shows state errors and keeps capture and movement read-only during preview", async () => {
  prepare();
  const original = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path.endsWith("/plan-states") ? Promise.resolve(Response.json({ message: "Unavailable state" }, { status: 404 })) : original(path, init)));
  await mount(`${viewUrl.replace(/tree$/u, "slices")}?preview=${randomUUID()}`);
  expect(button("Record plan state").disabled).toBe(true);
  expect(document.querySelector('[aria-label="Move LSM-3"]')).toBeNull();
  await vi.waitFor(() => expect(document.querySelector(".plan-state-comparison [role=alert]")).not.toBeNull());
  expect(document.querySelector(".plan-state-comparison [role=alert]")!.textContent).toContain("Unavailable state");
});

it("shows the same named scheduling violation in Planning", async () => {
  prepare();
  await mount(viewUrl.replace(/tree$/u, "planning"));
  expect(document.querySelector(".slice-order-violation")!.textContent).toBe("Blocked order behind LSM-4");
  expect(document.querySelector('[aria-label="Move LSM-3"]')).not.toBeNull();
});

it("keeps filtered Stories mounted but hidden and disabled for keyboard dragging, then restores their controls on Clear", async () => {
  prepare();
  transport([]);
  await mount(viewUrl.replace(/tree$/u, "slices"));
  const story = document.querySelector<HTMLElement>(`[data-live-card-id="${cardId}"]`)!;
  const content = story.querySelector<HTMLButtonElement>(".card-content-button")!;
  const drag = story.querySelector<HTMLButtonElement>(".drag-handle")!;
  await act(async () => story.querySelector<HTMLButtonElement>('[aria-label="Move LSM-3"]')!.click());
  const form = story.querySelector<HTMLFormElement>("form")!;
  const input = document.querySelector<HTMLInputElement>('[aria-label="Search cards"]')!;
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Prerequisite");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  expect(document.querySelector(`[data-live-card-id="${cardId}"]`)).toBe(story);
  expect(story.hidden).toBe(true);
  expect(content.disabled).toBe(true);
  expect(drag.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(input);
  expect(document.querySelector('.slice-order-summary')!.textContent).toContain("LSM-3: Blocked order behind LSM-4");
  await act(async () => button("Clear").click());
  expect(document.querySelector(`[data-live-card-id="${cardId}"]`)).toBe(story);
  expect(story.hidden).toBe(false);
  expect(content.disabled).toBe(false);
  expect(drag.getAttribute("aria-disabled")).toBe("false");
  expect(story.querySelector("form")).toBe(form);
  expect(document.querySelector('.slice-order-summary')!.textContent).toContain("LSM-3: Blocked order behind LSM-4");
});

it("refuses a selected Slice deleted before form submission without substituting another target", async () => {
  const { second } = prepare();
  const moves: unknown[] = [];
  transport([], moves);
  await mount(viewUrl.replace(/tree$/u, "slices"));
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Move LSM-3"]')!.click());
  const select = document.querySelector<HTMLSelectElement>('[aria-label="Target Slice LSM-3"]')!;
  await act(async () => { select.value = second.id; select.dispatchEvent(new Event("change", { bubbles: true })); });
  state.snapshot = { ...state.snapshot, releases: state.snapshot.releases.filter((release) => release.id !== second.id), cards: state.snapshot.cards.map((card) => card.releaseId === second.id ? { ...card, releaseId: null } : card) };
  await act(async () => { await state.client.invalidateQueries({ queryKey: ["story-map", storyMapId] }); });
  expect(select.value).toBe(second.id);
  expect(select.selectedOptions[0]!.disabled).toBe(true);
  expect(document.querySelector('.slice-move-controls [role="alert"]')!.textContent).toContain(`Slice ${second.id} is unavailable`);
  await act(async () => select.closest("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(moves).toEqual([]);
});

it("uses the displayed position-and-ID ordering for keyboard movement and form targets", async () => {
  const { first, second } = prepare();
  const [lower, higher] = [first.id, second.id].sort((a, b) => a.localeCompare(b));
  state.snapshot = { ...state.snapshot, releases: [{ ...first, id: higher!, position: 0 }, { ...second, id: lower!, position: 0 }], cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, releaseId: higher! } : card) };
  const moves: unknown[] = [];
  transport([], moves);
  await mount(viewUrl.replace(/tree$/u, "slices"));
  expect([...document.querySelectorAll(".slice-lanes .slice-lane h2")].map((node) => node.textContent)).toEqual(["Second", "First", "Unscheduled"]);
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Move LSM-3"]')!.click());
  expect([...document.querySelector<HTMLSelectElement>('[aria-label="Target Slice LSM-3"]')!.options].map((option) => option.textContent)).toEqual(["Second", "First", "Unscheduled"]);
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Move LSM-3 to previous Slice"]')!.click());
  await vi.waitFor(() => expect(moves[0]).toMatchObject({ releaseId: lower }));
});

it("moves with real DndContext pointer events and recomputes membership and order cues", async () => {
  const { first, second } = prepare();
  const moves: unknown[] = [];
  transport([], moves);
  class TestPointerEvent extends MouseEvent {
    readonly pointerId = 1;
    readonly isPrimary = true;
    readonly pointerType = "mouse";
  }
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const lane = this.closest<HTMLElement>("[data-slice-drop-id]");
    const id = lane?.dataset.sliceDropId;
    const x = id === second.id ? 400 : id === "unscheduled" ? 800 : 0;
    return { x, y: 0, left: x, right: x + 300, top: 0, bottom: 500, width: 300, height: 500, toJSON() { return {}; } };
  });
  await mount(viewUrl.replace(/tree$/u, "slices"));
  const drag = document.querySelector<HTMLButtonElement>(`[data-live-card-id="${cardId}"] .drag-handle`)!;
  await act(async () => { drag.dispatchEvent(new TestPointerEvent("pointerdown", { bubbles: true, button: 0, buttons: 1, clientX: 50, clientY: 50 })); });
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === cardId ? { ...card, version: 7 } : card) };
  await act(async () => state.client.setQueryData(["story-map", storyMapId], state.snapshot));
  await act(async () => { document.dispatchEvent(new TestPointerEvent("pointermove", { bubbles: true, buttons: 1, clientX: 450, clientY: 50 })); });
  await act(async () => { document.dispatchEvent(new TestPointerEvent("pointerup", { bubbles: true, button: 0, clientX: 450, clientY: 50 })); });
  await vi.waitFor(() => expect(moves[0]).toMatchObject({ parentId: state.snapshot.cards.find((card) => card.id === cardId)!.parentId, releaseId: second.id, position: 1, baseVersion: 1 }));
  await vi.waitFor(() => expect(document.querySelector(`[data-slice-drop-id="${second.id}"] [data-live-card-id="${cardId}"]`)).not.toBeNull());
  expect(document.querySelector(`[data-slice-drop-id="${first.id}"] [data-live-card-id="${cardId}"]`)).toBeNull();
  expect(document.querySelector(".slice-order-summary")).toBeNull();
  expect(document.querySelector(".slice-order-violation")).toBeNull();
  // HINT: dnd-kit keeps document click capture for 50 ms after pointer-up.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
});

it("places Added and Removed captured titles in exactly one column and reverses their categories", async () => {
  prepare();
  const oldStory = state.snapshot.cards[2]!;
  const states: PlanState[] = [{ id: randomUUID(), projectId, storyMapId, capturedAt: new Date().toISOString(), schemaVersion: 1, actor: "human", payload: buildPlanStateProjection(state.snapshot) }];
  state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.filter((card) => card.id !== cardId).concat({ ...oldStory, id: randomUUID(), key: "LSM-5", title: "Added captured title" }), cardDependencies: [] };
  states.push({ ...states[0]!, id: randomUUID(), payload: buildPlanStateProjection(state.snapshot) });
  transport(states);
  await mount(viewUrl.replace(/tree$/u, "slices"), "Added captured title");
  const [before, after] = [...document.querySelectorAll<HTMLSelectElement>(".plan-state-selectors select")];
  const choose = async (left: string, right: string) => act(async () => { before!.value = left; before!.dispatchEvent(new Event("change", { bubbles: true })); after!.value = right; after!.dispatchEvent(new Event("change", { bubbles: true })); });
  await choose(states[0]!.id, states[1]!.id);
  await vi.waitFor(() => expect(document.querySelectorAll(".plan-change-added")).toHaveLength(1));
  expect(document.querySelectorAll(".plan-change-removed")).toHaveLength(1);
  expect(document.querySelector('.plan-state-columns section[aria-label="Before"] .plan-change-removed')!.closest("article")!.textContent).toContain(oldStory.title);
  expect(document.querySelector('.plan-state-columns section[aria-label="After"] .plan-change-added')!.closest("article")!.textContent).toContain("Added captured title");
  await choose(states[1]!.id, states[0]!.id);
  await vi.waitFor(() => expect(document.querySelector('.plan-state-columns section[aria-label="Before"] .plan-change-removed')!.closest("article")!.textContent).toContain("Added captured title"));
  expect(document.querySelector('.plan-state-columns section[aria-label="After"] .plan-change-added')!.closest("article")!.textContent).toContain(oldStory.title);
  expect(document.querySelectorAll(".plan-change-added")).toHaveLength(1);
  expect(document.querySelectorAll(".plan-change-removed")).toHaveLength(1);
});


it("refreshes an open canonical drift report after an ordinary local Slice move", async () => {
  const { first, second } = prepare();
  const before = structuredClone(state.snapshot.cards.find((card) => card.id === cardId)!);
  const moves: unknown[] = [], requests: string[] = [];
  transport([], moves);
  const original = fetch;
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (path.includes("/plan-drift")) {
      requests.push(path);
      if (path.endsWith("/systems")) return Response.json({ systems: ["source"] });
      const current = cardSchema.parse(state.snapshot.cards.find((card) => card.id === cardId)!);
      const entry = { cardId, identity: { id: cardId, key: before.key, title: before.title }, card: before, active: true, binding: null, releaseName: first.name };
      const report: PlanDriftReport = { storyMapId, baselineId: storyMapId, baselineVersion: 1, system: "source", changes: current.releaseId === before.releaseId ? [] : [{ cardId, kinds: ["moved"], reason: "active", before: entry, after: { ...entry, card: current, releaseName: second.name }, beforeReleaseName: first.name, afterReleaseName: second.name }] };
      return Response.json(report);
    }
    return original(path, init);
  }));
  await mount(viewUrl.replace(/tree$/u, "slices"));
  await act(async () => button("Plan drift").click());
  await vi.waitFor(() => expect(state.host.textContent).toContain("No drift from the synchronized source plan."));
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Move LSM-3"]')!.click());
  await act(async () => document.querySelector<HTMLButtonElement>('[aria-label="Move LSM-3 to next Slice"]')!.click());
  await vi.waitFor(() => expect(document.querySelector(".plan-drift-changes")?.textContent).toContain("Moved"));
  expect(moves).toHaveLength(1);
  expect(document.querySelector(".plan-drift-changes")?.textContent).toContain("First");
  expect(document.querySelector(".plan-drift-changes")?.textContent).toContain("Second");
  expect(requests.filter((path) => path.endsWith("/systems"))).toHaveLength(2);
  expect(requests.filter((path) => path.includes("?system="))).toHaveLength(2);
});

it("disables drift inspection on the actual Slices preview projection without issuing drift reads", async () => {
  prepare(); transport([]);
  const previewId = randomUUID(), projected = structuredClone(state.snapshot), original = fetch;
  projected.cards.find((card) => card.id === cardId)!.title = "Projected Story";
  const driftRequests: string[] = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (path.includes("/plan-drift")) driftRequests.push(path);
    if (path === `/api/changesets/${previewId}/preview`) return Response.json({ changeSet: { id: previewId, title: "Slices preview", status: "proposed" }, selectedOperationIds: [], conflicts: [], operations: [], boards: [{ snapshot: projected, markers: [] }], presentationStatus: "proposed", closed: false, canApply: false, canApprove: false });
    return original(path, init);
  }));
  await mount(`${viewUrl.replace(/tree$/u, "slices")}?preview=${previewId}`, "Projected Story");
  expect(button("Plan drift").disabled).toBe(true);
  await act(async () => button("Plan drift").click());
  expect(document.querySelector("[data-plan-drift-drawer]")).toBeNull();
  expect(driftRequests).toEqual([]);
});

it.each(["slices", "planning"])("keeps actual %s move actions wrapped and arrow controls compact", async (view) => {
  prepare();
  transport([]);
  const stylesheet = document.createElement("style");
  stylesheet.textContent = readStylesheet(`${process.cwd()}/src/styles/global.css`) + readStylesheet(`${process.cwd()}/src/styles/slices.css`);
  document.head.append(stylesheet);
  try {
    await mount(viewUrl.replace(/tree$/u, view));
    const move = document.querySelector<HTMLButtonElement>('[aria-label="Move LSM-3"]')!;
    const controls = move.closest(".slice-move-controls")!;
    expect(getComputedStyle(controls).gap).toBe("var(--space-12)");
    await act(async () => move.click());
    const next = controls.querySelector<HTMLButtonElement>('[aria-label="Move LSM-3 to next Slice"]')!;
    const previous = controls.querySelector<HTMLButtonElement>('[aria-label="Move LSM-3 to previous Slice"]')!;
    for (const row of [move.parentElement!, next.parentElement!]) {
      const style = getComputedStyle(row);
      expect(style.display).toBe("flex");
      expect(style.flexWrap).toBe("wrap");
      expect(style.gap).toBe("var(--space-8)");
    }
    for (const arrow of [previous, next]) {
      const style = getComputedStyle(arrow);
      expect(style.minHeight).toBe("var(--control-height-compact)");
      expect(style.minWidth).toBe("var(--control-height-compact)");
      expect(style.padding).toBe("var(--space-4)");
    }
    expect(getComputedStyle(controls.querySelector("form")!).gap).toBe("var(--space-12)");
  } finally { stylesheet.remove(); }
});
