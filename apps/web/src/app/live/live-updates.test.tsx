// @vitest-environment jsdom // REQ Story3.10 metadata updates preserve interaction and scope
import { randomUUID } from "node:crypto";
import { act, createElement, Fragment } from "react";
import { createRoot, type Root } from "react-dom/client";
import { focusManager, onlineManager, notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { storyMapSnapshotSchema, type LiveTransaction } from "@storymapper/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useAiFunctionTemplates, useStoryMap } from "@storymapper/web/app/api";
import { useLiveUpdates } from "@storymapper/web/app/live/useLiveUpdates";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { getLiveClientId } from "@storymapper/web/app/live/live-client-id";
import { useAnnouncementStore } from "@storymapper/web/app/stores/announcement-store";
import type { LiveMessage } from "@storymapper/web/app/live/live-stream-reader";
import { SafetySwitchStrip } from "@storymapper/web/features/safety/SafetySwitchStrip";
import { appStrings } from "@storymapper/ui-strings";
import { useStoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";
import { TreeGrid } from "@storymapper/web/features/story-map/components/TreeGrid";
import { ReleasePanel } from "@storymapper/web/features/releases/ReleasePanel";
import { ReleaseDateFields } from "@storymapper/web/features/releases/ReleaseDateFields";
import { ReleaseTimelineChart } from "@storymapper/web/features/releases/ReleaseTimelineChart";

const transport = vi.hoisted(() => ({ receive: undefined as ((message: LiveMessage) => void) | undefined }));
vi.mock("@storymapper/web/app/live/live-stream", () => ({
  startLiveStream: (callbacks: { receive: (message: LiveMessage) => void; state: (value: string) => void }) => {
    transport.receive = callbacks.receive;
    callbacks.state("connected");
    return () => { transport.receive = undefined; };
  }
}));

const projectId = randomUUID();
const mapId = randomUUID();
const otherProjectId = randomUUID();
const otherMapId = randomUUID();
const cardId = randomUUID();
const epoch = randomUUID();
let title: string;
let templateName: string;
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
let reads: Map<string, number>;

function snapshot(id: string, project: string) {
  const now = "2026-10-09T10:00:00.000Z";
  return storyMapSnapshotSchema.parse({
    storyMap: { id, projectId: project, name: "Live update fixture", version: 1, createdAt: now, updatedAt: now },
    cards: [{ creationOrigin: "manual", provenance: "manual", id: cardId, storyMapId: id, parentId: null, releaseId: null, position: 0, key: "LSM-1", level: "activity", title, version: 1, createdAt: now, updatedAt: now }],
    releases: [], sourceLinks: [], cardDependencies: [], githubLinks: [], remoteWorkItemLinks: [], workflowStatuses: [], personas: [], cardPersonas: [], annotations: [], cardAnnotations: [], storyTemplates: []
  });
}

function transaction(seq: number, count = 1, originClientId: string | null = null): LiveTransaction {
  return { id: `${epoch}:${seq}`, epoch, seq, actor: { actorType: "agent", actorId: "Claude Code" }, originClientId,
    entities: Array.from({ length: count }, (_, index) => ({ entityType: "card", entityId: index === 0 ? cardId : randomUUID(), projectId, version: seq })) };
}

function Probe() {
  const live = useLiveUpdates(projectId);
  const map = useStoryMap(mapId);
  const templates = useAiFunctionTemplates(projectId);
  useStoryMap(otherMapId);
  return createElement("div", { "data-live-failed": String(live.failed) }, createElement("button", { "data-live-card-id": cardId }, map.data?.cards[0]?.title), createElement("input", { "aria-label": "Text field" }), createElement("span", null, templates.data?.templates[0]?.name));
}

async function advance(time: number) {
  await act(async () => { await vi.advanceTimersByTimeAsync(time); });
}

beforeEach(async () => {
  localStorage.clear();
  vi.useFakeTimers();
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler(queueMicrotask);
  useLiveInteractionStore.setState({ epoch: undefined, restoreRevision: 0, restorePending: false, reviewRevision: 0, manualHold: false, dragging: false, waiting: 0, pendingChanges: {} });
  useAnnouncementStore.setState({ status: "", alert: "", revision: 0 });
  title = "Original title";
  templateName = "Original template";
  reads = new Map();
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    reads.set(path, (reads.get(path) ?? 0) + 1);
    if (path === `/api/ai/templates?projectId=${projectId}`) return Response.json({ templates: [{ name: templateName }] });
    if (path === `/api/story-maps/${mapId}`) return Response.json(snapshot(mapId, projectId));
    if (path === `/api/story-maps/${otherMapId}`) return Response.json(snapshot(otherMapId, otherProjectId));
    throw new Error(`Unexpected request: ${path}`);
  }));
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => { root.render(createElement(QueryClientProvider, { client }, createElement(Probe))); });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  document.querySelectorAll("[data-test-interaction]").forEach((element) => element.remove());
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it("coalesces30 operations into one Project-scoped GET and one truthful status without own echoes", async () => {
  title = "Agent title";
  await act(async () => transport.receive!({ kind: "transaction", value: transaction(1, 30) }));
  await advance(99);
  expect(reads.get(`/api/story-maps/${mapId}`)).toBe(1);
  await advance(1);
  expect(host.textContent).toContain("Agent title");
  expect(reads.get(`/api/story-maps/${mapId}`)).toBe(2);
  expect(reads.get(`/api/story-maps/${otherMapId}`)).toBe(1);
  await advance(1500);
  expect(useAnnouncementStore.getState().status).toBe("30 cards changed by Claude Code.");
  const revision = useAnnouncementStore.getState().revision;
  await act(async () => transport.receive!({ kind: "transaction", value: transaction(2, 1, getLiveClientId()) }));
  await advance(6000);
  expect(useAnnouncementStore.getState().revision).toBe(revision);
  expect(reads.get(`/api/story-maps/${mapId}`)).toBe(2);
});

it("updates both dependency badges after remote dependent-root set and unset without reopening the board", async () => {
  const originalFetch = fetch;
  let current = snapshot(mapId, projectId);
  const prerequisiteId = randomUUID();
  current.cards.push({ ...current.cards[0]!, id: prerequisiteId, key: "LSM-2", title: "Prerequisite", position: 1 });
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path !== `/api/story-maps/${mapId}`) return originalFetch(path, init);
    reads.set(path, (reads.get(path) ?? 0) + 1);
    return Promise.resolve(Response.json(current));
  }));
  function Board() {
    useLiveUpdates(projectId);
    const map = useStoryMap(mapId);
    const state = useStoryMapBoardState(map.data!, projectId);
    return createElement(TreeGrid, { state, onSelectCard: vi.fn() });
  }
  client.setQueryData(["story-map", mapId], current);
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Board))));
  const dependent = host.querySelector(`[data-live-card-id="${cardId}"]`)!;
  const prerequisite = host.querySelector(`[data-live-card-id="${prerequisiteId}"]`)!;
  const initialReads = reads.get(`/api/story-maps/${mapId}`)!;
  expect(host.querySelectorAll(".dependency-badge")).toHaveLength(0);
  current = { ...current, cards: current.cards.map((card) => card.id === cardId ? { ...card, version: 2 } : card),
    cardDependencies: [{ id: randomUUID(), cardId, prerequisiteCardId: prerequisiteId, createdAt: current.cards[0]!.createdAt }] };
  const added = transaction(1);
  added.entities = [{ entityType: "card", entityId: cardId, projectId, version: 2 }];
  await act(async () => transport.receive!({ kind: "transaction", value: added }));
  await advance(100);
  expect(dependent.textContent).toContain("Depends on (1): LSM-2");
  expect(prerequisite.textContent).toContain("Required by (1): LSM-1");
  expect(reads.get(`/api/story-maps/${mapId}`)).toBe(initialReads + 1);
  expect(client.getQueryData<typeof current>(["story-map", mapId])!.cards.find((card) => card.id === prerequisiteId)!.version).toBe(1);
  current = { ...current, cardDependencies: [], cards: current.cards.map((card) => card.id === cardId ? { ...card, version: 3 } : card) };
  const removed = transaction(2);
  removed.entities = [{ entityType: "card", entityId: cardId, projectId, version: 3 }];
  await act(async () => transport.receive!({ kind: "transaction", value: removed }));
  await advance(100);
  expect(dependent.querySelector(".dependency-badge")).toBeNull();
  expect(prerequisite.querySelector(".dependency-badge")).toBeNull();
  expect(host.querySelector(`[data-live-card-id="${cardId}"]`)).toBe(dependent);
  expect(host.querySelector(`[data-live-card-id="${prerequisiteId}"]`)).toBe(prerequisite);
  expect(reads.get(`/api/story-maps/${mapId}`)).toBe(initialReads + 2);
});

it.each(["tile", "text", "dialog", "popover", "drag", "manual"])("holds updates through %s interaction and applies them only after release", async (interaction) => {
  let layer: HTMLElement | undefined;
  await act(async () => {
    if (interaction === "tile") host.querySelector("button")!.focus();
    if (interaction === "text") host.querySelector("input")!.focus();
    if (interaction === "drag") useLiveInteractionStore.getState().setDragging(true);
    if (interaction === "manual") useLiveInteractionStore.getState().setManualHold(true);
    if (interaction === "dialog" || interaction === "popover") {
      layer = document.createElement("section");
      layer.setAttribute("data-test-interaction", "");
      layer.setAttribute(interaction === "dialog" ? "role" : "data-live-popover", interaction === "dialog" ? "dialog" : "");
      document.body.append(layer);
    }
    title = "Moved incoming tile";
    transport.receive!({ kind: "transaction", value: transaction(1) });
  });
  const focused = document.activeElement;
  expect(useLiveInteractionStore.getState().reviewRevision).toBe(1);
  await advance(250);
  expect(host.textContent).toContain("Original title");
  expect(useLiveInteractionStore.getState().waiting).toBe(1);
  expect(localStorage.getItem(`storymapper-live-applied-cursor:${projectId}`)).toBeNull();
  expect(document.activeElement).toBe(focused);
  await act(async () => {
    layer?.remove();
    if (focused instanceof HTMLElement) focused.blur();
    useLiveInteractionStore.getState().setDragging(false);
    useLiveInteractionStore.getState().setManualHold(false);
  });
  await advance(100);
  expect(host.textContent).toContain("Moved incoming tile");
  expect(useLiveInteractionStore.getState().waiting).toBe(0);
  expect(localStorage.getItem(`storymapper-live-applied-cursor:${projectId}`)).toBe(`${epoch}:1`);
  expect(reads.get(`/api/story-maps/${mapId}`)).toBe(2);
});

it("exposes the newest held version per changed object and clears it once the update is applied", async () => {
  const other = randomUUID();
  await act(async () => {
    useLiveInteractionStore.getState().setManualHold(true);
    transport.receive!({ kind: "transaction", value: transaction(3) });
    transport.receive!({ kind: "transaction", value: { ...transaction(5), entities: [{ entityType: "card", entityId: cardId, projectId, version: 5 }, { entityType: "persona", entityId: other, projectId, version: 7 }, { entityType: "activity", entityId: randomUUID(), projectId, version: null }] } });
    transport.receive!({ kind: "transaction", value: transaction(4) });
  });
  await advance(250);
  expect(useLiveInteractionStore.getState().pendingChanges).toEqual({ [`card:${cardId}`]: 5, [`persona:${other}`]: 7 });
  expect(useLiveInteractionStore.getState().waiting).toBe(2);
  await act(async () => useLiveInteractionStore.getState().setManualHold(false));
  await advance(100);
  expect(useLiveInteractionStore.getState().pendingChanges).toEqual({});
});

it("holds reset until interaction ends then refreshes every Project View", async () => {
  await act(async () => {
    useLiveInteractionStore.getState().setManualHold(true);
    transport.receive!({ kind: "transaction", value: transaction(1, 30) });
    const restoredEpoch = randomUUID();
    transport.receive!({ kind: "reset", value: { epoch: restoredEpoch, id: `${restoredEpoch}:0`, seq: 0 } });
  });
  expect(useLiveInteractionStore.getState().reviewRevision).toBe(2);
  await advance(100);
  expect(useLiveInteractionStore.getState().waiting).toBe(1);
  await act(async () => useLiveInteractionStore.getState().setManualHold(false));
  await advance(100);
  expect(reads.get(`/api/story-maps/${mapId}`)).toBe(2);
  expect(reads.get(`/api/story-maps/${otherMapId}`)).toBe(2);
  expect(reads.get(`/api/ai/templates?projectId=${projectId}`)).toBe(2);
  await advance(1500);
  expect(useAnnouncementStore.getState().status).toBe("");
});

it("invalidates Release draft lifetimes only for a changed server epoch", async () => {
  await act(async () => {
    transport.receive!({ kind: "ready", value: { epoch, id: `${epoch}:0`, seq: 0 } });
    transport.receive!({ kind: "transaction", value: transaction(1) });
  });
  expect(useLiveInteractionStore.getState().restoreRevision).toBe(0);
  await act(async () => transport.receive!({ kind: "reset", value: { epoch, id: `${epoch}:1`, seq: 1 } }));
  expect(useLiveInteractionStore.getState().restoreRevision).toBe(0);
  const restoredEpoch = randomUUID();
  await act(async () => transport.receive!({ kind: "reset", value: { epoch: restoredEpoch, id: `${restoredEpoch}:0`, seq: 0 } }));
  expect(useLiveInteractionStore.getState().restoreRevision).toBe(1);
});

it("treats a reconnect ready event with a changed epoch as a Restore boundary until the refresh succeeds", async () => {
  await act(async () => transport.receive!({ kind: "ready", value: { epoch, id: `${epoch}:0`, seq: 0 } }));
  const restoredEpoch = randomUUID();
  await act(async () => transport.receive!({ kind: "ready", value: { epoch: restoredEpoch, id: `${restoredEpoch}:0`, seq: 0 } }));
  expect(useLiveInteractionStore.getState().restoreRevision).toBe(1);
  expect(useLiveInteractionStore.getState().restorePending).toBe(true);
  await advance(100);
  expect(useLiveInteractionStore.getState().restorePending).toBe(false);
});

it("refreshes persisted templates after an external template commit", async () => {
  templateName = "Edited by Agent";
  const event = transaction(1);
  event.entities = [{ entityType: "aiTemplate", entityId: `${projectId}:prompt`, projectId, version: null }];
  await act(async () => transport.receive!({ kind: "transaction", value: event }));
  await advance(100);
  expect(host.textContent).toContain(templateName);
  expect(reads.get(`/api/ai/templates?projectId=${projectId}`)).toBe(2);
});

it("does not refetch or announce board changes for an audit-only tool read", async () => {
  const event = transaction(1);
  event.entities = [{ entityType: "activity", entityId: randomUUID(), version: null, projectId }];
  await act(async () => { host.querySelector("button")!.focus(); transport.receive!({ kind: "transaction", value: event }); });
  await advance(2000);
  expect(useLiveInteractionStore.getState().waiting).toBe(0);
  expect(reads.get(`/api/story-maps/${mapId}`)).toBe(1);
  expect(useAnnouncementStore.getState().status).toBe("");
});

it("replaces an obsolete in-flight snapshot request when another commit arrives", async () => {
  const originalFetch = fetch;
  let resolveOld: ((response: Response) => void) | undefined;
  let oldSignal: AbortSignal | null | undefined;
  let holdNext = true;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/story-maps/${mapId}` && holdNext) {
      holdNext = false;
      oldSignal = init?.signal;
      return new Promise<Response>((resolve) => { resolveOld = resolve; });
    }
    return originalFetch(path, init);
  }));
  await act(async () => transport.receive!({ kind: "transaction", value: transaction(1) }));
  await advance(100);
  expect(resolveOld).toBeDefined();
  title = "Latest committed title";
  await act(async () => transport.receive!({ kind: "transaction", value: transaction(2) }));
  await advance(100);
  expect(oldSignal?.aborted).toBe(true);
  expect(host.textContent).toContain("Latest committed title");
  title = "Obsolete title";
  await act(async () => resolveOld!(Response.json(snapshot(mapId, projectId))));
  expect(host.textContent).toContain("Latest committed title");
});

it("cancels an initial uncached snapshot read so its pre-commit response cannot hide a live commit", async () => {
  await act(async () => root.unmount());
  client.clear();
  reads.clear();
  const originalFetch = fetch;
  const capturedBeforeCommit = snapshot(mapId, projectId);
  let resolveInitial: ((response: Response) => void) | undefined;
  let initialSignal: AbortSignal | null | undefined;
  let holdInitial = true;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/story-maps/${mapId}` && holdInitial) {
      holdInitial = false;
      reads.set(path, (reads.get(path) ?? 0) + 1);
      initialSignal = init?.signal;
      return new Promise<Response>((resolve) => { resolveInitial = resolve; });
    }
    return originalFetch(path, init);
  }));
  root = createRoot(host);
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Probe))));
  expect(resolveInitial).toBeDefined();
  expect(client.getQueryData(["story-map", mapId])).toBeUndefined();
  expect(reads.get(`/api/story-maps/${mapId}`)).toBe(1);
  title = "Committed after initial read began";
  await act(async () => transport.receive!({ kind: "transaction", value: transaction(1) }));
  await advance(100);
  expect(initialSignal?.aborted).toBe(true);
  expect(reads.get(`/api/story-maps/${mapId}`)).toBe(2);
  expect(reads.get(`/api/story-maps/${otherMapId}`)).toBe(1);
  expect(host.textContent).toContain("Committed after initial read began");
  await act(async () => resolveInitial!(Response.json(capturedBeforeCommit)));
  expect(host.textContent).toContain("Committed after initial read began");
  expect(client.getQueryState(["story-map", mapId])?.isInvalidated).toBe(false);
  expect(localStorage.getItem(`storymapper-live-applied-cursor:${projectId}`)).toBe(`${epoch}:1`);
});

it.each(["tile", "text", "dialog", "popover", "drag", "manual"])("cancels a live GET when %s interaction starts and ignores its late response", async (interaction) => {
  const originalFetch = fetch;
  const incoming = snapshot(mapId, projectId);
  incoming.cards[0]!.title = "Removed or moved incoming tile";
  let resolveRead!: (response: Response) => void;
  let signal: AbortSignal | null | undefined;
  let holdRead = true;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/story-maps/${mapId}` && holdRead) {
      holdRead = false; signal = init?.signal;
      return new Promise<Response>((resolve) => { resolveRead = resolve; });
    }
    return originalFetch(path, init);
  }));
  await act(async () => transport.receive!({ kind: "transaction", value: transaction(1) }));
  await advance(100);
  let layer: HTMLElement | undefined;
  await act(async () => {
    if (interaction === "tile") host.querySelector("button")!.focus();
    if (interaction === "text") host.querySelector("input")!.focus();
    if (interaction === "drag") useLiveInteractionStore.getState().setDragging(true);
    if (interaction === "manual") useLiveInteractionStore.getState().setManualHold(true);
    if (interaction === "dialog" || interaction === "popover") {
      layer = document.createElement("section"); layer.setAttribute("data-test-interaction", "");
      layer.setAttribute(interaction === "dialog" ? "role" : "data-live-popover", interaction === "dialog" ? "dialog" : "");
      document.body.append(layer);
    }
  });
  expect(signal?.aborted).toBe(true);
  await act(async () => resolveRead(Response.json(incoming)));
  await advance(200);
  expect(host.textContent).toContain("Original title");
  expect(useLiveInteractionStore.getState().waiting).toBe(1);
  expect(localStorage.getItem(`storymapper-live-applied-cursor:${projectId}`)).toBeNull();
  title = "Latest after release";
  await act(async () => {
    layer?.remove(); (document.activeElement as HTMLElement).blur();
    useLiveInteractionStore.getState().setDragging(false); useLiveInteractionStore.getState().setManualHold(false);
  });
  await advance(100);
  expect(host.textContent).toContain("Latest after release");
  expect(localStorage.getItem(`storymapper-live-applied-cursor:${projectId}`)).toBe(`${epoch}:1`);
});

it("retains a failed batch without applying its cursor, announcing success or retrying automatically", async () => {
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path === `/api/story-maps/${mapId}` ? Promise.resolve(new Response("failed", { status: 500 })) : originalFetch(path, init)));
  await act(async () => transport.receive!({ kind: "transaction", value: transaction(1) }));
  await advance(100);
  expect(localStorage.getItem(`storymapper-live-applied-cursor:${projectId}`)).toBeNull();
  expect(useLiveInteractionStore.getState().waiting).toBe(1);
  expect(host.querySelector("[data-live-failed]")?.getAttribute("data-live-failed")).toBe("true");
  expect(useAnnouncementStore.getState().alert).toBe("");
  const requests = vi.mocked(fetch).mock.calls.length;
  await advance(6000);
  expect(vi.mocked(fetch).mock.calls).toHaveLength(requests);
  expect(useAnnouncementStore.getState().status).toBe("");
  vi.stubGlobal("fetch", originalFetch);
  title = "Next successful commit";
  await act(async () => transport.receive!({ kind: "transaction", value: transaction(2) }));
  await advance(100);
  expect(host.textContent).toContain(title);
  expect(useLiveInteractionStore.getState().waiting).toBe(0);
  expect(localStorage.getItem(`storymapper-live-applied-cursor:${projectId}`)).toBe(`${epoch}:2`);
});

it("refreshes real safety pills for an external Project event while manual hold blocks focus and reconnect refetches", async () => {
  const originalFetch = fetch;
  let agentMode = "apply";
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path.startsWith("/api/settings/safety")) {
      reads.set(path, (reads.get(path) ?? 0) + 1);
      return Promise.resolve(Response.json({ settings: { projectId: path.includes(projectId) ? projectId : otherProjectId, agentMode: path.includes(projectId) ? agentMode : "apply", github: false, updatedAt: "2026-10-19T00:00:00.000Z" } }));
    }
    return originalFetch(path, init);
  }));
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement("div", null,
    createElement(Probe), createElement("section", { id: "current-safety" }, createElement(SafetySwitchStrip, { projectId })),
    createElement("section", { id: "other-safety" }, createElement(SafetySwitchStrip, { projectId: otherProjectId }))))));
  const label = (on: boolean) => appStrings.safetySwitchState(appStrings.agentMode, appStrings.agentModes[on ? "apply" : "off"].label);
  expect(host.querySelector("#current-safety .safety-pill")!.getAttribute("aria-label")).toContain(label(true));
  await act(async () => {
    useLiveInteractionStore.getState().setManualHold(true); agentMode = "off";
    const event = transaction(1); event.entities = [{ entityType: "project", entityId: projectId, projectId, version: 2 }];
    transport.receive!({ kind: "transaction", value: event });
    focusManager.setFocused(false); focusManager.setFocused(true); onlineManager.setOnline(false); onlineManager.setOnline(true);
  });
  await advance(250);
  expect(host.querySelector("#current-safety .safety-pill")!.getAttribute("aria-label")).toContain(label(true));
  expect(reads.get(`/api/settings/safety?projectId=${projectId}`)).toBe(1);
  await act(async () => useLiveInteractionStore.getState().setManualHold(false));
  await advance(100);
  expect(host.querySelector("#current-safety .safety-pill")!.getAttribute("aria-label")).toContain(label(false));
  expect(host.querySelector("#other-safety .safety-pill")!.getAttribute("aria-label")).toContain(label(true));
  expect(reads.get(`/api/settings/safety?projectId=${otherProjectId}`)).toBe(1);
  focusManager.setFocused(undefined);
});

it("updates What changed while its read-only drawer is open and defers markers for dirty/manual/drag/other-dialog holds", async () => {
  const { WhatChangedProvider, WhatChangedButton, ChangedMarker } = await import("@storymapper/web/features/what-changed/WhatChangedProvider");
  const originalFetch = fetch;
  let committed = 0;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => path.startsWith("/api/activity/changes?") ? Promise.resolve(Response.json({ epoch, floor: 0, highWater: committed, nextAfterSeq: null,
    events: Array.from({ length: committed }, (_, index) => ({ id: `${projectId.slice(0, -12)}${String(index + 1).padStart(12, "0")}`, seq: index + 1, projectId, actor: "Agent", actorType: "agent", action: "card.updated", affectedEntityType: "card", affectedEntityId: cardId, cards: [{ id: cardId, storyMapId: mapId, title: "Committed" }], createdAt: "2026-10-15T10:00:00Z" })) })) : originalFetch(path, init)));
  function Changes() {
    useLiveUpdates(projectId);
    return createElement(WhatChangedProvider, { projectId, storyMapId: mapId, navigateCard: async () => false, children: createElement("div", null, createElement(WhatChangedButton), createElement(ChangedMarker, { cardId }), createElement("textarea", { "aria-label": "Dirty draft" })) });
  }
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Changes))));
  const trigger = () => [...host.querySelectorAll("button")].find((button) => button.getAttribute("aria-label")?.startsWith("What changed"))!;
  await act(async () => { trigger().focus(); trigger().click(); });
  committed = 1;
  await act(async () => transport.receive!({ kind: "transaction", value: transaction(1) }));
  await advance(100);
  expect(trigger().getAttribute("aria-label")).toContain("(1)");
  expect(host.querySelector(".changed-marker")).not.toBeNull();
  const drawer = host.querySelector<HTMLElement>("[data-what-changed-drawer]")!;
  await act(async () => drawer.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  const draft = host.querySelector<HTMLTextAreaElement>("textarea")!;
  draft.value = "Unsaved draft"; draft.focus();
  committed = 2;
  await act(async () => transport.receive!({ kind: "transaction", value: transaction(2) }));
  await advance(200);
  expect(trigger().getAttribute("aria-label")).toContain("(1)"); expect(draft.value).toBe("Unsaved draft"); expect(document.activeElement).toBe(draft);
  await act(async () => { trigger().focus(); }); await advance(200);
  expect(trigger().getAttribute("aria-label")).toContain("(1)");
  for (const hold of ["manual", "drag", "dialog"] as const) {
    const dialog = document.createElement("div"); dialog.setAttribute("role", "dialog"); dialog.dataset.testInteraction = "true";
    if (hold === "dialog") document.body.append(dialog);
    else useLiveInteractionStore.setState(hold === "manual" ? { manualHold: true } : { dragging: true });
    committed++;
    await act(async () => transport.receive!({ kind: "transaction", value: transaction(committed) })); await advance(200);
    expect(trigger().getAttribute("aria-label")).toContain("(1)");
    dialog.remove(); useLiveInteractionStore.setState({ manualHold: false, dragging: false }); await advance(200);
    expect(trigger().getAttribute("aria-label")).toContain("(1)");
  }
});

function ReleaseEpochConsumer() {
  const map = useStoryMap(mapId);
  if (!map.data) return null;
  return createElement(Fragment, null,
    createElement(ReleasePanel, { storyMapId: mapId, releases: map.data.releases, cards: map.data.cards, externalRefs: [] }),
    map.data.releases[0] ? createElement(ReleaseDateFields, { release: map.data.releases[0], storyMapId: mapId }) : null);
}

it.each([false, true])("blocks Release admission through a delayed Restore snapshot and keeps failure refused (failure=%s)", async (fail) => {
  const id = randomUUID();
  const oldRelease = { id, storyMapId: mapId, version: 5, name: "Before Restore", goal: "Old goal", position: 0, released: false, startDate: "2026-10-01", releaseDate: "2026-10-31" };
  let current = { ...snapshot(mapId, projectId), releases: [oldRelease] };
  const restored = { ...current, releases: [{ ...oldRelease, version: 1, goal: "Restored goal", startDate: "2026-09-01" }] };
  let delaying = false;
  let complete!: (response: Response) => void;
  const original = fetch;
  vi.stubGlobal("fetch", vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/story-maps/${mapId}`) return delaying ? new Promise<Response>((resolve) => { complete = resolve; }) : Promise.resolve(Response.json(current));
    if (path.startsWith('/api/reports/release-summary')) return Promise.resolve(Response.json({ totalCards: 0, totalStories: 0, estimateTotal: 0, unestimatedCards: 0, unestimatedStories: [], statusCounts: {}, riskCounts: { missingDescription: 0, missingSource: 0, missingGitHubLink: 0 } }));
    if (path === `/api/releases/${id}` && init?.method === 'PATCH') return Promise.resolve(Response.json({}, { status: 503 }));
    return original(path, init);
  }));
  useLiveInteractionStore.getState().recordEpoch(epoch);
  await act(async () => {
    client.setQueryData(['story-map', mapId], current);
    root.render(createElement(QueryClientProvider, { client }, createElement(Fragment, null, createElement(Probe), createElement(ReleaseEpochConsumer))));
  });
  const dates = () => host.querySelectorAll<HTMLInputElement>('.release-date-fields input');
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(dates()[0]!, '2026-11-01');
    dates()[0]!.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(host.querySelector('[data-live-suspended-draft]')).not.toBeNull();
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === 'Edit release Before Restore')!.click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  const restoredEpoch = randomUUID(); delaying = true;
  await act(async () => transport.receive!({ kind: 'reset', value: { epoch: restoredEpoch, seq: 0, id: `${restoredEpoch}:0` } }));
  await advance(100);
  expect(useLiveInteractionStore.getState().restorePending).toBe(true);
  expect(host.querySelector('[data-live-suspended-draft]')).toBeNull();
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  const edit = () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === 'Edit release Before Restore')!;
  expect(edit().disabled).toBe(true); expect(dates()[0]!.disabled).toBe(true);
  await act(async () => edit().click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  await act(async () => { current = restored; complete(fail ? Response.json({}, { status: 503 }) : Response.json(restored)); });
  if (fail) {
    expect(useLiveInteractionStore.getState().restorePending).toBe(true);
    expect(edit().disabled).toBe(true); expect(dates()[0]!.disabled).toBe(true);
  } else {
    expect(useLiveInteractionStore.getState().restorePending).toBe(false);
    expect(dates()[0]!.value).toBe('2026-09-01');
    await act(async () => edit().click());
    expect(document.querySelector<HTMLTextAreaElement>('[aria-label="Release goal"]')!.value).toBe('Restored goal');
  }
});

function PreviouslyInactiveReleases({ storyMapId }: { storyMapId: string }) {
  const map = useStoryMap(storyMapId);
  return createElement(Fragment, null,
    map.data ? createElement(ReleasePanel, { storyMapId, releases: map.data.releases, cards: map.data.cards, externalRefs: [] }) : null,
    createElement(ReleaseTimelineChart, { storyMapId }));
}

it.each([false, true])("evicts inactive pre-Restore map and Timeline roots before reopening them with a delayed or failed fresh read (failure=%s)", async (fail) => {
  const inactiveMapId = randomUUID();
  const oldRelease = { id: randomUUID(), storyMapId: inactiveMapId, version: 5, name: 'Pre-Restore inactive release', goal: 'Pre-Restore goal', position: 0, released: false, startDate: '2026-10-01', releaseDate: '2026-10-31' };
  const stale = { ...snapshot(inactiveMapId, projectId), releases: [oldRelease] };
  const fresh = { ...stale, releases: [{ ...oldRelease, name: 'Restored inactive release', goal: 'Restored goal', startDate: '2026-09-01' }] };
  const timeline = (release: typeof oldRelease) => ({ storyMapId: inactiveMapId, startDate: release.startDate, endDate: release.releaseDate, items: [{ release, totalStories: 0, doneStories: 0, estimateTotal: 0, progressRatio: 0, startOffsetDays: 0, durationDays: 30 }] });
  const mapKey = ['story-map', inactiveMapId]; const timelineKey = ['release-timeline', inactiveMapId];
  const summaryKey = ['release-summary', inactiveMapId, 'all', false];
  client.setQueryData(mapKey, stale); client.setQueryData(timelineKey, timeline(oldRelease)); client.setQueryData(summaryKey, { totalStories: 7 });
  expect(client.getQueryCache().find({ queryKey: mapKey })!.isActive()).toBe(false);
  expect(client.getQueryCache().find({ queryKey: timelineKey })!.isActive()).toBe(false);
  useLiveInteractionStore.getState().recordEpoch(epoch);
  const restoredEpoch = randomUUID();
  await act(async () => transport.receive!({ kind: 'reset', value: { epoch: restoredEpoch, seq: 0, id: `${restoredEpoch}:0` } }));
  await advance(100);
  expect(useLiveInteractionStore.getState().restorePending).toBe(false);
  expect(client.getQueryData(mapKey)).toBeUndefined();
  expect(client.getQueryData(timelineKey)).toBeUndefined();
  expect(client.getQueryData(summaryKey)).toBeUndefined();
  let completeMap!: (response: Response) => void;
  let completeTimeline!: (response: Response) => void;
  const original = fetch;
  vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => {
    if (path === `/api/story-maps/${inactiveMapId}`) return new Promise<Response>((resolve) => { completeMap = resolve; });
    if (path === `/api/reports/release-timeline?storyMapId=${inactiveMapId}`) return new Promise<Response>((resolve) => { completeTimeline = resolve; });
    if (path.startsWith('/api/reports/release-summary')) return Promise.resolve(Response.json({ totalCards: 0, totalStories: 0, estimateTotal: 0, unestimatedCards: 0, unestimatedStories: [], statusCounts: {}, riskCounts: { missingDescription: 0, missingSource: 0, missingGitHubLink: 0 } }));
    return original(path, init);
  }));
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Fragment, null, createElement(Probe), createElement(PreviouslyInactiveReleases, { storyMapId: inactiveMapId })))));
  expect(host.textContent).not.toContain(oldRelease.name);
  expect(host.querySelector('.release-tracking-panel')).toBeNull();
  expect(host.querySelector('.release-date-fields')).toBeNull();
  await act(async () => {
    completeMap(fail ? Response.json({}, { status: 503 }) : Response.json(fresh));
    completeTimeline(fail ? Response.json({}, { status: 503 }) : Response.json(timeline(fresh.releases[0]!)));
  });
  expect(host.textContent).not.toContain(oldRelease.name);
  if (fail) {
    expect(host.querySelector('.release-tracking-panel')).toBeNull();
    expect(host.querySelector('.release-date-fields')).toBeNull();
    expect(client.getQueryData(mapKey)).toBeUndefined(); expect(client.getQueryData(timelineKey)).toBeUndefined();
  } else {
    expect(host.textContent).toContain('Restored inactive release');
    expect(host.querySelector<HTMLInputElement>('.release-date-fields input')!.value).toBe('2026-09-01');
    expect(host.querySelector<HTMLInputElement>('.release-date-fields input')!.disabled).toBe(false);
    await act(async () => [...host.querySelectorAll<HTMLButtonElement>('button')].find((item) => item.textContent === 'Edit release Restored inactive release')!.click());
    expect(document.querySelector<HTMLTextAreaElement>('[aria-label="Release goal"]')!.value).toBe('Restored goal');
  }
});

it('preserves inactive cached roots for ordinary transactions and same-epoch resets', async () => {
  const inactiveMapId = randomUUID(); const cached = snapshot(inactiveMapId, projectId);
  client.setQueryData(['story-map', inactiveMapId], cached);
  useLiveInteractionStore.getState().recordEpoch(epoch);
  await act(async () => transport.receive!({ kind: 'transaction', value: transaction(1) })); await advance(100);
  expect(client.getQueryData(['story-map', inactiveMapId])).toEqual(cached);
  await act(async () => transport.receive!({ kind: 'reset', value: { epoch, seq: 1, id: `${epoch}:1` } })); await advance(100);
  expect(client.getQueryData(['story-map', inactiveMapId])).toEqual(cached);
});

it.each([false, true])("refreshes review metadata through a dialog while retaining domain changes and manual Hold (mixed=%s)", async (mixed) => {
  const { QueryObserver } = await import("@tanstack/react-query");
  let reviewState = "pending";
  const reviewRead = vi.fn(async () => ({ state: reviewState }));
  const reviewKey = ["card-reviews", projectId, mapId];
  await client.fetchQuery({ queryKey: reviewKey, queryFn: reviewRead });
  const observer = new QueryObserver(client, { queryKey: reviewKey, queryFn: reviewRead, staleTime: Infinity });
  const unsubscribe = observer.subscribe(() => {});
  const dialog = document.createElement("section");
  dialog.setAttribute("role", "dialog"); dialog.setAttribute("data-test-interaction", "");
  const input = document.createElement("textarea"); input.value = "Unsaved correction reason"; dialog.append(input); document.body.append(dialog);
  const proposalId = randomUUID();
  const metadata = (seq: number): LiveTransaction => ({ ...transaction(seq), entities: [{ entityType: "cardReview", entityId: randomUUID(), projectId, version: null }, ...(mixed ? [{ entityType: "changeSet", entityId: proposalId, projectId, version: 1 }] : [])] });
  await act(async () => { input.focus(); title = "Held incoming title"; transport.receive!({ kind: "transaction", value: transaction(1) }); reviewState = "reviewed"; transport.receive!({ kind: "transaction", value: metadata(2) }); });
  await advance(150);
  expect(client.getQueryData(reviewKey)).toEqual({ state: "reviewed" });
  expect(host.textContent).toContain("Original title");
  expect(reads.get(`/api/story-maps/${mapId}`)).toBe(1);
  expect(input.value).toBe("Unsaved correction reason"); expect(document.activeElement).toBe(input);
  expect(useLiveInteractionStore.getState().pendingChanges).toEqual({ [`card:${cardId}`]: 1, ...(mixed ? { [`changeSet:${proposalId}`]: 1 } : {}) });
  expect(reviewRead).toHaveBeenCalledTimes(2);
  expect(localStorage.getItem(`storymapper-live-applied-cursor:${projectId}`)).toBeNull();
  await act(async () => { useLiveInteractionStore.getState().setManualHold(true); reviewState = "error"; transport.receive!({ kind: "transaction", value: metadata(3) }); });
  await advance(150);
  expect(client.getQueryData(reviewKey)).toEqual({ state: "reviewed" });
  await act(async () => useLiveInteractionStore.getState().setManualHold(false));
  await advance(150);
  expect(client.getQueryData(reviewKey)).toEqual({ state: "error" });
  expect(host.textContent).toContain("Original title");
  await act(async () => { dialog.remove(); input.blur(); });
  await advance(150);
  expect(host.textContent).toContain("Held incoming title");
  unsubscribe();
});
