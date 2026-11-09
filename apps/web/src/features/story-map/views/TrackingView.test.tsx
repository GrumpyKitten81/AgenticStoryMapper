import { useStoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";
// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act, createContext, createElement, useContext } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { releaseSchema, storyMapSnapshotSchema, type StoryMapSnapshot } from "@storymapper/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useStoryMap } from "@storymapper/web/app/api";
import { useLiveUpdates } from "@storymapper/web/app/live/useLiveUpdates";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import type { LiveMessage } from "@storymapper/web/app/live/live-stream-reader";
import { TrackingView } from "@storymapper/web/features/story-map/views/TrackingView";

const fixture = vi.hoisted(() => ({ mapId: "94f161b6-6e68-44db-9de8-2a509c841bea", navigate: vi.fn(), receive: undefined as ((message: LiveMessage) => void) | undefined }));
vi.mock("@storymapper/web/app/routes/story-map-shell", () => ({ useStoryMapBoardStateContext: () => useStoryMapBoardState(useContext(SnapshotContext)!), usePreviewBoard: () => undefined, useStoryMapSnapshot: () => useContext(SnapshotContext)! }));
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => fixture.navigate, useSearch: () => ({}) }));
vi.mock("@storymapper/web/app/live/live-stream", () => ({ startLiveStream: (callbacks: { receive: (message: LiveMessage) => void; state: (state: string) => void }) => {
  fixture.receive = callbacks.receive;
  callbacks.state("connected");
  return () => { fixture.receive = undefined; };
} }));

const projectId = randomUUID(), cardId = randomUUID(), epoch = randomUUID();
const now = "2026-10-12T00:00:00.000Z";
const SnapshotContext = createContext<StoryMapSnapshot | null>(null);
let snapshot: StoryMapSnapshot;
let client: QueryClient;
let root: Root;
let host: HTMLDivElement;
let requests: { path: string; body?: unknown }[];

function Probe() {
  useLiveUpdates(projectId);
  const map = useStoryMap(fixture.mapId);
  return map.data ? createElement(SnapshotContext.Provider, { value: map.data }, createElement(TrackingView)) : null;
}

function receive(seq: number, entityType: "workflowStatus" | "card") {
  fixture.receive!({ kind: "transaction", value: { epoch, seq, id: `${epoch}:${seq}`, originClientId: null,
    actor: { actorType: "agent", actorId: "delivery-agent" },
    entities: [{ entityType, entityId: entityType === "card" ? cardId : snapshot.workflowStatuses[0]!.id, projectId, version: seq + 1 }] } });
}

async function advance(time = 100) {
  await act(async () => { await vi.advanceTimersByTimeAsync(time); });
}

beforeEach(async () => {
  localStorage.clear();
  fixture.navigate.mockReset();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler(queueMicrotask);
  useLiveInteractionStore.setState({ reviewRevision: 0, manualHold: false, dragging: false, waiting: 0, pendingChanges: {} });
  snapshot = storyMapSnapshotSchema.parse({
    storyMap: { id: fixture.mapId, projectId, name: "Delivery tracking", version: 1, createdAt: now, updatedAt: now },
    cards: [{ id: cardId, storyMapId: fixture.mapId, parentId: null, releaseId: null, key: "MAP-1", level: "story", title: "Delivery story", status: "Ready for review", version: 1, position: 0, creationOrigin: "manual", provenance: "manual", createdAt: now, updatedAt: now }],
    releases: [], sourceLinks: [], cardDependencies: [], githubLinks: [], workflowStatuses: [
      { id: randomUUID(), projectId, storyMapId: fixture.mapId, name: "Released", group: "done", position: 2 },
      { id: randomUUID(), projectId, storyMapId: null, name: "Queued", group: "todo", position: 0 },
      { id: randomUUID(), projectId, storyMapId: fixture.mapId, name: "Ready for review", group: "active", position: 1 },
      { id: randomUUID(), projectId, storyMapId: null, name: "Ready for review", group: "active", position: 4 }
    ], personas: [], cardPersonas: [], annotations: [], cardAnnotations: [], storyTemplates: []
  });
  requests = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    requests.push({ path, body: init?.body ? JSON.parse(String(init.body)) : undefined });
    if (path === `/api/story-maps/${fixture.mapId}`) return Response.json(snapshot);
    if (path === `/api/cards/${cardId}` && init?.method === "PATCH") {
      const body = JSON.parse(String(init.body)) as { status: string; baseVersion: number };
      snapshot = { ...snapshot, cards: [{ ...snapshot.cards[0]!, status: body.status, version: body.baseVersion + 1 }] };
      return Response.json(snapshot.cards[0]);
    }
    throw new Error(`Unexpected request: ${path}`);
  }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Probe))));
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

it("renders ordered configured names, group icons and matching human status options", () => {
  const columns = [...host.querySelectorAll(".release-kanban-column")];
  expect(columns.map((column) => column.querySelector(".release-kanban-heading strong")!.textContent)).toEqual(["Queued", "Ready for review", "Released"]);
  expect(columns.map((column) => column.querySelector("svg")!.getAttribute("class"))).toEqual([expect.stringContaining("lucide-circle"), expect.stringContaining("lucide-circle-dot"), expect.stringContaining("lucide-circle-check")]);
  expect(columns.map((column) => column.querySelectorAll("article").length)).toEqual([0, 1, 0]);
  const statusSelect = host.querySelector<HTMLSelectElement>(".release-card-actions select")!;
  expect([...statusSelect.options].map((option) => [option.value, option.text])).toEqual([ ["Queued", "Queued"], ["Ready for review", "Ready for review"], ["Released", "Released"] ]);
});

it("renders both dependency directions from canonical Cards beyond the selected Release and archived inventory", async () => {
  const prerequisite = { ...snapshot.cards[0]!, id: randomUUID(), key: "MAP-2", title: "Archived prerequisite", status: "archived" };
  const dependent = { ...snapshot.cards[0]!, id: randomUUID(), key: "MAP-3", title: "Other Release dependent" };
  const release = releaseSchema.parse({ id: randomUUID(), storyMapId: fixture.mapId, version: 1, name: "Selected Release", startDate: null, releaseDate: null, position: 0 });
  snapshot = { ...snapshot, releases: [release], cards: [{ ...snapshot.cards[0]!, releaseId: release.id }, prerequisite, dependent],
    cardDependencies: [
      { id: randomUUID(), cardId, prerequisiteCardId: prerequisite.id, createdAt: now },
      { id: randomUUID(), cardId: dependent.id, prerequisiteCardId: cardId, createdAt: now }
    ] };
  await act(async () => receive(1, "card"));
  await advance();
  const scope = host.querySelector<HTMLSelectElement>(".release-kanban-scope select")!;
  await act(async () => { scope.value = release.id; scope.dispatchEvent(new Event("change", { bubbles: true })); });
  const card = host.querySelector(`[data-live-card-id="${cardId}"]`)!;
  const badges = [...card.querySelectorAll(".dependency-badge")];
  expect(badges.map((badge) => badge.textContent)).toEqual(["Depends on (1): MAP-2", "Required by (1): MAP-3"]);
  expect(badges.every((badge) => badge.getAttribute("title") === badge.textContent)).toBe(true);
  expect(host.querySelectorAll("article")).toHaveLength(1);
  expect(host.querySelector(`[data-live-card-id="${prerequisite.id}"]`)).toBeNull();
  expect(host.querySelector(`[data-live-card-id="${dependent.id}"]`)).toBeNull();
  await act(async () => { scope.value = "all"; scope.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(host.querySelectorAll("article")).toHaveLength(2);
  expect(host.querySelector(`[data-live-card-id="${prerequisite.id}"]`)).toBeNull();
  expect(host.querySelector(`[data-live-card-id="${dependent.id}"]`)!.textContent).toContain("Depends on (1): MAP-1");
});

it("refreshes method states and incoming delivery status through live transactions, then edits with the new version", async () => {
  snapshot = { ...snapshot, workflowStatuses: [...snapshot.workflowStatuses, { id: randomUUID(), projectId, storyMapId: fixture.mapId, name: "Acceptance", group: "active", position: 3 }] };
  await act(async () => receive(1, "workflowStatus"));
  await advance();
  expect(host.querySelectorAll(".release-kanban-column")).toHaveLength(4);
  expect(host.textContent).toContain("Acceptance");
  snapshot = { ...snapshot, cards: [{ ...snapshot.cards[0]!, status: "Acceptance", version: 7 }] };
  await act(async () => receive(2, "card"));
  await advance();
  const column = [...host.querySelectorAll(".release-kanban-column")].find((item) => item.querySelector("strong")!.textContent === "Acceptance")!;
  expect(column.querySelector("article")!.textContent).toContain("Delivery story");
  expect(requests.filter(({ path }) => path === `/api/story-maps/${fixture.mapId}`)).toHaveLength(3);
  expect(localStorage.getItem(`storymapper-live-applied-cursor:${projectId}`)).toBe(`${epoch}:2`);
  const statusSelect = column.querySelector<HTMLSelectElement>(".release-card-actions select")!;
  await act(async () => { statusSelect.value = "Released"; statusSelect.dispatchEvent(new Event("change", { bubbles: true })); });
  await advance();
  expect(requests.find(({ body }) => body !== undefined)).toEqual({ path: `/api/cards/${cardId}`, body: { status: "Released", baseVersion: 7 } });
  const released = [...host.querySelectorAll(".release-kanban-column")].find((item) => item.querySelector("strong")!.textContent === "Released")!;
  expect(released.querySelector("article")!.textContent).toContain("Delivery story");
});

it.each(["rename", "remove"])("retains unconfigured Cards and their controls after a live status %s", async (change) => {
  snapshot = { ...snapshot, workflowStatuses: change === "rename"
    ? snapshot.workflowStatuses.map((status) => status.name === "Ready for review" ? { ...status, name: "Review renamed" } : status)
    : snapshot.workflowStatuses.filter((status) => status.name !== "Ready for review") };
  await act(async () => receive(1, "workflowStatus"));
  await advance();
  const column = [...host.querySelectorAll(".release-kanban-column")].find((item) => item.querySelector("strong")!.textContent === "Ready for review")!;
  expect(column.textContent).not.toContain("Unconfigured status");
  expect(column.querySelector("article")!.textContent).toContain("Delivery story");
  const statusSelect = column.querySelector<HTMLSelectElement>(".release-card-actions select")!;
  expect(statusSelect.value).toBe("Ready for review");
  expect(statusSelect.selectedOptions[0]!.disabled).toBe(false);
  expect([...statusSelect.options].filter((option) => !option.disabled).map((option) => option.value)).toEqual(change === "rename" ? ["Ready for review", "Queued", "Review renamed", "Released"] : ["Ready for review", "Queued", "Released"]);
  await act(async () => column.querySelector<HTMLButtonElement>("button")!.click());
  expect(fixture.navigate).toHaveBeenCalledWith({ search: { card: cardId } });
  expect(column.querySelectorAll("select")).toHaveLength(2);
  await act(async () => { statusSelect.value = "Released"; statusSelect.dispatchEvent(new Event("change", { bubbles: true })); });
  await advance();
  expect(requests.find(({ body }) => body !== undefined)).toEqual({ path: `/api/cards/${cardId}`, body: { status: "Released", baseVersion: 1 } });
  expect([...host.querySelectorAll(".release-kanban-heading strong")].map((item) => item.textContent)).not.toContain("Ready for review");
  expect(host.querySelectorAll("article")).toHaveLength(1);
});

it("updates order and group icons live while preserving more than four sequential states", async () => {
  snapshot = { ...snapshot, workflowStatuses: [
    ...snapshot.workflowStatuses.map((status) => status.name === "Queued" ? { ...status, position: 8, group: "done" as const } : status),
    ...["Build", "Test", "Acceptance"].map((name, index) => ({ id: randomUUID(), projectId, storyMapId: fixture.mapId, name, group: "active" as const, position: index + 5 }))
  ] };
  await act(async () => receive(1, "workflowStatus"));
  await advance();
  const columns = [...host.querySelectorAll(".release-kanban-column")];
  expect(columns.map((column) => column.querySelector("strong")!.textContent)).toEqual(["Ready for review", "Released", "Build", "Test", "Acceptance", "Queued"]);
  expect(columns.at(-1)!.querySelector("svg")!.getAttribute("class")).toContain("lucide-circle-check");
  expect(host.querySelectorAll("article")).toHaveLength(1);
});

it("holds incoming delivery changes until explicit release, then refreshes Kanban and summary together", async () => {
  await act(async () => useLiveInteractionStore.getState().setManualHold(true));
  snapshot = { ...snapshot, cards: [{ ...snapshot.cards[0]!, status: "Released", estimate: 8, version: 2 }] };
  await act(async () => receive(1, "card"));
  await advance();
  const column = (name: string) => [...host.querySelectorAll('.release-kanban-column')].find((element) => element.querySelector('strong')!.textContent === name)!;
  expect(column("Ready for review").querySelectorAll('article')).toHaveLength(1);
  expect(host.querySelector('.release-summary-grid')!.textContent).not.toContain("8 points");
  expect(useLiveInteractionStore.getState().waiting).toBe(1);
  await act(async () => useLiveInteractionStore.getState().setManualHold(false));
  await advance();
  expect(column("Released").querySelectorAll('article')).toHaveLength(1);
  expect(host.querySelector('.release-summary-grid')!.textContent).toContain("8 points");
});
