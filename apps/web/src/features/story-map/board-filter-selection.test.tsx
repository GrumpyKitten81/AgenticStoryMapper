// @vitest-environment jsdom
import { readStylesheet } from "@storymapper/web/test-fixtures/styles";
import { readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { personaSchema, storyMapSnapshotSchema, type StoryMapSnapshot, type ChangeSetPreviewBoard } from "@storymapper/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { DiscoveryMatrix } from "@storymapper/web/features/story-map/components/DiscoveryMatrix";
import { BoardToolbar } from "@storymapper/web/features/story-map/components/BoardToolbar";
import { defaultBoardFilters, hasActiveBoardFilters } from "@storymapper/web/features/story-map/board-filters";
import { encodeFilterValue, useStoryMapBoardState, type StoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";
import { ConflictError } from "@storymapper/web/app/conflicts";
import { api } from "@storymapper/web/app/api";

const features = vi.hoisted(() => ({ personas: true }));
vi.mock("@storymapper/web/app/feature-flags", async (original) => ({
  ...await original<typeof import("@storymapper/web/app/feature-flags")>(),
  get isPersonasEnabled() { return features.personas; }
}));

vi.mock("@storymapper/web/features/github-sync/GitHubSyncPanel", () => ({ GitHubSyncPanel: () => null }));

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let state: StoryMapBoardState;
let snapshot: StoryMapSnapshot;
let preview: ChangeSetPreviewBoard | undefined;
let showBoard = false;
function Fixture() { state = useStoryMapBoardState(snapshot, undefined, preview); return <div data-story-map-board tabIndex={-1}><BoardToolbar state={state} />{showBoard ? <DiscoveryMatrix state={state} zoom={1} onSelectCard={() => {}} /> : null}</div>; }
async function render() { await act(async () => root.render(<QueryClientProvider client={client}><Fixture /></QueryClientProvider>)); }
async function change(control: HTMLInputElement | HTMLSelectElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(control instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype, "value")!.set!.call(control, value);
    control.dispatchEvent(new Event(control instanceof HTMLSelectElement ? "change" : "input", { bubbles: true }));
  });
}
beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  features.personas = true;
  preview = undefined;
  showBoard = false;
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  notifyManager.setScheduler(queueMicrotask);
  const now = new Date().toISOString();
  const mapId = randomUUID();
  const rootId = randomUUID();
  snapshot = storyMapSnapshotSchema.parse({ storyMap: { id: mapId, projectId: randomUUID(), version: 1, name: "Filter fixture", createdAt: now, updatedAt: now }, cards: [
    { id: rootId, key: "K-1", parentId: null, level: "activity", title: "Context", position: 0 },
    { id: randomUUID(), key: "K-2", parentId: rootId, level: "story", title: "Needle", position: 0, estimate: 0, color: "custom", status: "all" },
    { id: randomUUID(), key: "K-3", parentId: null, level: "note", title: "Other", position: 1 }
  ].map((card) => ({ version: 1, storyMapId: mapId, releaseId: null, status: "todo", creationOrigin: "manual", provenance: "manual", createdAt: now, updatedAt: now, ...card })), releases: [], cardDependencies: [], sourceLinks: [], githubLinks: [], workflowStatuses: [], personas: [], cardPersonas: [], annotations: [], cardAnnotations: [], storyTemplates: [] });
  host = document.createElement("div"); document.body.append(host); root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  await render();
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.restoreAllMocks(); vi.unstubAllGlobals(); notifyManager.setScheduler((callback) => setTimeout(callback, 0)); });

it("combines literal status, custom color, zero estimate and remote identity while retaining only context ancestors", async () => {
  const card = snapshot.cards[1]!;
  const refId = randomUUID();
  const url = "https://github.com/remote-needle/repository/issues/123";
  snapshot = { ...snapshot, githubLinks: [{ id: refId, cardId: card.id, repo: "remote-needle/repository", issueNumber: 123, url, syncState: "conflict" }], remoteWorkItemLinks: [{ id: randomUUID(), externalRefId: refId, connectionId: randomUUID(), cardId: card.id, provider: "github", remoteId: "123", remoteNumber: 123, url, syncState: "conflict", labels: [], parentOverrideLocal: false }] };
  await render();
  await act(async () => state.setFilters({ ...defaultBoardFilters, search: "remote-needle", statuses: [JSON.stringify(["local", "all"])], color: encodeFilterValue("custom"), estimate: "estimated", github: "conflict" }));
  expect([...state.filtered.matchingCardIds]).toEqual([card.id]);
  expect([...state.filtered.visibleCardIds].sort()).toEqual([snapshot.cards[0]!.id, card.id].sort());
  expect(state.selectedIds.size).toBe(0);
  await act(async () => state.setFilters((filters) => ({ ...filters, github: "unlinked" })));
  expect(state.filtered.cards).toHaveLength(0);
});

it("matches Standard for absent and explicit default colors and combines it with search", async () => {
  const [absent, custom, explicit] = snapshot.cards;
  snapshot = { ...snapshot, cards: [absent!, custom!, { ...explicit!, color: "#ffffff" }] };
  await render();
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-pressed]')!.click());
  const color = host.querySelector<HTMLSelectElement>('[aria-label="Color category"]')!;
  await change(color, encodeFilterValue("#ffffff"));
  expect([...state.filtered.matchingCardIds]).toEqual([absent!.id, explicit!.id]);
  expect(host.textContent).toContain("2 matches / 3 cards");
  await change(host.querySelector<HTMLInputElement>('[aria-label="Search cards"]')!, "Other");
  expect([...state.filtered.matchingCardIds]).toEqual([explicit!.id]);
  await change(color, encodeFilterValue("custom"));
  expect(state.filtered.matchingCardIds.size).toBe(0);
  await change(host.querySelector<HTMLInputElement>('[aria-label="Search cards"]')!, "");
  expect([...state.filtered.matchingCardIds]).toEqual([custom!.id]);
});

it("retains completely hidden targets for versioned patch and visibly rejects invalid estimates", async () => {
  const targets = snapshot.cards.slice(1).map((card) => card.id);
  const update = vi.spyOn(api, "bulkUpdateCards").mockResolvedValue({ cards: snapshot.cards.slice(1) });
  await act(async () => { state.setBulkSelectedIds(new Set(targets)); state.setFilters((filters) => ({ ...filters, search: "no-match" })); state.setBulkPatch((patch) => ({ ...patch, estimate: "bad" })); });
  expect(host.textContent).toContain("2 selected: 0 visible, 2 hidden");
  await act(async () => state.runBulkUpdate("patch"));
  expect(update).not.toHaveBeenCalled(); expect(host.querySelector('[role="alert"]')?.textContent).toContain("finite number");
  await act(async () => state.setBulkPatch((patch) => ({ ...patch, estimate: "0" })));
  await act(async () => state.runBulkUpdate("patch"));
  expect(update).toHaveBeenCalledWith({ storyMapId: snapshot.storyMap.id, cards: targets.map((id) => ({ id, baseVersion: 1 })), patch: { estimate: 0 } });
});

it("prunes archived or deleted Cards independently of filters and resets on map changes", async () => {
  await act(async () => state.setBulkSelectedIds(new Set(snapshot.cards.map((card) => card.id))));
  snapshot = { ...snapshot, cards: snapshot.cards.slice(1).map((card, index) => index ? card : { ...card, parentId: null, status: "archived" }) };
  await render(); expect([...state.selectedIds]).toEqual([snapshot.cards[1]!.id]);
  snapshot = { ...snapshot, storyMap: { ...snapshot.storyMap, id: randomUUID() } };
  await render(); expect(state.selectedIds.size).toBe(0);
});

it("names filter controls and distinguishes literal reserved option values", async () => {
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-pressed]')!.click());
  const status = host.querySelector<HTMLSelectElement>('[aria-label="All statuses"]')!;
  const statusKey = JSON.stringify(["local", "all"]);
  expect([...status.options].map((option) => option.value)).toContain(statusKey);
  await change(status, statusKey);
  expect(state.filtered.matchingCardIds.size).toBe(1);
  for (const control of host.querySelectorAll("input, select")) expect(control.getAttribute("aria-label")).toBeTruthy();
});

it("records diagnostic input-to-result samples over 1,000 cached Cards", async () => {
  const template = snapshot.cards[1]!;
  snapshot = { ...snapshot, cards: [snapshot.cards[0]!, ...Array.from({ length: 999 }, (_, index) => ({ ...template, id: randomUUID(), key: `K-${index + 2}`, title: `Fixture ${index}`, color: index % 2 ? "custom" : "all" }))] };
  await render();
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-pressed]')!.click());
  const samples: Array<{ action: string; phase: string; milliseconds: number; matches: number }> = [];
  for (let run = 0; run < 3; run++) {
    for (const [label, value] of [["Search cards", "Fixture 99"], ["Search cards", ""], ["Color category", "value:custom"], ["Color category", "all"]]) {
      const control = host.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)!;
      const start = performance.now();
      await change(control, value!);
      samples.push({ action: `${label}=${value}`, phase: run === 0 ? "cold-first-sequence" : `warm-${run}`, milliseconds: performance.now() - start, matches: state.filtered.matchingCardIds.size });
      expect(host.textContent).toContain(`${state.filtered.matchingCardIds.size} matches / 1000 cards`);
    }
  }
  writeFileSync(join(tmpdir(), `story-6-4-dom-timing-${Date.now()}.json`), JSON.stringify({ environment: { node: process.version, platform: process.platform, runner: "Vitest jsdom", nativePaint: false }, fixture: "1000 cached Cards: 1 Activity, 999 child Stories; BoardToolbar and real hook mounted", boundary: "untrusted DOM input/change dispatch through React act to committed match status; board tiles not mounted", referenceMilliseconds: 300, acceptanceGate: false, samples }, null, 2));
});

it("matches literal relationship and Release IDs independently of reserved choices", async () => {
  const card = snapshot.cards[1]!;
  snapshot = { ...snapshot,
    cards: snapshot.cards.map((item) => item.id === card.id ? { ...item, releaseId: "unscheduled" } : item),
    releases: [{ id: "unscheduled", storyMapId: snapshot.storyMap.id, version: 1, name: "Literal release", position: 0, goal: "", released: false, startDate: "2026-10-01", releaseDate: "2026-10-31" }],
    personas: [{ id: "none", version: 1, storyMapId: null, projectId: snapshot.storyMap.projectId, name: "Literal persona", role: "", description: "", goals: [], pains: [], personaType: "", avatar: "", represents: "", age: "", country: "", fachexpertise: "", workLife: "", productExperience: "", expectations: "", centralNeed: "", successIndicators: "", scopeNote: "" }],
    annotations: [{ id: "all", storyMapId: null, icon: "tag", projectId: snapshot.storyMap.projectId, name: "Literal annotation", color: "custom", position: 0 }],
    cardPersonas: [{ id: randomUUID(), cardId: card.id, personaId: "none", createdAt: new Date().toISOString() }],
    cardAnnotations: [{ id: randomUUID(), cardId: card.id, annotationId: "all", createdAt: new Date().toISOString() }],
    sourceLinks: [{ id: randomUUID(), cardId: card.id, kind: "note", note: "Source evidence", createdAt: new Date().toISOString() }]
  };
  await render();
  await act(async () => state.setFilters({ ...defaultBoardFilters, release: encodeFilterValue("unscheduled"), persona: encodeFilterValue("none"), annotation: encodeFilterValue("all"), source: "linked", search: "Source evidence" }));
  expect([...state.filtered.matchingCardIds]).toEqual([card.id]);
  await act(async () => state.setFilters((filters) => ({ ...filters, persona: "none" })));
  expect(state.filtered.matchingCardIds.size).toBe(0);
});

it("lists every bulk conflict and preserves the complete retained intent", async () => {
  const cards = snapshot.cards.slice(1);
  const conflicts = cards.map((card) => ({ entity: "card" as const, id: card.id, baseVersion: 1, currentVersion: 2, current: card }));
  vi.spyOn(api, "bulkUpdateCards").mockRejectedValue(new ConflictError("Changed Cards", conflicts));
  await act(async () => { state.setBulkSelectedIds(new Set(cards.map((card) => card.id))); state.setFilters((filters) => ({ ...filters, search: "missing" })); });
  await act(async () => state.runBulkUpdate("archive"));
  await vi.waitFor(() => expect(host.querySelectorAll('[role="alert"] li')).toHaveLength(2));
  expect(state.selectedIds.size).toBe(2);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Needle");
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Other");
});

it("restores a bulk Delete opener even when the pointer click did not focus it, and discards dialogs across scopes", async () => {
  vi.spyOn(api, "captureDeleteAffectedCards").mockResolvedValue([]);
  await act(async () => state.setBulkSelectedIds(new Set([snapshot.cards[1]!.id])));
  const opener = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Delete selected Cards")!;
  host.tabIndex = -1; host.focus();
  await act(async () => opener.click());
  const cancel = document.querySelector<HTMLButtonElement>('[data-dialog-cancel]')!;
  await act(async () => cancel.click());
  expect(document.activeElement).toBe(opener);
  await act(async () => opener.click());
  const originalMap = snapshot.storyMap.id;
  snapshot = { ...snapshot, storyMap: { ...snapshot.storyMap, id: randomUUID() } };
  await render();
  snapshot = { ...snapshot, storyMap: { ...snapshot.storyMap, id: originalMap } };
  await render(); expect(document.querySelector('[role="alertdialog"]')).toBeNull();
  await act(async () => state.setBulkSelectedIds(new Set([snapshot.cards[1]!.id])));
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Delete selected Cards")!.click());
  preview = { snapshot, markers: [] }; await render();
  preview = undefined; await render();
  expect(document.querySelector('[role="alertdialog"]')).toBeNull();
});

it("sends a successful Archive over the full hidden retained set and refuses same-tick duplicate Apply", async () => {
  const targets = snapshot.cards.slice(1).map((card) => card.id);
  const update = vi.spyOn(api, "bulkUpdateCards").mockResolvedValue({ cards: snapshot.cards.slice(1) });
  await act(async () => { state.setBulkSelectedIds(new Set(targets)); state.setFilters((filters) => ({ ...filters, search: "missing" })); });
  const archive = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Archive")!;
  await act(async () => { archive.click(); archive.click(); });
  expect(update).toHaveBeenCalledTimes(1);
  expect(update.mock.calls[0]![0]).toEqual({ storyMapId: snapshot.storyMap.id, cards: targets.map((id) => ({ id, baseVersion: 1 })), patch: { archived: true } });
});

it("applies the full hidden multi-field patch and distinguishes literal Release __none from Unscheduled", async () => {
  const target = snapshot.cards[1]!;
  snapshot = { ...snapshot, releases: [{ id: "__none", storyMapId: snapshot.storyMap.id, version: 1, name: "Literal none", goal: "", released: false, position: 0, startDate: "2026-10-01", releaseDate: "2026-10-31" }] };
  await render();
  const update = vi.spyOn(api, "bulkUpdateCards").mockResolvedValue({ cards: [target] });
  await act(async () => { state.setBulkSelectedIds(new Set([target.id])); state.setFilters((filters) => ({ ...filters, search: "missing" })); state.setBulkPatch((patch) => ({ ...patch, status: "all", addPersonaId: "persona", removePersonaId: "old-persona", addAnnotationId: "annotation", removeAnnotationId: "old-annotation", color: "custom" })); });
  const release = host.querySelector<HTMLSelectElement>('[aria-label="Release"]')!;
  await change(release, "value:__none");
  const apply = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Apply")!;
  await act(async () => { apply.click(); apply.click(); });
  expect(update).toHaveBeenCalledTimes(1);
  expect(update.mock.calls[0]![0].patch).toEqual({ status: "all", releaseId: "__none", addPersonaId: "persona", removePersonaId: "old-persona", addAnnotationId: "annotation", removeAnnotationId: "old-annotation", color: "custom" });
  await act(async () => state.setBulkSelectedIds(new Set([target.id])));
  await change(host.querySelector<HTMLSelectElement>('[aria-label="Release"]')!, "__none");
  await act(async () => state.runBulkUpdate("patch"));
  expect(update.mock.calls[1]![0].patch.releaseId).toBeNull();
});

it("refuses selected bulk mutation in preview", async () => {
  const update = vi.spyOn(api, "bulkUpdateCards").mockResolvedValue({ cards: [] });
  preview = { snapshot, markers: [] }; await render();
  await act(async () => { state.setBulkSelectedIds(new Set([snapshot.cards[1]!.id])); state.setBulkPatch((patch) => ({ ...patch, status: "done" })); });
  await act(async () => { state.runBulkUpdate("patch"); state.runBulkUpdate("archive"); });
  expect(update).not.toHaveBeenCalled();
  expect(host.querySelector('.bulk-action-bar')).toBeNull();
});

it("restores the selected GitHub opener on Escape and discards its frozen scope across map and preview transitions", async () => {
  await act(async () => state.setBulkSelectedIds(new Set([snapshot.cards[1]!.id])));
  const opener = () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Selected Cards GitHub Dry Run")!;
  host.tabIndex = -1; host.focus();
  const originalOpener = opener();
  await act(async () => originalOpener.click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  await act(async () => document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(document.activeElement).toBe(originalOpener);
  await act(async () => opener().click());
  const originalMap = snapshot.storyMap.id;
  snapshot = { ...snapshot, storyMap: { ...snapshot.storyMap, id: randomUUID() } }; await render();
  snapshot = { ...snapshot, storyMap: { ...snapshot.storyMap, id: originalMap } }; await render();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => state.setBulkSelectedIds(new Set([snapshot.cards[1]!.id])));
  await act(async () => opener().click());
  preview = { snapshot, markers: [] }; await render();
  preview = undefined; await render();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
});

it("keeps the actual toolbar stylesheet in one shrinkable header column with wrapping filter tracks", async () => {
  const style = document.createElement("style");
  style.textContent = readStylesheet(join(process.cwd(), "src/styles/global.css"));
  document.head.append(style); host.classList.add("story-map-view-header");
  try {
    await act(async () => host.querySelector<HTMLButtonElement>('[aria-pressed]')!.click());
    expect(getComputedStyle(host).gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(getComputedStyle(host.querySelector(".board-toolbar")!).minWidth).toBe("0");
    expect(getComputedStyle(host.querySelector(".board-toolbar")!).gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(getComputedStyle(host.querySelector(".board-search-row")!).flexWrap).toBe("wrap");
    const searchRule = [...style.sheet!.cssRules].find((rule) => "selectorText" in rule && rule.selectorText === ".board-search-row input") as CSSStyleRule;
    expect(searchRule.style.getPropertyValue("min-width")).toBe("min(100%, 16rem)");
    expect(getComputedStyle(host.querySelector(".board-search-row input")!).flexBasis).toBe("16rem");
    expect(getComputedStyle(host.querySelector(".board-filter-row")!).gridTemplateColumns).toBe("repeat(auto-fit, minmax(110px, 1fr))");
    const status = host.querySelector<HTMLSelectElement>('select[multiple]')!;
    expect(status.closest(".board-filter-row")).toBeNull();
    expect(status.parentElement?.classList.contains("form-stack")).toBe(true);
    expect(getComputedStyle(status).minWidth).toBe("0");
    expect(getComputedStyle(status.parentElement!).gridTemplateColumns).toBe("minmax(0, 1fr)");
    expect(getComputedStyle(status.parentElement!.querySelector(".button-row")!).flexWrap).toBe("wrap");
    expect(host.querySelector('.board-filter-row fieldset')).toBeNull();
  } finally { style.remove(); }
});

it("preserves newly selected targets when a delayed bulk request succeeds", async () => {
  const [submitted, added] = snapshot.cards.slice(1);
  let finish!: (value: { cards: typeof snapshot.cards }) => void;
  const update = vi.spyOn(api, "bulkUpdateCards").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => state.setBulkSelectedIds(new Set([submitted!.id])));
  await act(async () => state.runBulkUpdate("archive"));
  await act(async () => state.toggleBulkSelection(added!.id));
  await act(async () => finish({ cards: [submitted!] }));
  expect(update).toHaveBeenCalledTimes(1);
  expect([...state.selectedIds]).toEqual([added!.id]);
});

it.each(["Apply", "Archive"])("recovers keyboard focus after successful %s and preserves independently moved focus", async (action) => {
  let finish!: (value: { cards: typeof snapshot.cards }) => void;
  vi.spyOn(api, "bulkUpdateCards").mockImplementation(() => new Promise((resolve) => { finish = resolve; }));
  const target = snapshot.cards[1]!;
  const search = host.querySelector<HTMLInputElement>('[aria-label="Search cards"]')!;
  for (const moved of [false, true]) {
    await act(async () => { state.setBulkSelectedIds(new Set([target.id])); state.setBulkPatch((patch) => ({ ...patch, status: "done" })); });
    const submit = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === action)!;
    await act(async () => { submit.focus(); submit.click(); });
    const outside = document.createElement("button"); document.body.append(outside);
    if (moved) outside.focus();
    await act(async () => finish({ cards: [target] }));
    expect(document.activeElement).toBe(moved ? outside : search);
    outside.remove();
  }
});

it("restores focus to the submitted control after a failed bulk action dropped it to the document body", async () => {
  let fail!: (error: Error) => void;
  vi.spyOn(api, "bulkUpdateCards").mockImplementation(() => new Promise((_, reject) => { fail = reject; }));
  await act(async () => { state.setBulkSelectedIds(new Set([snapshot.cards[1]!.id])); });
  const archive = [...host.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === "Archive")!;
  await act(async () => { archive.focus(); archive.click(); });
  const dropFocus = document.createElement("button"); document.body.append(dropFocus); dropFocus.focus(); dropFocus.remove();
  expect(document.activeElement).toBe(document.body);
  await act(async () => fail(new Error("Rejected")));
  expect(document.activeElement).toBe(archive);
});

it("clears mutation and numeric errors when selection is cleared before selecting unrelated Cards", async () => {
  const first = snapshot.cards[1]!, other = snapshot.cards[2]!;
  vi.spyOn(api, "bulkUpdateCards").mockRejectedValue(new Error("Old failure"));
  await act(async () => state.setBulkSelectedIds(new Set([first.id])));
  await act(async () => state.runBulkUpdate("archive"));
  await vi.waitFor(() => expect(host.textContent).toContain("Old failure"));
  await act(async () => state.setBulkSelectedIds(new Set()));
  await act(async () => state.setBulkSelectedIds(new Set([other.id])));
  expect(host.querySelector('[role="alert"]')).toBeNull();
  await act(async () => state.setBulkPatch((patch) => ({ ...patch, estimate: "bad" })));
  await act(async () => state.runBulkUpdate("patch"));
  expect(host.querySelector('[role="alert"]')).not.toBeNull();
  await act(async () => state.setBulkSelectedIds(new Set()));
  await act(async () => state.setBulkSelectedIds(new Set([first.id])));
  expect(host.querySelector('[role="alert"]')).toBeNull();
});

it("records complete Discovery DOM input-to-result diagnostics on a legal 1,000-Card hierarchy", async () => {
  const activity = snapshot.cards[0]!, template = snapshot.cards[1]!;
  const step = { ...template, id: randomUUID(), key: "K-2", title: "Step", level: "step" as const, parentId: activity.id };
  snapshot = { ...snapshot, cards: [activity, step, ...Array.from({ length: 998 }, (_, index) => ({ ...template, id: randomUUID(), key: `K-${index + 3}`, title: `Fixture ${index}`, parentId: step.id, color: index % 2 ? "custom" : "all" }))] };
  showBoard = true;
  const samples: Array<{ action: string; phase: string; milliseconds: number; matches: number; renderedTiles: number; visibleTiles: number }> = [];
  const capture = (action: string, phase: string, start: number) => {
    const tiles = [...host.querySelectorAll<HTMLButtonElement>("button[data-card-id]")];
    samples.push({ action, phase, milliseconds: performance.now() - start, matches: state.filtered.matchingCardIds.size, renderedTiles: tiles.length, visibleTiles: tiles.filter((tile) => !tile.closest("[hidden]")).length });
  };
  let start = performance.now(); await render(); capture("mount", "cold", start);
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-pressed]')!.click());
  for (let run = 0; run < 2; run++) for (const [label, value] of [["Search cards", "Fixture 99"], ["Search cards", ""], ["Color category", "value:custom"], ["Color category", "all"]]) {
    start = performance.now();
    await change(host.querySelector<HTMLInputElement | HTMLSelectElement>(`[aria-label="${label}"]`)!, value!);
    capture(`${label}=${value}`, run === 0 ? "cold-first-input-sequence" : "warm", start);
  }
  writeFileSync(join(tmpdir(), `story-6-4-discovery-dom-timing-${Date.now()}.json`), JSON.stringify({ environment: { node: process.version, platform: process.platform, runner: "Vitest jsdom", nativePaint: false }, fixture: "1000 renderable Cards:1Activity+1Step+998Stories; real DiscoveryMatrix, CardTiles, DndContext and BoardToolbar", boundary: "untrusted DOM input/change through React act to committed complete Discovery tile DOM and match status; visibleTiles excludes hidden ancestors; no native layout/paint claim", referenceMilliseconds: 300, acceptanceGate: false, samples }, null, 2));
  expect(samples.every((sample) => sample.renderedTiles === 1000)).toBe(true);
  expect(samples[0]!.visibleTiles).toBe(1000);
  expect(samples.at(-1)!.visibleTiles).toBe(1000);
  expect(samples[1]!.visibleTiles).toBe(samples[1]!.matches + 2);
}, 60000);

it("starts each newly selected map with open Planning Releases", async () => {
  await render();
  await act(async () => state.setPlanningShowAllReleases(true));
  expect(state.planningShowAllReleases).toBe(true);
  snapshot = { ...snapshot, storyMap: { ...snapshot.storyMap, id: randomUUID() }, cards: [] };
  await render();
  expect(state.planningShowAllReleases).toBe(false);
});

it("ignores stale Persona filters and bulk intent while hiding Persona controls and search metadata", async () => {
  features.personas = false;
  const target = snapshot.cards[1]!;
  const persona = personaSchema.parse({ id: randomUUID(), projectId: snapshot.storyMap.projectId, storyMapId: null, version: 1, name: "Literal persona", role: "Reader" });
  snapshot = { ...snapshot, personas: [persona], cardPersonas: [{ id: randomUUID(), cardId: target.id, personaId: persona.id, createdAt: target.createdAt }] };
  const preserved = JSON.stringify(snapshot);
  await render();
  await act(async () => {
    state.setFilters((filters) => ({ ...filters, persona: "value:missing" }));
    state.setBulkSelectedIds(new Set([target.id]));
    state.setBulkPatch((patch) => ({ ...patch, status: "done", addPersonaId: persona.id, removePersonaId: persona.id, addAnnotationId: "annotation" }));
  });
  expect(state.filtered.matchingCardIds.size).toBe(snapshot.cards.length);
  expect(hasActiveBoardFilters(state.filters)).toBe(false);
  expect(state.personaNamesByCardId).toEqual({});
  await act(async () => host.querySelector<HTMLButtonElement>('[aria-pressed]')!.click());
  for (const label of ["Any persona", "Add persona", "Remove persona"]) expect(host.querySelector(`[aria-label="${label}"]`)).toBeNull();
  expect(host.textContent).not.toContain(persona.name);
  await act(async () => state.setFilters((filters) => ({ ...filters, search: persona.name })));
  expect(state.filtered.matchingCardIds.size).toBe(0);
  await act(async () => state.setFilters((filters) => ({ ...filters, search: "Needle", persona: "none" })));
  expect([...state.filtered.matchingCardIds]).toEqual([target.id]);
  const update = vi.spyOn(api, "bulkUpdateCards").mockResolvedValue({ cards: [target] });
  await act(async () => state.runBulkUpdate("patch"));
  expect(update.mock.calls[0]![0].patch).toEqual({ status: "done", addAnnotationId: "annotation" });
  expect(JSON.stringify(snapshot)).toBe(preserved);
});
