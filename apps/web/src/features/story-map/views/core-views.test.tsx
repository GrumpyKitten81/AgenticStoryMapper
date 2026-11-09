// @vitest-environment jsdom
import { readStylesheet } from "@storymapper/web/test-fixtures/styles";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act } from "react";
import { expect, it, vi } from "vitest";
import { cardId, mount, projectId, state, storyMapId, viewUrl } from "@storymapper/web/test-fixtures/card-detail";
import { personaSchema } from "@storymapper/contracts";
import { CARD_PRIORITY_OPTIONS } from "@storymapper/web/features/story-map/card-visual-options";
import { api } from "@storymapper/web/app/api";

const primary = (id: string) => state.host.querySelector<HTMLButtonElement>(`button[data-card-id="${id}"]`)!;
async function change(select: HTMLSelectElement, value: string) {
  await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
}
async function input(element: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(element, value);
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
}
function releases() {
  const open = { id: randomUUID(), version: 1, storyMapId, name: "Open delivery", goal: "", position: 0, startDate: null, releaseDate: null, released: false };
  const released = { ...open, id: randomUUID(), name: "Shipped delivery", released: true, position: 1 };
  const story = state.snapshot.cards[2]!;
  state.snapshot = { ...state.snapshot, releases: [open, released], cards: [...state.snapshot.cards.map((card) => card.id === cardId ? { ...card, estimate: 0 } : card), { ...story, id: randomUUID(), key: "LSM-4", title: "Shipped story", releaseId: released.id }, { ...story, id: randomUUID(), key: "LSM-5", title: "Open story", releaseId: open.id }] };
  return { open, released };
}

it.each([
  ["discovery", ".discovery-matrix"], ["tree", ".tree-view"], ["planning", ".swimlane-scroll"], ["backlog", ".backlog-list"], ["tracking", ".release-kanban-page"]
])("fresh %s URL renders the canonical Card in its distinct projection", async (view, selector) => {
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, estimate: 0, description: "Traceable description" };
  await mount(viewUrl.replace(/tree$/, view!));
  const projection = state.host.querySelector(selector!)!;
  expect(projection.querySelector(`[data-live-card-id="${cardId}"]`)).not.toBeNull();
  expect(projection.textContent).toContain("LSM-3");
  expect(projection.textContent).toContain("Create traceable story cards");
});

it("projects assigned Personas for Activities, Steps and every legal Note placement with coherent grid cells", async () => {
  const [activity, step, story] = state.snapshot.cards;
  const persona = personaSchema.parse({ id: randomUUID(), projectId, storyMapId, version: 1, name: "Reader", role: "Reader" });
  const notes = [null, activity!.id, step!.id].map((parentId, index) => ({ ...story!, id: randomUUID(), key: `LSM-${index + 4}`, level: "note" as const, title: `Note ${index}`, parentId }));
  state.snapshot = { ...state.snapshot, personas: [persona], cards: [...state.snapshot.cards, ...notes], cardPersonas: [...state.snapshot.cards, ...notes].map((card) => ({ id: randomUUID(), createdAt: card.createdAt, cardId: card.id, personaId: persona.id })) };
  await mount(viewUrl.replace(/tree$/, "discovery"));
  for (const card of state.snapshot.cards) {
    expect(primary(card.id).textContent).toContain("Personas: Reader");
    expect(primary(card.id).getAttribute("aria-description")).toContain("Personas: Reader");
  }
  const grid = state.host.querySelector('[role="grid"]')!;
  expect(grid.getAttribute("aria-multiselectable")).toBe("true");
  expect(grid.getAttribute("aria-colcount")).toBe("3");
  const rows = [...grid.querySelectorAll('[role="row"]')].filter((row) => !row.closest("[hidden]"));
  expect(rows).toHaveLength(Number(grid.getAttribute("aria-rowcount")));
  expect(rows.map((row) => Number(row.getAttribute("aria-rowindex")))).toEqual([1, 2, 3, 4, 5, 6, 7]);
  expect(grid.querySelector('article[role="gridcell"]')).toBeNull();
  expect(grid.querySelectorAll('h3')).toHaveLength(0);
  for (const cell of grid.querySelectorAll('[role="gridcell"], [role="columnheader"], [role="rowheader"]')) {
    if (cell.closest('[hidden]')) continue;
    expect(cell.closest('[role="row"]')).not.toBeNull();
    expect(Number(cell.getAttribute("aria-colindex"))).toBeGreaterThan(0);
    expect(Number(cell.getAttribute("aria-colindex")) + Number(cell.getAttribute("aria-colspan") ?? 1) - 1).toBeLessThanOrEqual(3);
  }
  for (const id of [cardId, notes[2]!.id]) await act(async () => { primary(id).dispatchEvent(new KeyboardEvent("keydown", { key: " ", bubbles: true })); });
  const cell = primary(cardId).closest('[role="gridcell"]')!;
  expect(cell.getAttribute("aria-description")).toContain("LSM-3, LSM-6");
  expect(cell.getAttribute("aria-selected")).toBe("true");
  expect(primary(cardId).getAttribute("aria-label")).toBe("LSM-3 Story Create traceable story cards");
  const collapse = grid.querySelector<HTMLButtonElement>(".lane-collapse")!;
  await act(async () => collapse.click());
  expect(grid.getAttribute("aria-rowcount")).toBe("6");
  expect([...grid.querySelectorAll('[role="row"]')].filter((row) => !row.closest("[hidden]")).map((row) => Number(row.getAttribute("aria-rowindex")))).toEqual([1, 2, 3, 4, 5, 6]);
  expect(primary(cardId).closest("[hidden]")).not.toBeNull();
  await act(async () => collapse.click());
  expect(primary(cardId).getAttribute("aria-pressed")).toBe("true");
});

it("Planning defaults to open lanes, preserves assignments and central custom priority, and refuses invalid numeric edits", async () => {
  const { released } = releases();
  state.snapshot.cards[2] = { ...state.snapshot.cards[2]!, priority: "Custom priority", businessValue: 4, effort: 2 };
  await mount(viewUrl.replace(/tree$/, "planning"));
  const shippedLane = [...state.host.querySelectorAll<HTMLElement>(".swimlane-row")].find((row) => row.textContent?.includes("Shipped delivery"))!;
  expect(shippedLane.hidden).toBe(true);
  expect(state.snapshot.cards.find((card) => card.title === "Shipped story")!.releaseId).toBe(released.id);
  const showAll = state.host.querySelector<HTMLInputElement>('.board-workspace > label input')!;
  await act(async () => showAll.click());
  expect(state.host.querySelector('.swimlane-body')!.textContent).toContain("Shipped delivery");
  const tile = primary(cardId).closest('article')!;
  const priority = tile.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!;
  expect(priority.textContent).toBe("Custom priority");
  await act(async () => priority.click());
  expect([...tile.querySelectorAll('[role="option"]')].map((option) => option.textContent)).toEqual(expect.arrayContaining(["Custom priority", ...CARD_PRIORITY_OPTIONS]));
  const value = tile.querySelector<HTMLInputElement>('.planning-card-fields input')!;
  const update = vi.spyOn(api, "updateCard");
  for (const invalid of ["-1", "Infinity", "", "0.5", "no"]) {
    await input(value, invalid);
    await act(async () => value.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
    expect(tile.querySelector('[role="alert"]')).not.toBeNull();
  }
  expect(update).not.toHaveBeenCalled();
  await input(value, "0");
  await act(async () => value.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(tile.querySelector('[role="alert"]')).toBeNull();
  await vi.waitFor(() => expect(update).toHaveBeenCalledWith(cardId, { businessValue: 0 }, 1));
  const effort = tile.querySelectorAll<HTMLInputElement>('.planning-card-fields input')[1]!;
  await input(effort, "-2");
  await act(async () => effort.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  expect(update).toHaveBeenCalledTimes(1);
  await input(effort, "0");
  await act(async () => effort.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })));
  await vi.waitFor(() => expect(update).toHaveBeenCalledWith(cardId, { effort: 0 }, 1));
});

it("Tracking summary and named controls share open/all/Unscheduled scope and reconcile a deleted Release", async () => {
  const { open } = releases();
  const ancestor = { ...state.snapshot.cards[0]!, id: randomUUID(), status: "archived" };
  state.snapshot.cards.push(ancestor, { ...state.snapshot.cards[2]!, id: randomUUID(), parentId: ancestor.id, estimate: 99 }, { ...state.snapshot.cards[2]!, id: randomUUID(), level: "note", estimate: 99 });
  await mount(viewUrl.replace(/tree$/, "tracking"));
  const summary = () => [...state.host.querySelectorAll('.release-summary-grid strong')].map((element) => element.textContent);
  expect(summary()).toEqual(["2", "2", "0 points", "1"]);
  expect(state.host.querySelectorAll('.release-kanban-card')).toHaveLength(2);
  const scope = state.host.querySelector<HTMLSelectElement>('.release-kanban-scope select')!;
  expect(scope.options[0]!.text).toBe("Open releases");
  expect(state.host.querySelector(`[aria-label="Status for LSM-3"]`)).not.toBeNull();
  await change(scope, "unscheduled");
  expect(summary()).toEqual(["1", "1", "0 points", "0"]);
  await change(scope, open.id);
  expect(state.host.querySelectorAll('.release-kanban-card')).toHaveLength(1);
  state.snapshot = { ...state.snapshot, releases: state.snapshot.releases.filter((release) => release.id !== open.id), cards: state.snapshot.cards.map((card) => card.releaseId === open.id ? { ...card, releaseId: null } : card) };
  await act(async () => state.client.setQueryData(["story-map", storyMapId], state.snapshot));
  expect(scope.value).toBe("all");
  expect(summary()[0]).toBe("2");
  const showAll = state.host.querySelector<HTMLInputElement>('.release-kanban-page > label input')!;
  await act(async () => showAll.click());
  expect(summary()[0]).toBe("3");
  expect(state.host.querySelectorAll('.release-kanban-card')).toHaveLength(3);
});

it.each(["discovery", "planning", "tracking", "backlog"])("actual %s preview refuses Card writes and retains projected content", async (view) => {
  releases();
  if (view === "discovery") state.snapshot.releases = state.snapshot.releases.map((release) => ({ ...release, released: false }));
  const previewId = randomUUID(), original = fetch;
  const projected = structuredClone(state.snapshot);
  projected.cards[2] = { ...projected.cards[2]!, title: "Projected Story", estimate: 0 };
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => path === `/api/changesets/${previewId}/preview`
    ? Response.json({ changeSet: { id: previewId, title: "Core preview", status: "proposed" }, selectedOperationIds: [], conflicts: [], operations: [], boards: [{ snapshot: projected, markers: [{ entity: "card", entityId: cardId, kind: "changed", operationIds: [] }] }], presentationStatus: "proposed", closed: false, canApply: false, canApprove: false }) : original(path, init)));
  const update = vi.spyOn(api, "updateCard");
  const writes = [vi.spyOn(api, "createCard"), vi.spyOn(api, "createRelease"), vi.spyOn(api, "updateRelease"), vi.spyOn(api, "deleteRelease")];
  await mount(`${viewUrl.replace(/tree$/, view)}?preview=${previewId}`, "Projected Story");
  const projection = state.host.querySelector(view === "discovery" ? '.discovery-workspace' : view === "planning" ? '.swimlane-scroll' : view === "tracking" ? '.release-kanban-page' : '.backlog-list')!;
  for (const control of projection.querySelectorAll<HTMLButtonElement | HTMLSelectElement | HTMLInputElement>('.release-card-actions button, .release-card-actions select, .planning-card-fields button, .planning-card-fields input, .card-checkbox input, .card-content-button, .discovery-workspace .add-tile')) {
    expect(control.disabled || control.getAttribute("aria-disabled") === "true").toBe(true);
    if (control instanceof HTMLButtonElement) await act(async () => control.click());
  }
  expect(update).not.toHaveBeenCalled();
  for (const write of writes) expect(write).not.toHaveBeenCalled();
  expect(projection.querySelector('.preview-marker')).not.toBeNull();
  expect(state.host.querySelector(".board-toolbar")).toBeNull();
  expect(state.host.querySelector<HTMLButtonElement>('button[aria-label="Pull GitHub"]')?.disabled ?? true).toBe(true);
  if (view === "planning") expect(projection.querySelector(".swimlane-row[hidden]")).toBeNull();
  if (view === "tracking") expect(projection.textContent).toContain("Shipped story");
  if (view === "discovery") {
    const releaseHeaders = [...projection.querySelectorAll(".release-band-header")].filter((header) => /Open delivery|Shipped delivery/.test(header.textContent ?? ""));
    expect(releaseHeaders).toHaveLength(2);
    for (const header of releaseHeaders) expect(header.querySelector(".lane-edit, .lane-delete")).toBeNull();
    expect(projection.querySelector('[aria-label="Move Open delivery down"], [aria-label="Move Shipped delivery up"]')).toBeNull();
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  }
  expect(state.snapshot.cards[2]!.title).toBe("Create traceable story cards");
});

it.each(["discovery", "tree", "planning", "backlog", "tracking"])("retains every eligible Card in a legal 1000-Card %s projection", async (view) => {
  const template = state.snapshot.cards[2]!;
  state.snapshot = { ...state.snapshot, cards: [...state.snapshot.cards.slice(0, 2), ...Array.from({ length: 998 }, (_, index) => ({ ...template, id: index === 0 ? cardId : randomUUID(), key: `LSM-${index + 3}`, title: index === 0 ? template.title : `Story ${index + 3}`, position: index }))] };
  await mount(viewUrl.replace(/tree$/, view));
  const scope = state.host.querySelector(view === "discovery" ? '.discovery-matrix' : view === "tree" ? '.tree-body' : view === "planning" ? '.swimlane-body' : view === "backlog" ? '.backlog-list' : '.release-kanban')!;
  const ids = [...scope.querySelectorAll<HTMLElement>('[data-live-card-id]')].map((element) => element.dataset.liveCardId);
  const expected = state.snapshot.cards.filter((card) => view === "discovery" || view === "tree" || card.level === "story");
  expect(new Set(ids)).toEqual(new Set(expected.map((card) => card.id)));
});

it.each(["discovery", "tree", "planning", "backlog", "tracking"].flatMap((view) => ["ready", "delayed", "failed"].map((phase) => [view, phase])))("direct %s preview+card never mounts the canonical editor with %s preview", async (view, phase) => {
  const previewId = randomUUID(), original = fetch;
  let resolve!: (response: Response) => void;
  const response = () => Response.json({ changeSet: { id: previewId, title: "Read-only preview", status: "proposed" }, selectedOperationIds: [], conflicts: [], operations: [], boards: [{ snapshot: state.snapshot, markers: [] }], presentationStatus: "proposed", closed: false, canApply: false, canApprove: false });
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path === `/api/changesets/${previewId}/preview`
    ? phase === "delayed" ? new Promise<Response>((done) => { resolve = done; }) : Promise.resolve(phase === "failed" ? Response.json({ message: "Preview failed" }, { status: 403 }) : response()) : original(path, init)));
  const writes = [vi.spyOn(api, "updateCard"), vi.spyOn(api, "createCard"), vi.spyOn(api, "createRelease"), vi.spyOn(api, "updateRelease")];
  await mount(`${viewUrl.replace(/tree$/, view!)}?preview=${previewId}&card=${cardId}`);
  expect(state.host.querySelector('[role="dialog"]')).toBeNull();
  for (const primary of state.host.querySelectorAll<HTMLButtonElement>('[data-card-id]')) await act(async () => primary.click());
  expect(state.host.querySelector('[role="dialog"]')).toBeNull();
  for (const field of state.host.querySelectorAll<HTMLInputElement>('.planning-card-fields input, .card-checkbox input')) expect(field.disabled).toBe(true);
  for (const select of state.host.querySelectorAll<HTMLSelectElement>('.release-card-actions select')) expect(select.disabled).toBe(true);
  for (const write of writes) expect(write).not.toHaveBeenCalled();
  if (phase === "delayed") {
    await act(async () => resolve(response()));
    expect(state.host.querySelector('[role="dialog"]')).toBeNull();
    for (const write of writes) expect(write).not.toHaveBeenCalled();
  }
});

it("Planning retains released lane DOM, disables hidden drag controls and recovers a focused editor on live release", async () => {
  const { open } = releases();
  await mount(viewUrl.replace(/tree$/, "planning"));
  const card = state.snapshot.cards.find((card) => card.title === "Open story")!;
  const tile = primary(card.id).closest('article')!;
  const input = tile.querySelector<HTMLInputElement>('.planning-card-fields input')!;
  const row = tile.closest<HTMLElement>('.swimlane-row')!;
  await act(async () => input.focus());
  state.snapshot = { ...state.snapshot, releases: state.snapshot.releases.map((release) => release.id === open.id ? { ...release, released: true, version: release.version + 1 } : release) };
  await act(async () => state.client.setQueryData(["story-map", storyMapId], state.snapshot));
  expect(primary(card.id).closest('article')).toBe(tile);
  expect(row.hidden).toBe(true);
  expect(tile.querySelector<HTMLButtonElement>('.drag-handle')!.getAttribute("aria-disabled")).toBe("true");
  expect(document.activeElement).toBe(state.host.querySelector('.swimlane-scroll'));
  const showAll = state.host.querySelector<HTMLInputElement>('.board-workspace > label input')!;
  await act(async () => showAll.click());
  expect(row.hidden).toBe(false);
  expect(primary(card.id).closest('article')).toBe(tile);
  expect(input.disabled).toBe(false);
  await act(async () => input.focus());
  await act(async () => showAll.click());
  expect(row.hidden).toBe(true);
  expect(document.activeElement).toBe(state.host.querySelector('.swimlane-scroll'));
});

it("renders one canonical Issue link in Tree when sync state joins the same reference", async () => {
  const { remoteWorkItemLinkSchema } = await import("@storymapper/contracts");
  const refId = randomUUID();
  const url = "https://github.com/example/project/issues/17";
  state.snapshot = { ...state.snapshot, githubLinks: [{ id: refId, cardId, repo: "example/project", issueNumber: 17, url, syncState: "stale" }], remoteWorkItemLinks: [remoteWorkItemLinkSchema.parse({ id: randomUUID(), externalRefId: refId, connectionId: randomUUID(), cardId, provider: "github", remoteId: "17", remoteNumber: 17, url, syncState: "stale" })] };
  await mount(viewUrl);
  const row = primary(cardId).closest(".tree-row")!;
  expect(row.querySelectorAll(`a[href="${url}"]`)).toHaveLength(1);
  expect(row.querySelector(`a[href="${url}"]`)?.textContent).toContain("#17");
});

it("uses canonical source-only and synced GitHub refs once in Tracking risks while excluding other providers", async () => {
  const { githubLinkSchema, remoteWorkItemLinkSchema } = await import("@storymapper/contracts");
  const template = { ...state.snapshot.cards[2]!, description: "Delivery evidence" };
  const cards = [template, ...Array.from({ length: 3 }, (_, index) => ({ ...template, id: randomUUID(), key: `LSM-${index + 4}`, title: `Evidence ${index}` }))];
  const chunkId = "a".repeat(64), now = template.createdAt;
  const remote = remoteWorkItemLinkSchema.parse({ id: randomUUID(), externalRefId: randomUUID(), connectionId: randomUUID(), provider: "github", cardId: cards[2]!.id, remoteId: "2", remoteNumber: 2, url: "https://github.com/example/project/issues/2", syncState: "synced" });
  const other = { ...remote, id: randomUUID(), cardId: cards[3]!.id };
  Object.assign(other, { provider: "other-provider" });
  state.snapshot = { ...state.snapshot, cards: [...state.snapshot.cards.slice(0, 2), ...cards], sourceChunks: [{ id: chunkId, documentId: randomUUID(), text: "Evidence", locator: "section 1" }], sourceLinks: [{ kind: "chunk", id: randomUUID(), cardId: cards[0]!.id, chunkId, confidence: null, createdAt: now }], githubLinks: [githubLinkSchema.parse({ id: randomUUID(), cardId: cards[1]!.id, repo: "example/project", issueNumber: 1, url: "https://github.com/example/project/issues/1", syncState: "synced" }), githubLinkSchema.parse({ id: remote.externalRefId, cardId: remote.cardId, repo: "example/project", issueNumber: 2, url: remote.url, syncState: remote.syncState })], remoteWorkItemLinks: [remote, other] };
  await mount(viewUrl.replace(/tree$/, "tracking"));
  expect([...state.host.querySelectorAll('.release-risk-strip span')].map((item) => item.textContent)).toEqual(["0 descriptions", "3 sources", "2 GitHub"]);
});

it.each(["discovery", "tree", "planning", "backlog", "tracking"])("projects a distributed legal1000-Card map with Notes, Releases and hidden ancestry in %s", async (view) => {
  const { visibleCards } = await import("@storymapper/core");
  const { open, released } = releases();
  const [activityTemplate, stepTemplate, storyTemplate] = state.snapshot.cards;
  const secondOpen = { ...open, id: randomUUID(), name: "Second open delivery", position: 2 };
  const cards: typeof state.snapshot.cards = [];
  function add(template: typeof storyTemplate, patch: Partial<NonNullable<typeof storyTemplate>>) {
    const card = { ...template!, id: randomUUID(), key: `LSM-${cards.length + 1}`, position: cards.length, ...patch };
    cards.push(card);
    return card;
  }
  const activities = Array.from({ length: 4 }, (_, index) => add(activityTemplate, { title: `Activity ${index}`, parked: index === 2, status: index === 3 ? "archived" : "todo" }));
  const steps = activities.flatMap((activity, group) => Array.from({ length: 2 }, (_, index) => add(stepTemplate, { parentId: activity.id, title: `Step ${group}-${index}` })));
  for (const [index, parentId] of [null, activities[0]!.id, steps[0]!.id, null, activities[1]!.id, steps[2]!.id, null, activities[2]!.id, steps[4]!.id].entries()) add(storyTemplate, { level: "note", parentId, title: `Note ${index}`, releaseId: index % 2 ? released.id : null });
  const releaseIds = [null, open.id, secondOpen.id, released.id];
  for (let index = 0; cards.length < 1000; index += 1) add(storyTemplate, { id: index === 0 ? cardId : randomUUID(), parentId: steps[index % steps.length]!.id, title: index === 0 ? storyTemplate!.title : `Distributed Story ${index}`, releaseId: releaseIds[index % releaseIds.length]!, parked: index > 0 && index % 17 === 0, status: index > 0 && index % 19 === 0 ? "archived" : "todo" });
  state.snapshot = { ...state.snapshot, cards, releases: [open, released, secondOpen] };
  expect(cards).toHaveLength(1000);
  await mount(viewUrl.replace(/tree$/, view));
  const scope = state.host.querySelector(view === "discovery" ? '.discovery-matrix' : view === "tree" ? '.tree-body' : view === "planning" ? '.swimlane-body' : view === "backlog" ? '.backlog-list' : '.release-kanban')!;
  const ids = () => new Set([...scope.querySelectorAll<HTMLElement>('[data-live-card-id]')].filter((element) => !element.closest('[hidden]')).map((element) => element.dataset.liveCardId));
  const eligible = visibleCards(cards).filter((card) => view === "discovery" || view === "tree" || card.level === "story");
  const scoped = eligible.filter((card) => (view !== "planning" && view !== "tracking") || card.releaseId !== released.id);
  expect(ids()).toEqual(new Set(scoped.map((card) => card.id)));
  if (view === "planning" || view === "tracking") {
    const showAll = state.host.querySelector<HTMLInputElement>(view === "planning" ? '.board-workspace > label input' : '.release-kanban-page > label input')!;
    await act(async () => showAll.click());
    expect(ids()).toEqual(new Set(eligible.map((card) => card.id)));
  }
});

it("keeps released Planning lanes display:none with the actual stylesheet and in standalone export clones", async () => {
  releases();
  const style = document.createElement("style");
  style.textContent = readStylesheet(join(process.cwd(), "src/styles/global.css"));
  document.head.append(style);
  const exported = document.createElement("div");
  document.body.append(exported);
  try {
    await mount(viewUrl.replace(/tree$/, "planning"));
    const lane = state.host.querySelector<HTMLElement>('.swimlane-row[hidden]')!;
    expect(getComputedStyle(lane).display).toBe("none");
    exported.append(state.host.querySelector('.swimlane-scroll')!.cloneNode(true));
    expect(getComputedStyle(exported.querySelector('.swimlane-row[hidden]')!).display).toBe("none");
    expect(exported.closest('.board-workspace')).toBeNull();
  } finally { exported.remove(); style.remove(); }
});

it("shows a refused Planning priority save without an unhandled rejection", async () => {
  await mount(viewUrl.replace(/tree$/, "planning"));
  const writes = vi.spyOn(api, "updateCard").mockRejectedValue(new Error("Priority save refused"));
  const unhandled = vi.fn();
  window.addEventListener("unhandledrejection", unhandled);
  try {
    const tile = primary(cardId).closest('article')!;
    await act(async () => tile.querySelector<HTMLButtonElement>('[aria-haspopup="listbox"]')!.click());
    const option = [...tile.querySelectorAll<HTMLButtonElement>('[role="option"]')].find((option) => option.textContent === CARD_PRIORITY_OPTIONS[0])!;
    await act(async () => option.click());
    await vi.waitFor(() => expect(state.host.querySelector('[role="alert"]')?.textContent).toBe("Priority save refused"));
    expect(writes).toHaveBeenCalledWith(cardId, { priority: CARD_PRIORITY_OPTIONS[0] }, 1);
    expect(unhandled).not.toHaveBeenCalled();
  } finally { window.removeEventListener("unhandledrejection", unhandled); }
});
