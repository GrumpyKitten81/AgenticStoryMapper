// @vitest-environment jsdom // REQ FR-49
import { mapId, activityId, stepId, storyId, neighborId, releaseId } from "@storymapper/web/test-fixtures/lifecycle-ids";
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider, QueryObserver } from "@tanstack/react-query";
import { storyMapSnapshotSchema, type StoryMapSnapshot } from "@storymapper/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { BoardToolbar } from "@storymapper/web/features/story-map/components/BoardToolbar";
import { DiscoveryMatrix } from "@storymapper/web/features/story-map/components/DiscoveryMatrix";
import { BacklogList } from "@storymapper/web/features/story-map/components/BacklogList";
import { SwimlaneGrid } from "@storymapper/web/features/story-map/components/SwimlaneGrid";
import { LifecycleActions } from "@storymapper/web/features/story-map/components/LifecycleActions";
import { FirstMapGuidance } from "@storymapper/web/features/story-map/components/FirstMapGuidance";
import { visibleCards } from "@storymapper/core";
import { ConflictError } from "@storymapper/web/app/conflicts";
import { api, useStoryMap } from "@storymapper/web/app/api";
import { type StoryMapBoardState, useStoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";

let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let snapshot: StoryMapSnapshot;
let snapshotReads: number;
let requests: Array<{ path: string; body: Record<string, unknown> }>;
let failAction: boolean;
let failStatus: number;
let currentBoard: StoryMapBoardState;
let releaseAction: (() => void) | undefined;

function Fixture() {
  const current = useStoryMap(mapId).data;
  return current ? <BoardFixture current={current} /> : null;
}

function BoardFixture({ current }: { current: StoryMapSnapshot }) {
  const state = useStoryMapBoardState(current, current.storyMap.projectId);
  currentBoard = state;
  const card = current.cards.find((item) => item.id === activityId);
  return <div data-story-map-board tabIndex={-1}><BoardToolbar state={state} /><FirstMapGuidance state={state} onSelectCard={() => {}} /><DiscoveryMatrix state={state} zoom={1} onSelectCard={() => {}} />{card ? <LifecycleActions card={card} snapshot={current} onNotice={state.setLifecycleNotice} /> : null}</div>;
}

function ListViewsFixture() {
  const current = useStoryMap(mapId).data;
  return current ? <ListViews current={current} /> : null;
}

function ListViews({ current }: { current: StoryMapSnapshot }) {
  const state = useStoryMapBoardState(current, current.storyMap.projectId);
  return <><BoardToolbar state={state} /><SwimlaneGrid state={state} onSelectCard={() => {}} /><BacklogList state={state} onSelectCard={() => {}} /></>;
}

async function refreshServer(next: StoryMapSnapshot) {
  snapshot = next;
  await act(async () => { await client.invalidateQueries({ queryKey: ["story-map", mapId] }); });
}

function button(text: string, scope: ParentNode = document): HTMLButtonElement {
  const result = [...scope.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.textContent === text);
  expect(result, text).toBeDefined();
  return result!;
}

async function click(button: HTMLElement) {
  await act(async () => { button.focus(); button.click(); });
}

beforeEach(async () => {
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() {} disconnect() {} });
  localStorage.clear();
  requests = [];
  snapshotReads = 0;
  failAction = false;
  failStatus = 500;
  releaseAction = undefined;
  const now = new Date().toISOString();
  const projectId = randomUUID();
  const card = { creationOrigin: "manual", provenance: "manual", version: 1, storyMapId: mapId, releaseId: null, status: "todo", parked: false, createdAt: now, updatedAt: now };
  snapshot = storyMapSnapshotSchema.parse({
    storyMap: { version: 1, id: mapId, projectId, name: "Lifecycle acceptance", createdAt: now, updatedAt: now },
    cards: [
      { ...card, id: activityId, key: "LSM-1", parentId: null, position: 10, level: "activity", title: "Container" },
      { ...card, id: stepId, key: "LSM-2", parentId: activityId, position: 0, level: "step", title: "Retained step" },
      { ...card, id: storyId, key: "LSM-3", parentId: stepId, releaseId, position: 0, level: "story", title: "Retained story" },
      { ...card, id: neighborId, key: "LSM-4", parentId: null, position: 40, level: "activity", title: "Right neighbor" }
    ],
    releases: [{ version: 1, id: releaseId, storyMapId: mapId, name: "Delivery", position: 0, startDate: "2026-10-01", releaseDate: "2026-10-31", createdAt: now, updatedAt: now }],
    sourceLinks: [], cardDependencies: [], githubLinks: [], remoteWorkItemLinks: [], externalRefs: [
      { id: randomUUID(), entityType: "card", entityId: storyId, system: "agent", externalId: "Card-42", scopeId: mapId, syncedVersion: 1, createdAt: now },
      { id: randomUUID(), entityType: "release", entityId: releaseId, system: "planner", externalId: "Release-42", scopeId: mapId, syncedVersion: 1, createdAt: now }
    ], workflowStatuses: (["todo", "active", "done", "archived"] as const).map((name, position) => ({ id: randomUUID(), projectId, storyMapId: null, name, group: name === "archived" ? "done" : name, position })), personas: [], cardPersonas: [], annotations: [], cardAnnotations: [], storyTemplates: []
  });
  await installLifecycleRequestFixture();
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  vi.unstubAllGlobals();
});

async function installLifecycleRequestFixture() {
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    if (path === `/api/story-maps/${mapId}`) {
      snapshotReads += 1;
      return new Response(JSON.stringify(snapshot), { headers: { "content-type": "application/json" } });
    }
    if (!init) throw new Error(`Unexpected read: ${path}`);
    const body = JSON.parse(String(init.body)) as Record<string, unknown>;
    requests.push({ path, body });
    if (releaseAction) await new Promise<void>((resolve) => { releaseAction = resolve; });
    if (failAction) return new Response(JSON.stringify({ message: "Action failed" }), { status: failStatus, headers: { "content-type": "application/json" } });
    if (path.endsWith("/move")) {
      const id = path.split("/").at(-2);
      snapshot = { ...snapshot, cards: snapshot.cards.map((item) => item.id === id ? { ...item, ...body, version: item.version + 1 } as typeof item : item) };
      return Response.json(snapshot.cards.find((item) => item.id === id));
    }
    if (path.endsWith("/park")) snapshot = { ...snapshot, cards: snapshot.cards.map((item) => item.id === activityId ? { ...item, parked: true } : item.id === stepId && item.parentId === activityId ? { ...item, parentId: neighborId } : item) };
    if (path.endsWith("/unpark")) snapshot = { ...snapshot, cards: snapshot.cards.map((item) => item.id === activityId ? { ...item, parked: false, position: 41 } : item) };
    if (path.endsWith("/archive")) snapshot = { ...snapshot, cards: snapshot.cards.map((item) => item.id === activityId ? { ...item, archived: true } : item) };
    if (path === "/api/cards/bulk") snapshot = { ...snapshot, cards: snapshot.cards.map((item) => (body.cards as Array<{ id: string; }>).some((target) => target.id === item.id) ? { ...item, ...(body.patch as Record<string, unknown>) } : item) } as StoryMapSnapshot;
    else if (init.method === "PATCH" && "status" in body) snapshot = { ...snapshot, cards: snapshot.cards.map((item) => item.id === activityId ? { ...item, status: String(body.status), ...(body.archived === undefined ? {} : { archived: Boolean(body.archived) }) } : item) };
    if (path.endsWith("/delete") && path.includes("/cards/")) snapshot = { ...snapshot, cards: snapshot.cards.filter((item) => item.id !== activityId).map((item) => item.parentId === activityId ? { ...item, parentId: null } : item) };
    return new Response(JSON.stringify(path.endsWith("/delete") ? { ok: true } : path === "/api/cards/bulk" ? { cards: snapshot.cards.filter((item) => (body.cards as Array<{ id: string; }>).some((target) => target.id === item.id)) } : snapshot.cards.find((item) => item.id === activityId)), { headers: { "content-type": "application/json" } });
  }));
  host = document.createElement("div");
  document.body.append(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  root = createRoot(host);
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Fixture))));
  await vi.waitFor(async () => { await act(async () => { }); expect(host.textContent).toContain("Container"); });
}

function expectFilteredCard(scope: ParentNode, id: string): void {
  const card = scope.querySelector<HTMLElement>(`[data-live-card-id="${id}"]`)!;
  expect(card).not.toBeNull();
  const hidden = card.closest<HTMLElement>("[hidden]")!;
  expect(hidden).not.toBeNull();
  expect(hidden.hidden).toBe(true);
  expect(getComputedStyle(hidden).display).toBe("none");
  expect(card.querySelector(".drag-handle")!.getAttribute("aria-disabled")).toBe("true");
}

it("hides card external-reference badges in Discovery and matches their system:id text in board search", async () => {
  expect(host.textContent).not.toContain("agent:Card-42");
  expect(host.textContent).toContain("planner:Release-42");
  const input = host.querySelector<HTMLInputElement>('[aria-label="Search cards"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "agent:Card-42"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  const matched = host.querySelector(`button[data-card-id="${storyId}"]`)!;
  expect(matched).not.toBeNull();
  expect(matched.closest("[hidden]")).toBeNull();
  expectFilteredCard(host, neighborId);
});

it("shows card external-reference badges in the planning and backlog views", async () => {
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ListViewsFixture))));
  await vi.waitFor(async () => { await act(async () => {}); expect(host.querySelectorAll(".external-ref-badge")).toHaveLength(2); });
  expect([...host.querySelectorAll(".external-ref-badge")].map((badge) => badge.textContent)).toEqual(["agent:Card-42", "agent:Card-42"]);
});

it.each(["discovery", "backlog", "notassigned"])("keeps both dependency directions in mounted %s Cards when opposite endpoints are archived or filtered", async (view) => {
  const archived = { ...snapshot.cards[2]!, id: randomUUID(), key: "LSM-5", title: "Archived prerequisite", status: "archived" };
  const dependent = { ...snapshot.cards[2]!, id: randomUUID(), key: "LSM-6", title: "Filtered dependent" };
  const cards = snapshot.cards.map((card) => view !== "notassigned" ? card : card.id === storyId ? { ...card, parentId: null } : card.id === activityId ? { ...card, title: "Retained story Activity" } : card);
  await refreshServer({ ...snapshot, cards: [...cards, archived, dependent], cardDependencies: [
    { id: randomUUID(), cardId: storyId, prerequisiteCardId: archived.id, createdAt: archived.createdAt },
    { id: randomUUID(), cardId: dependent.id, prerequisiteCardId: storyId, createdAt: dependent.createdAt }
  ] });
  if (view === "backlog") await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ListViewsFixture))));
  const input = host.querySelector<HTMLInputElement>('[aria-label="Search cards"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Retained story"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  const board = host.querySelector(view === "notassigned" ? ".discovery-notassigned" : `[data-story-map-export-target="${view}"]`)!;
  const story = board.querySelector(`[data-live-card-id="${storyId}"]`)!;
  const badges = [...story.querySelectorAll(".dependency-badge")];
  expect(badges.map((badge) => badge.textContent)).toEqual(["Depends on (1): LSM-5", "Required by (1): LSM-6"]);
  expect(badges.every((badge) => badge.getAttribute("title") === badge.textContent)).toBe(true);
  expect(board.querySelector(`[data-live-card-id="${archived.id}"]`)).toBeNull();
  expect(story.closest("[hidden]")).toBeNull();
  if (view === "discovery") expectFilteredCard(board, dependent.id);
  else expect(board.querySelector(`[data-live-card-id="${dependent.id}"]`)).toBeNull();
});

it.each(["note", "github"] as const)("finds Cards using only their %s origin evidence", async (kind) => {
  const evidence = kind === "note"
    ? { kind, id: randomUUID(), cardId: storyId, note: "Origin discussion", createdAt: new Date().toISOString() }
    : { kind, id: randomUUID(), cardId: storyId, externalRefId: randomUUID(), repoFullName: "origin/repository", issueNumber: 57, url: "https://github.com/origin/repository/issues/57" };
  await refreshServer({ ...snapshot, sourceLinks: [evidence] });
  const input = host.querySelector<HTMLInputElement>('[aria-label="Search cards"]')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, kind === "note" ? "Origin discussion" : "origin/repository");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const matched = host.querySelector(`button[data-card-id="${storyId}"]`)!;
  expect(matched).not.toBeNull();
  expect(matched.closest("[hidden]")).toBeNull();
  expectFilteredCard(host, neighborId);
});

it("parks with one explicit strategy, prevents duplicate pending requests, and unparks from unfiltered inventory", async () => {
  await click(button("Park"));
  const dialog = document.querySelector('[role="alertdialog"]')!;
  expect(dialog.textContent).toContain("Right neighbor");
  expect(dialog.textContent).not.toContain("left neighbor");
  expect(document.activeElement).toBe(button("Cancel", dialog));
  await click(dialog.querySelector<HTMLInputElement>('input[value="reassign-right"]')!);
  releaseAction = () => {};
  await act(async () => { button("Park", dialog).click(); button("Park", dialog).click(); });
  expect(requests).toHaveLength(1);
  expect(requests[0]?.body).toEqual({ childStrategy: "reassign-right", baseVersion: 1 });
  expect(button("Cancel", dialog).disabled).toBe(true);
  await act(async () => { releaseAction?.(); releaseAction = undefined; });
  await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).toBeNull());
  expect(host.querySelector(`button[data-card-id="${activityId}"]`)).toBeNull();
  expect(host.querySelector(".discovery-notassigned")?.textContent).not.toContain("Container");
  await click(button("Parked"));
  expect(document.querySelector(".lifecycle-inventory")?.textContent).toContain("Container");
  await click(button("Unpark"));
  await click(button("Unpark", document.querySelector('[role="alertdialog"]')!));
  await vi.waitFor(() => expect((document.querySelector(".lifecycle-inventory")?.textContent ?? "")).not.toContain("Container"));
  expect(snapshot.cards.find((item) => item.id === activityId)?.position).toBe(41);
  const inventory = document.querySelector('[role="dialog"]')!;
  expect(inventory.closest('[inert]')).toBeNull();
  expect(inventory.querySelector('[role="status"]')?.textContent).toBe("Unpark: Container.");
  expect(snapshotReads).toBe(3);
});

it("archives a retained subtree, keeps filtered inventory complete, and requires an explicit restore status", async () => {
  await click(button("Archive"));
  await click(button("Archive", document.querySelector('[role="alertdialog"]')!));
  await vi.waitFor(() => expect(host.querySelector(`button[data-card-id="${storyId}"]`)).toBeNull());
  expect(snapshot.cards).toHaveLength(4);
  const input = host.querySelector<HTMLInputElement>('[aria-label="Search cards"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "absent"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  await click(button("Archived"));
  expect(document.querySelector(".lifecycle-inventory")?.textContent).toContain("Container");
  await click(button("Restore"));
  const dialog = document.querySelector('[role="alertdialog"]')!;
  expect(button("Restore", dialog).disabled).toBe(true);
  const select = dialog.querySelector("select")!;
  await act(async () => { select.value = "active"; select.dispatchEvent(new Event("change", { bubbles: true })); });
  await click(button("Restore", dialog));
  await vi.waitFor(() => expect(snapshot.cards.find((item) => item.id === activityId)?.status).toBe("active"));
  expect(requests.at(-1)?.body).toEqual({ archived: false, status: "active", baseVersion: 1 });
  expect(snapshot.cards.find((item) => item.id === storyId)?.parentId).toBe(stepId);
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"] [role="status"]')?.textContent).toBe("Restore: Container."));
});

it("permanent deletion names consequences, cancellation writes nothing and failed confirmation retries", async () => {
  await click(button("Delete permanently"));
  let dialog = document.querySelector('[role="alertdialog"]')!;
  expect(dialog.textContent).toContain('Permanently delete "Container" and its owned links');
  expect(dialog.textContent).toContain("Audit history");
  await click(button("Cancel", dialog));
  expect(requests).toHaveLength(0);
  await click(button("Delete permanently"));
  dialog = document.querySelector('[role="alertdialog"]')!;
  failAction = true;
  await click(button("Delete permanently", dialog));
  await vi.waitFor(() => expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("Request failed: 500"));
  expect(button("Cancel", dialog).disabled).toBe(false);
  expect(snapshot.cards).toHaveLength(4);
  failAction = false;
  await click(button("Delete permanently", dialog));
  await vi.waitFor(() => expect(snapshot.cards).toHaveLength(3));
  expect(host.querySelector('.lifecycle-notice')?.textContent).toContain("Container");
});

it("release confirmation counts hidden and non-Story snapshot Cards even with no filter matches", async () => {
  await refreshServer({ ...snapshot, cards: snapshot.cards.map((item) => item.id === activityId ? { ...item, archived: true, releaseId } : item) });
  const releaseButton = host.querySelector<HTMLButtonElement>('[aria-label="Delete release Delivery"]')!;
  await click(releaseButton);
  expect(document.querySelector('[role="alertdialog"]')?.textContent).toContain("2 card(s) will move to Unscheduled");
  await click(button("Cancel", document.querySelector('[role="alertdialog"]')!));
  expect(requests).toHaveLength(0);
});

it("keeps tied neighbor choices in the repository snapshot order", async () => {
  await refreshServer({ ...snapshot, cards: snapshot.cards.map((card) => card.id === neighborId ? { ...card, position: 10 } : card) });
  await click(button("Park"));
  const dialog = document.querySelector('[role="alertdialog"]')!;
  expect(dialog.querySelector('input[value="reassign-left"]')).toBeNull();
  expect(dialog.querySelector('input[value="reassign-right"]')).not.toBeNull();
  expect(dialog.textContent).toContain('right neighbor "Right neighbor"');
});

it("requires a new explicit strategy when the selected neighbor disappears on snapshot refresh", async () => {
  await click(button("Park"));
  const dialog = document.querySelector('[role="alertdialog"]')!;
  await click(dialog.querySelector<HTMLInputElement>('input[value="reassign-right"]')!);
  await refreshServer({ ...snapshot, cards: snapshot.cards.map((card) => card.id === neighborId ? { ...card, parked: true } : card) });
  expect(dialog.querySelector('input[value="reassign-right"]')).toBeNull();
  expect(button("Park", dialog).disabled).toBe(true);
  expect(dialog.querySelector<HTMLInputElement>('input[value="unassign"]')?.checked).toBe(false);
  await click(button("Park", dialog));
  expect(requests).toHaveLength(0);
  await click(dialog.querySelector<HTMLInputElement>('input[value="unassign"]')!);
  expect(button("Park", dialog).disabled).toBe(false);
  await click(button("Cancel", dialog));
  expect(requests).toHaveLength(0);
});

it("allows confirmation with the unchanged selected strategy after all children and its neighbor disappear", async () => {
  await click(button("Park"));
  const dialog = document.querySelector('[role="alertdialog"]')!;
  await click(dialog.querySelector<HTMLInputElement>('input[value="reassign-right"]')!);
  await refreshServer({ ...snapshot, cards: snapshot.cards.filter((card) => card.id !== neighborId).map((card) => card.id === stepId ? { ...card, parentId: null } : card) });
  expect(dialog.querySelector('input[type="radio"]')).toBeNull();
  expect(dialog.textContent).toContain("This Card has no children to reassign.");
  expect(button("Park", dialog).disabled).toBe(false);
  await click(button("Park", dialog));
  await vi.waitFor(() => expect(document.querySelector('[role="alertdialog"]')).toBeNull());
  expect(requests[0]?.body).toEqual({ childStrategy: "reassign-right", baseVersion: 1 });
  expect(snapshot.cards.find((card) => card.id === stepId)?.parentId).toBeNull();
});

it.each(["parked", "archived"] as const)("exposes permanent deletion from %s inventory while keeping its other action separate", async (kind) => {
  await refreshServer({ ...snapshot, cards: snapshot.cards.map((card) => card.id === activityId ? { ...card, parked: kind === "parked", status: kind === "archived" ? "archived" : "todo" } : card) });
  await click(button(kind === "parked" ? "Parked" : "Archived"));
  const inventory = document.querySelector('[role="dialog"]')!;
  expect(button(kind === "parked" ? "Unpark" : "Restore", inventory)).toBeDefined();
  await click(button("Delete permanently", inventory));
  const dialog = document.querySelector('[role="alertdialog"]')!;
  expect(dialog.textContent).toContain('Permanently delete "Container" and its owned links');
  expect(dialog.textContent).toContain("Unassign all descendants as root Cards");
  await click(button("Cancel", dialog));
  expect(requests).toHaveLength(0);
  expect(document.querySelector('.lifecycle-inventory')?.textContent).toContain("Container");
  await click(button("Delete permanently", inventory));
  await click(button("Delete permanently", document.querySelector('[role="alertdialog"]')!));
  await vi.waitFor(() => expect(inventory.querySelector('[role="status"]')?.textContent).toBe("Delete permanently: Container."));
  expect((inventory.querySelector('.lifecycle-inventory')?.textContent ?? "")).not.toContain("Container");
  expect(snapshot.cards.find((card) => card.id === stepId)?.parentId).toBeNull();
});

it("bulk Archive refetches already observed report and history caches through real invalidation", async () => {
  const prefixes = ["backlog-health", "github-sync-health", "work-item-sync-health", "release-summary", "release-timeline", "roadmap", "roadmaps", "source-documents", "source-document", "source-coverage", "activity", "card-history"];
  const observers = prefixes.map((prefix) => new QueryObserver(client, { queryKey: [prefix, "cached"], queryFn: async () => visibleCards(snapshot.cards).length }));
  const unsubscribe = observers.map((observer) => observer.subscribe(() => {}));
  try {
    await Promise.all(observers.map((observer) => observer.refetch()));
    for (const prefix of prefixes) expect(client.getQueryData([prefix, "cached"])).toBe(4);
    await click(host.querySelector<HTMLInputElement>(".card-checkbox input")!);
    const bulk = host.querySelector(".bulk-action-bar")!;
    await click(button("Archive", bulk));
    await vi.waitFor(() => {
      for (const prefix of prefixes) expect(client.getQueryData([prefix, "cached"]), prefix).toBe(1);
    });
    expect(requests.at(-1)?.path).toBe("/api/cards/bulk");
    expect(snapshotReads).toBe(2);
    expect(host.querySelector(`button[data-card-id="${storyId}"]`)).toBeNull();
  } finally {
    unsubscribe.forEach((stop) => stop());
  }
});

it("opens the matching confirmation from every tile control and writes nothing until confirmed", async () => {
  const control = (label: string) => host.querySelector<HTMLButtonElement>(`[aria-label="${label}"]`)!;
  for (const [label, title, role] of [
    ["Park Container", "Park Container", "alertdialog"],
    ["Delete Container", "Delete 1 Card", "alertdialog"],
    ["Delete Retained step", "Delete 1 Card", "alertdialog"],
    ["Delete Retained story", "Delete 1 Card", "alertdialog"],
    ["Move Retained story to Unscheduled or Not assigned", "Move Card", "dialog"]
  ] as const) {
    await click(control(label));
    const dialog = document.querySelector(`[role="${role}"]`)!;
    expect(dialog.querySelector("h2")?.textContent, label).toBe(title);
    await click(button("Cancel", dialog));
    expect(document.querySelector(`[role="${role}"]`)).toBeNull();
  }
  expect(requests).toHaveLength(0);
});

it("moves through parent, position and Release controls and preserves a failed intent's original baseline", async () => {
  const open = () => click(host.querySelector<HTMLButtonElement>('[aria-label="Move Retained story to Unscheduled or Not assigned"]')!);
  await open();
  const dialog = document.querySelector('[role="dialog"]')!;
  const parent = dialog.querySelector<HTMLSelectElement>('[aria-label="Parent Card"]')!;
  expect([...parent.options].map((option) => option.value)).toEqual(["", stepId]);
  expect(dialog.querySelector<HTMLSelectElement>('[aria-label="Release"]')!.value).toBe(releaseId);
  const choose = async (label: string, value: string) => {
    const select = dialog.querySelector<HTMLSelectElement>(`[aria-label="${label}"]`)!;
    await act(async () => { select.value = value; select.dispatchEvent(new Event("change", { bubbles: true })); });
  };
  await choose("Parent Card", "");
  await choose("Position", "1");
  await choose("Release", "");
  failAction = true;
  failStatus = 409;
  await click(button("Move Card", dialog));
  await vi.waitFor(() => expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("Request failed: 409"));
  await refreshServer({ ...snapshot, cards: snapshot.cards.map((card) => card.id === storyId ? { ...card, version: 2 } : card) });
  failAction = false;
  await click(button("Move Card", dialog));
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  expect(requests.map((request) => [request.path, request.body])).toEqual([
    [`/api/cards/${storyId}/move`, { parentId: null, position: 1, releaseId: null, baseVersion: 1 }],
    [`/api/cards/${storyId}/move`, { parentId: null, position: 1, releaseId: null, baseVersion: 1 }]
  ]);
  expect(host.querySelector('.lifecycle-notice')?.textContent).toContain("Moved LSM-3 to No parent, Unscheduled, position 2.");
});

it("offers the first-Activity action in Story Map help when no visible Activity remains", async () => {
  await refreshServer({ ...snapshot, cards: snapshot.cards.map((item) => item.id === activityId || item.id === neighborId ? { ...item, parked: true } : item) });
  await click(host.querySelector<HTMLButtonElement>('[aria-label="Story Map help"]')!);
  expect(document.querySelector('[role="dialog"]')!.textContent).toContain("Start with an Activity");
  expect(button("Create your first Activity", document.querySelector<HTMLElement>('[role="dialog"]')!).disabled).toBe(false);
});

it("applies bulk category colors as hex values and labels the bulk estimate in the map unit", async () => {
  await refreshServer({ ...snapshot, storyMap: { ...snapshot.storyMap, estimationUnit: "hours" } });
  await click(host.querySelector<HTMLInputElement>(".card-checkbox input")!);
  const bulk = host.querySelector(".bulk-action-bar")!;
  expect(bulk.querySelector('input[placeholder="Estimate (hours)"]')).not.toBeNull();
  const color = bulk.querySelector<HTMLSelectElement>('[aria-label="Color category"]')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(color, "#e5484d"); color.dispatchEvent(new Event("change", { bubbles: true })); });
  await click(button("Apply", bulk));
  await vi.waitFor(() => expect(requests.at(-1)).toMatchObject({ path: "/api/cards/bulk", body: { patch: { color: "#e5484d" } } }));
});

it("shows the map estimation unit on Swimlane, Backlog and Not assigned tiles", async () => {
  await refreshServer({ ...snapshot, storyMap: { ...snapshot.storyMap, estimationUnit: "hours" }, cards: snapshot.cards.map((card) => card.id === storyId ? { ...card, estimate: 3 } : card) });
  const unit = (scope: ParentNode) => scope.querySelector(`[data-live-card-id="${storyId}"]`)!.textContent;
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ListViewsFixture))));
  await vi.waitFor(() => expect(host.querySelectorAll(`[data-live-card-id="${storyId}"]`)).toHaveLength(2));
  for (const tile of host.querySelectorAll(`[data-live-card-id="${storyId}"]`)) expect(tile.textContent).toContain("3 hours");
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Fixture))));
  await refreshServer({ ...snapshot, cards: snapshot.cards.map((card) => card.id === storyId ? { ...card, parentId: null } : card) });
  expect(unit(host.querySelector(".discovery-notassigned")!)).toContain("3 hours");
});

it("sends the drag-start baseline for a Backlog pointer move after the snapshot advances", async () => {
  const secondId = randomUUID();
  const story = snapshot.cards.find((card) => card.id === storyId)!;
  await refreshServer({ ...snapshot, cards: [...snapshot.cards, { ...story, id: secondId, key: "LSM-5", title: "Second story", position: 1 }] });
  class TestPointerEvent extends MouseEvent { readonly pointerId = 1; readonly isPrimary = true; readonly pointerType = "mouse"; }
  vi.stubGlobal("PointerEvent", TestPointerEvent);
  const rects = vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const y = this.closest<HTMLElement>("[data-live-card-id]")?.dataset.liveCardId === secondId ? 300 : 0;
    return { x: 0, y, left: 0, right: 300, top: y, bottom: y + 100, width: 300, height: 100, toJSON() { return {}; } };
  });
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ListViewsFixture))));
  await vi.waitFor(() => expect(host.querySelector(`.backlog-list [data-live-card-id="${secondId}"]`)).not.toBeNull());
  const handle = host.querySelector<HTMLButtonElement>(`.backlog-list [data-live-card-id="${storyId}"] .drag-handle`)!;
  await act(async () => { handle.dispatchEvent(new TestPointerEvent("pointerdown", { bubbles: true, button: 0, buttons: 1, clientX: 50, clientY: 50 })); });
  await refreshServer({ ...snapshot, cards: snapshot.cards.map((card) => card.id === storyId ? { ...card, version: 7 } : card) });
  await act(async () => { document.dispatchEvent(new TestPointerEvent("pointermove", { bubbles: true, buttons: 1, clientX: 50, clientY: 350 })); });
  await act(async () => { document.dispatchEvent(new TestPointerEvent("pointerup", { bubbles: true, button: 0, clientX: 50, clientY: 350 })); });
  await vi.waitFor(() => expect(requests.find((request) => request.path === `/api/cards/${storyId}/move`)?.body).toMatchObject({ baseVersion: 1 }));
  // HINT: dnd-kit keeps document click capture for 50 ms after pointer-up.
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 50)); });
  rects.mockRestore();
});

it("excludes Cards with an empty priority from every priority filter", async () => {
  await refreshServer({ ...snapshot, cards: snapshot.cards.map((card) => card.id === neighborId ? { ...card, priority: "" } : card.id === activityId ? { ...card, priority: "2" } : card) });
  await click(host.querySelector<HTMLButtonElement>("button[aria-pressed]")!);
  const select = [...host.querySelectorAll<HTMLSelectElement>("select")].find((item) => [...item.options].some((option) => option.value === "3"))!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, "value")!.set!.call(select, "3"); select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(host.querySelector(`[data-live-card-id="${activityId}"]`)!.closest("[hidden]")).toBeNull();
  expect(host.querySelector(`[data-live-card-id="${neighborId}"]`)!.closest("[hidden]")).not.toBeNull();
});

it.each(["activity", "step", "story", "note"] as const)("offers a complete legal Move form for %s Cards", async (level) => {
  const targetId = level === "activity" ? activityId : level === "step" ? stepId : level === "story" ? storyId : randomUUID();
  if (level === "note") await refreshServer({ ...snapshot, cards: [...snapshot.cards, { ...snapshot.cards[2]!, id: targetId, key: "LSM-5", level: "note", title: "A note", parentId: stepId }] });
  const primary = host.querySelector<HTMLButtonElement>(`button[data-card-id="${targetId}"]`)!;
  await act(async () => { primary.focus(); primary.dispatchEvent(new KeyboardEvent("keydown", { key: "m", bubbles: true, cancelable: true })); });
  const dialog = document.querySelector('[role="dialog"]')!;
  expect(dialog).not.toBeNull();
  const parent = dialog.querySelector<HTMLSelectElement>('[aria-label="Parent Card"]')!;
  const expected = level === "activity" ? [""] : level === "step" ? ["", activityId, neighborId] : level === "story" ? ["", stepId] : ["", activityId, stepId, neighborId];
  expect([...parent.options].map((option) => option.value)).toEqual(expected);
  await act(async () => { parent.value = ""; parent.dispatchEvent(new Event("change", { bubbles: true })); });
  const release = dialog.querySelector<HTMLSelectElement>('[aria-label="Release"]')!;
  await act(async () => { release.value = releaseId; release.dispatchEvent(new Event("change", { bubbles: true })); });
  await click(button("Move Card", dialog));
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  expect(requests.at(-1)).toEqual({ path: `/api/cards/${targetId}/move`, body: { parentId: null, releaseId, position: 0, baseVersion: 1 } });
});

it.each(["Move", "Delete"] as const)("advances a captured %s baseline only for its own queued acknowledged save", async (command) => {
  const transport = vi.mocked(fetch).getMockImplementation()!;
  let finishSave: () => void = () => { throw new Error("Save has not started."); };
  let saveStarted = false;
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (String(path) === `/api/cards/${storyId}` && init?.method === "PATCH") {
      saveStarted = true;
      await new Promise<void>((resolve) => { finishSave = resolve; });
      const saved = { ...snapshot.cards.find((card) => card.id === storyId)!, priority: "2", version: 2 };
      snapshot = { ...snapshot, cards: snapshot.cards.map((card) => card.id === storyId ? saved : card) };
      return Response.json(saved);
    }
    if (String(path) === "/api/cards/delete-set") {
      const body = JSON.parse(String(init?.body)) as Record<string, unknown>;
      requests.push({ path: String(path), body });
      snapshot = { ...snapshot, cards: snapshot.cards.filter((card) => card.id !== storyId) };
      return Response.json({ ok: true, cardIds: [storyId] });
    }
    return transport(path, init);
  });
  await act(async () => currentBoard.updateCard.mutate({ cardId: storyId, patch: { priority: "2" } }));
  await vi.waitFor(() => expect(saveStarted).toBe(true));
  if (command === "Move") await click(host.querySelector<HTMLButtonElement>('[aria-label="Move Retained story to Unscheduled or Not assigned"]')!);
  else await act(async () => {
    const primary = host.querySelector<HTMLButtonElement>(`button[data-card-id="${storyId}"]`)!;
    primary.focus(); primary.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
  });
  const dialog = document.querySelector('[role="dialog"], [role="alertdialog"]')!;
  await click(button(command === "Move" ? "Move Card" : "Delete permanently", dialog));
  expect(requests).toHaveLength(0);
  await act(async () => finishSave());
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  if (command === "Move") expect(requests[0]!.body.baseVersion).toBe(2);
  else {
    expect(requests[0]!.body.cards).toEqual([{ id: storyId, baseVersion: 2 }]);
    expect(requests[0]!.body.affectedCards).toContainEqual({ id: storyId, baseVersion: 2 });
  }
});

it("captures only external evidence owners using existing Project-scoped map reads", async () => {
  const identity = randomUUID();
  const externalMapId = randomUUID();
  const owner = { ...snapshot.cards[2]!, id: randomUUID(), storyMapId: externalMapId, key: "OTHER-1", title: "Shared evidence", version: 8 };
  const unrelated = { ...owner, id: randomUUID(), key: "OTHER-2", title: "Unrelated" };
  const opening = { ...snapshot, githubLinks: [{ id: identity, cardId: storyId, repo: "example/project", url: "https://github.com/example/project/issues/42", syncState: "synced" as const }] };
  const external = { ...snapshot, storyMap: { ...snapshot.storyMap, id: externalMapId }, cards: [owner, unrelated], sourceLinks: [{ kind: "github" as const, id: randomUUID(), cardId: owner.id, externalRefId: identity, repoFullName: "example/project", issueNumber: 42, url: "https://github.com/example/project/issues/42" }] };
  const reads: string[] = [];
  const transport = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    reads.push(String(path));
    if (String(path) === `/api/story-maps?projectId=${snapshot.storyMap.projectId}`) return Response.json({ storyMaps: [snapshot.storyMap, external.storyMap] });
    if (String(path) === `/api/story-maps/${externalMapId}`) return Response.json(external);
    return transport(path, init);
  });
  expect(await api.captureDeleteAffectedCards(opening, [storyId])).toEqual([owner]);
  expect(reads).toEqual([`/api/story-maps?projectId=${snapshot.storyMap.projectId}`, `/api/story-maps/${externalMapId}`]);
  reads.length = 0;
  expect(await api.captureDeleteAffectedCards(opening, [activityId])).toEqual([]);
  expect(reads).toEqual([]);
});

it("shows the server's typed hierarchy refusal in the Move form", async () => {
  const transport = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (path, init) => String(path).endsWith("/move") ? Response.json({ code: "validation", message: "story cannot be nested below activity." }, { status: 400 }) : transport(path, init));
  await click(host.querySelector<HTMLButtonElement>('[aria-label="Move Retained story to Unscheduled or Not assigned"]')!);
  const dialog = document.querySelector('[role="dialog"]')!;
  await click(button("Move Card", dialog));
  await vi.waitFor(() => expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("story cannot be nested below activity."));
});

it("bounds position options and preserves an unavailable captured position until explicitly changed", async () => {
  await refreshServer({ ...snapshot, cards: snapshot.cards.map((card) => card.id === storyId ? { ...card, position: 1_000_000_000 } : card) });
  await click(host.querySelector<HTMLButtonElement>('[aria-label="Move Retained story to Unscheduled or Not assigned"]')!);
  const dialog = document.querySelector('[role="dialog"]')!;
  const position = dialog.querySelector<HTMLSelectElement>('[aria-label="Position"]')!;
  expect(position.options).toHaveLength(2);
  expect(position.value).toBe("1000000000"); expect(position.selectedOptions[0]!.disabled).toBe(true);
  expect(button("Move Card", dialog).disabled).toBe(true);
  await act(async () => { position.value = "0"; position.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(button("Move Card", dialog).disabled).toBe(false);
});

it("guards Cancel and Escape in the same tick that Move submission becomes busy", async () => {
  releaseAction = () => {};
  await click(host.querySelector<HTMLButtonElement>('[aria-label="Move Retained story to Unscheduled or Not assigned"]')!);
  const dialog = document.querySelector('[role="dialog"]')!;
  await act(async () => {
    dialog.querySelector('form')!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    button("Cancel", dialog).click();
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
  });
  expect(document.querySelector('[role="dialog"]')).toBe(dialog);
  await vi.waitFor(() => expect(requests).toHaveLength(1));
  const finish = releaseAction!; releaseAction = undefined;
  await act(async () => finish());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
});

it("restores the moved primary after a form opened from its still-mounted secondary action", async () => {
  const opener = host.querySelector<HTMLButtonElement>('[aria-label="Move Retained story to Unscheduled or Not assigned"]')!;
  await click(opener);
  await click(button("Move Card", document.querySelector('[role="dialog"]')!));
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  await act(async () => { await new Promise(requestAnimationFrame); });
  expect(document.activeElement).toBe(host.querySelector(`button[data-card-id="${storyId}"]`));
  expect(opener.isConnected).toBe(true);
});

it("keeps destination labels captured before sending when a delayed move response arrives after their removal", async () => {
  const transport = vi.mocked(fetch).getMockImplementation()!;
  const saved = { ...snapshot.cards.find((card) => card.id === storyId)!, version: 2 };
  let complete: () => void = () => {};
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (String(path).endsWith("/move")) { await new Promise<void>((resolve) => { complete = resolve; }); return Response.json(saved); }
    return transport(path, init);
  });
  await click(host.querySelector<HTMLButtonElement>('[aria-label="Move Retained story to Unscheduled or Not assigned"]')!);
  await click(button("Move Card", document.querySelector('[role="dialog"]')!));
  await refreshServer({ ...snapshot, releases: [], cards: snapshot.cards.filter((card) => card.id !== stepId).map((card) => card.id === storyId ? { ...card, parentId: null, releaseId: null } : card) });
  await act(async () => complete());
  await vi.waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
  expect(host.querySelector('.lifecycle-notice')?.textContent).toBe("Moved LSM-3 to Retained step, Delivery, position 1.");
});

it("lists every typed Delete conflict and retains the complete frozen retry intent", async () => {
  const transport = vi.mocked(fetch).getMockImplementation()!;
  const commands: unknown[] = [];
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (String(path) === "/api/cards/delete-set") {
      commands.push(JSON.parse(String(init?.body)));
      return Response.json({ code: "conflict", message: "Two Cards changed.", conflicts: [storyId, stepId].map((id, index) => ({ entity: "card", id, baseVersion: 1, currentVersion: index + 2, current: { id } })) }, { status: 409 });
    }
    return transport(path, init);
  });
  await act(async () => currentBoard.setBulkSelectedIds(new Set([storyId, stepId])));
  await act(async () => host.querySelector<HTMLButtonElement>(`button[data-card-id="${storyId}"]`)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true })));
  const dialog = document.querySelector('[role="alertdialog"]')!;
  await click(button("Delete permanently", dialog));
  await vi.waitFor(() => expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("LSM-3 Retained story: captured version 1, current version 2."));
  expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("LSM-2 Retained step: captured version 1, current version 3.");
  await click(button("Delete permanently", dialog));
  expect(commands).toHaveLength(2); expect(commands[1]).toEqual(commands[0]);
});

it("offers only legal neighbor strategies in the Delete dialog and sends the chosen one", async () => {
  const transport = vi.mocked(fetch).getMockImplementation()!;
  const commands: Array<{ strategy: string }> = [];
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (String(path) === "/api/cards/delete-set") {
      commands.push(JSON.parse(String(init?.body)));
      return Response.json({ ok: true, cardIds: [activityId] });
    }
    return transport(path, init);
  });
  const remove = async () => host.querySelector<HTMLButtonElement>(`button[data-card-id="${activityId}"]`)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true }));
  const radios = () => [...document.querySelectorAll<HTMLInputElement>('[role="alertdialog"] input[type="radio"]')].map((radio) => radio.parentElement!.textContent!);
  await act(remove);
  await vi.waitFor(() => expect(radios()).toHaveLength(2));
  expect(radios().join()).toContain('right neighbor "Right neighbor"');
  expect(radios().join()).not.toContain("left neighbor");
  const right = [...document.querySelectorAll<HTMLInputElement>('[role="alertdialog"] input[type="radio"]')].find((radio) => radio.parentElement!.textContent!.includes("right neighbor"))!;
  await click(right);
  await click(button("Delete permanently", document.querySelector('[role="alertdialog"]')!));
  await vi.waitFor(() => expect(commands).toHaveLength(1));
  expect(commands[0]!.strategy).toBe("reassign-right");
});

it("hides a reassign strategy whose neighbor is itself selected", async () => {
  await act(async () => currentBoard.setBulkSelectedIds(new Set([activityId, neighborId])));
  await act(async () => host.querySelector<HTMLButtonElement>(`button[data-card-id="${activityId}"]`)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true })));
  expect([...document.querySelectorAll('[role="alertdialog"] input[type="radio"]')]).toHaveLength(1);
});

it("clears the previous result before a second equal-count Delete succeeds", async () => {
  const transport = vi.mocked(fetch).getMockImplementation()!;
  let complete: () => void = () => {};
  let count = 0;
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (String(path) === "/api/cards/delete-set") {
      const { cards } = JSON.parse(String(init?.body)) as { cards: Array<{ id: string }> };
      if (++count === 2) await new Promise<void>((resolve) => { complete = resolve; });
      snapshot = { ...snapshot, cards: snapshot.cards.filter((card) => !cards.some((target) => target.id === card.id)) };
      return Response.json({ ok: true, cardIds: cards.map((card) => card.id) });
    }
    return transport(path, init);
  });
  const remove = async (id: string) => {
    await act(async () => host.querySelector<HTMLButtonElement>(`button[data-card-id="${id}"]`)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true })));
    await click(button("Delete permanently", document.querySelector('[role="alertdialog"]')!));
  };
  await remove(storyId);
  await vi.waitFor(() => expect(host.querySelector('.lifecycle-notice')?.textContent).toBe("Deleted 1 Card"));
  await remove(neighborId);
  expect(host.querySelector('.lifecycle-notice')?.textContent).toBe("");
  await act(async () => complete());
  await vi.waitFor(() => expect(host.querySelector('.lifecycle-notice')?.textContent).toBe("Deleted 1 Card"));
});

it("retains typed version conflicts when the Move API refuses a stale baseline", async () => {
  const transport = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (path, init) => String(path).endsWith("/move") ? Response.json({ code: "conflict", message: "Card changed.", conflicts: [{ entity: "card", id: storyId, baseVersion: 1, currentVersion: 2, current: { id: storyId } }] }, { status: 409 }) : transport(path, init));
  await expect(api.moveCard(storyId, { parentId: stepId, position: 0 }, 1)).rejects.toBeInstanceOf(ConflictError);
});

it("uses complete hidden retained selection for toolbar and tile Delete with explicit child choice", async () => {
  const transport = vi.mocked(fetch).getMockImplementation()!;
  const commands: Array<{ cards: Array<{ id: string }>; strategy: string }> = [];
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (String(path) === "/api/cards/delete-set") {
      commands.push(JSON.parse(String(init?.body)));
      return Response.json({ message: "Keep intent" }, { status: 409 });
    }
    return transport(path, init);
  });
  await act(async () => { currentBoard.setBulkSelectedIds(new Set([activityId, storyId])); currentBoard.setFilters((filters) => ({ ...filters, search: "Retained story" })); });
  expect(host.textContent).toContain("2 selected: 2 visible, 0 hidden");
  await act(async () => currentBoard.setFilters((filters) => ({ ...filters, search: "Right neighbor" })));
  expect(host.textContent).toContain("2 selected: 0 visible, 2 hidden");
  await click(button("Delete selected Cards"));
  let dialog = document.querySelector('[role="alertdialog"]')!;
  expect(dialog.textContent).toContain("Container"); expect(dialog.textContent).toContain("Retained story");
  expect(button("Delete permanently", dialog).disabled).toBe(true);
  await click(button("Cancel", dialog)); expect(commands).toHaveLength(0);
  await act(async () => currentBoard.clearFilters());
  await act(async () => host.querySelector<HTMLButtonElement>(`button[data-card-id="${activityId}"]`)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true })));
  dialog = document.querySelector('[role="alertdialog"]')!;
  await vi.waitFor(() => expect(dialog.textContent).not.toContain("Checking related"));
  await click(dialog.querySelector<HTMLInputElement>('input[value="unassign"]') ?? [...dialog.querySelectorAll<HTMLInputElement>('input[type="radio"]')].at(-1)!);
  await click(button("Delete permanently", dialog));
  expect(commands).toHaveLength(1);
  expect(commands[0]!.cards.map((card) => card.id)).toEqual([activityId, storyId]);
});

it("tile Delete on a visible selected Card targets the hidden retained selection too", async () => {
  const transport = vi.mocked(fetch).getMockImplementation()!;
  const commands: Array<{ cards: Array<{ id: string }> }> = [];
  vi.mocked(fetch).mockImplementation(async (path, init) => {
    if (String(path) === "/api/cards/delete-set") {
      commands.push(JSON.parse(String(init?.body)));
      return Response.json({ message: "Keep intent" }, { status: 409 });
    }
    return transport(path, init);
  });
  await act(async () => { currentBoard.setBulkSelectedIds(new Set([storyId, neighborId])); currentBoard.setFilters((filters) => ({ ...filters, search: "Retained story" })); });
  expect(host.textContent).toContain("2 selected: 1 visible, 1 hidden");
  await act(async () => host.querySelector<HTMLButtonElement>(`button[data-card-id="${storyId}"]`)!.dispatchEvent(new KeyboardEvent("keydown", { key: "Delete", bubbles: true, cancelable: true })));
  const dialog = document.querySelector('[role="alertdialog"]')!;
  expect(dialog.textContent).toContain("Right neighbor");
  await vi.waitFor(() => expect(button("Delete permanently", dialog).disabled).toBe(false));
  await click(button("Delete permanently", dialog));
  expect(commands[0]!.cards.map((card) => card.id).sort()).toEqual([storyId, neighborId].sort());
});

it.each(["archive", "remove"])("refuses an open selected Delete after a same-map target becomes unavailable by %s", async (mode) => {
  await act(async () => currentBoard.setBulkSelectedIds(new Set([storyId])));
  await click(button("Delete selected Cards"));
  const dialog = document.querySelector('[role="alertdialog"]')!;
  await vi.waitFor(() => expect(button("Delete permanently", dialog).disabled).toBe(false));
  const cards = mode === "remove" ? snapshot.cards.filter((card) => card.id !== storyId) : snapshot.cards.map((card) => card.id === storyId ? { ...card, status: "archived" } : card);
  await refreshServer({ ...snapshot, cards });
  expect(dialog.querySelector('[role="alert"]')?.textContent).toContain("no longer available");
  expect(button("Delete permanently", dialog).disabled).toBe(true);
  await click(button("Delete permanently", dialog));
  expect(requests.some((request) => request.path === "/api/cards/delete-set")).toBe(false);
});
