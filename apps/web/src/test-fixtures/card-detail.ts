// @vitest-environment jsdom // REQ FR-15
import { randomUUID } from "node:crypto";
import { act, createElement, Fragment, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, Outlet, RouterProvider } from "@tanstack/react-router";
import { cardReviewSettingsSchema, storyMapSnapshotSchema, type CardSourceLink, type CreateCardSourceLinkRequest, type CardHistoryResponse, type StoryMapSnapshot, type UpdateCardRequest, type SyncConflict, type ConnectorConnection } from "@storymapper/contracts";
import { afterEach, beforeEach, expect, vi } from "vitest";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { useTreeCollapseStore } from "@storymapper/web/app/stores/tree-collapse-store";
import { useDiscoveryLaneCollapseStore } from "@storymapper/web/app/stores/discovery-lane-collapse-store";
import { router } from "@storymapper/web/app/router";

vi.mock("@storymapper/web/app/routes/RootLayout", () => ({ RootLayout: () => createElement(Outlet) }));

export const projectId = randomUUID();
export const storyMapId = randomUUID();
export const cardId = randomUUID();
export const viewUrl = `/projects/${projectId}/story-maps/${storyMapId}/tree`;

export const state = {} as {
  snapshot: StoryMapSnapshot;
  otherMapIssues: StoryMapSnapshot["githubLinks"];
  otherMapId: string;
  root: Root;
  host: HTMLDivElement;
  client: QueryClient;
  savedPatch: UpdateCardRequest | undefined;
  syncConflicts: SyncConflict[];
  connections: ConnectorConnection[];
  historyPages: CardHistoryResponse[];
  historyFailure: number | undefined;
  historyRequests: string[];
};

export function savedHistory(): CardHistoryResponse[] {
  const card = state.snapshot.cards.find((item) => item.id === cardId)!;
  const initial = { ...card, version: 1, description: "Before description ".repeat(30) };
  const edited = { ...initial, version: 2, title: "Agent title", description: "<script>unsafe()</script> After description ".repeat(30) };
  const entry = { id: randomUUID(), cardId, actor: "agent-host", actorType: "agent" as const, mcpSessionId: "detail-session", createdAt: card.createdAt };
  return [
    { nextCursor: 2, versions: [
      { ...entry, version: 3, snapshot: { ...edited, version: 3 }, previousSnapshot: edited, changedFields: [] },
      { ...entry, id: randomUUID(), version: 2, snapshot: edited, previousSnapshot: initial, changedFields: ["title", "description"] }
    ] },
    { nextCursor: null, versions: [{ ...entry, id: randomUUID(), actor: "human-host", actorType: "human", version: 1, snapshot: initial, previousSnapshot: null, changedFields: ["created"] }] }
  ];
}

export async function openBoardSearch() {
  const toggle = document.querySelector<HTMLButtonElement>('button[aria-label="Search and filters"]')!;
  if (toggle.getAttribute("aria-pressed") === "false") await act(async () => toggle.click());
}

export function button(text: string): HTMLButtonElement {
  const result = [...document.querySelectorAll("button")].find((item) => item.textContent === text);
  expect(result, text).toBeDefined();
  return result!;
}

export const roadmapId = randomUUID();

export async function mount(url: string, ready = "Create traceable story cards", live?: ReactElement, history?: ReturnType<typeof createMemoryHistory>) {
  state.client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  router.update({ history: history ?? createMemoryHistory({ initialEntries: [url] }) });
  state.root = createRoot(state.host);
  await act(async () => {
    state.root.render(createElement(QueryClientProvider, { client: state.client }, createElement(Fragment, null, live, createElement(RouterProvider, { router }))));
    await router.load();
  });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(state.host.textContent).toContain(ready);
  });
}

beforeEach(() => {
  resetCardDetailFixtureState();
  const now = new Date().toISOString();
  const activityId = randomUUID();
  const stepId = randomUUID();
  state.snapshot = storyMapSnapshotSchema.parse({
    storyMap: { version: 1, id: storyMapId, projectId, name: "PRD to Delivery Map", createdAt: now, updatedAt: now },
    cards: [
      { creationOrigin: "manual", provenance: "manual", version: 1, id: activityId, storyMapId, key: "LSM-1", parentId: null, releaseId: null, position: 0, level: "activity", title: "Understand product requirements", createdAt: now, updatedAt: now },
      { creationOrigin: "manual", provenance: "manual", version: 1, id: stepId, storyMapId, key: "LSM-2", parentId: activityId, releaseId: null, position: 0, level: "step", title: "Import source document", createdAt: now, updatedAt: now },
      { creationOrigin: "manual", provenance: "manual", version: 1, id: cardId, storyMapId, key: "LSM-3", parentId: stepId, releaseId: null, position: 0, level: "story", title: "Create traceable story cards", createdAt: now, updatedAt: now }
    ],
    releases: [], sourceLinks: [], cardDependencies: [], githubLinks: [], remoteWorkItemLinks: [], workflowStatuses: (["todo", "active", "done", "archived"] as const).map((name, position) => ({ id: randomUUID(), projectId, storyMapId: null, name, group: name === "archived" ? "done" : name, position })), personas: [], cardPersonas: [], annotations: [], cardAnnotations: [], storyTemplates: []
  });
  installCardFixtureFetch(now);
  state.host = document.createElement("div");
  document.body.append(state.host);
});

afterEach(async () => {
  await act(async () => state.root?.unmount());
  state.client?.clear();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  state.host?.remove();
  useLiveInteractionStore.getState().setWaiting(0, {});
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});


function resetCardDetailFixtureState() {
  useTreeCollapseStore.setState({ collapsedByMap: {} });
  useDiscoveryLaneCollapseStore.setState({ collapsedByMap: {} });
  localStorage.clear();
  notifyManager.setScheduler(queueMicrotask);
  vi.spyOn(window, "scrollTo").mockImplementation(() => { });
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("ResizeObserver", class { observe() { } unobserve() { } disconnect() { } });
  // HINT: jsdom has no Range layout; ProseMirror scrollToSelection needs it on focus().
  Object.assign(Range.prototype, { getClientRects: () => [], getBoundingClientRect: () => new DOMRect() });
  state.otherMapIssues = [];
  state.otherMapId = randomUUID();
  state.savedPatch = undefined;
  state.syncConflicts = [];
  state.connections = [];
  state.historyRequests = [];
  state.historyFailure = undefined;
  state.historyPages = [{ versions: [], nextCursor: null }];
}

function installCardFixtureFetch(now: string): void {
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
  let value: unknown;
  if (path.startsWith(`/api/projects/${projectId}/card-reviews?`)) {
    const selected = new URL(path, "http://127.0.0.1").searchParams.get("cardId");
    value = { settings: cardReviewSettingsSchema.parse({}), requests: [], reports: [], decisions: [], fixes: [], runningRequestIds: [], summaries: state.snapshot.cards.filter((card) => card.level !== "note" && (!selected || card.id === selected)).map((card) => ({ cardId: card.id, state: "missing", unresolvedCount: 0, highestSeverity: null, ignoredFindingIds: [] })) };
  }
  else if (path === `/api/story-maps/${storyMapId}`) value = state.snapshot;
  else if (path === `/api/story-maps?projectId=${projectId}`) value = { storyMaps: [state.snapshot.storyMap, { ...state.snapshot.storyMap, id: state.otherMapId }] };
  else if (path === `/api/sync/work-items/health?storyMapId=${storyMapId}`) value = { storyMapId, links: state.snapshot.remoteWorkItemLinks, openConflicts: state.syncConflicts, deletedLocalLinks: [], deletedLinks: [], totalLinks: state.snapshot.remoteWorkItemLinks.length, stateCounts: {} };
  else if (path === `/api/github/links?storyMapId=${storyMapId}`) value = { links: state.snapshot.githubLinks };
  else if (path === `/api/github/links?storyMapId=${state.otherMapId}`) value = { links: state.otherMapIssues };
  else if (state.snapshot.cards.some((card) => path === `/api/cards/${card.id}`) && init?.method === "PATCH") {
    state.savedPatch = JSON.parse(String(init.body)) as UpdateCardRequest;
    const savedId = path.split("/").at(-1);
    state.snapshot = { ...state.snapshot, cards: state.snapshot.cards.map((card) => card.id === savedId ? { ...card, ...state.savedPatch } : card) } as StoryMapSnapshot;
    value = state.snapshot.cards.find((card) => card.id === savedId);
  } else if (path === `/api/cards/${cardId}/source-links`) {
    const input = JSON.parse(String(init?.body)) as CreateCardSourceLinkRequest & { id?: string };
    if (init?.method === "DELETE") {
      state.snapshot.sourceLinks = state.snapshot.sourceLinks.filter((link) => link.id !== input.id || link.kind !== input.kind);
      value = { ok: true };
    } else {
      const issue = input.kind === "github" ? [...state.snapshot.githubLinks, ...state.otherMapIssues].find((link) => link.id === input.externalRefId)! : undefined;
      const evidence = input.kind === "github" ? { kind: "github", id: randomUUID(), cardId, externalRefId: input.externalRefId, repoFullName: issue!.repo, issueNumber: issue!.issueNumber!, url: issue!.url } : { ...input, note: input.kind === "note" ? input.note.trim() : undefined, id: randomUUID(), cardId, createdAt: now };
      state.snapshot.sourceLinks = [...state.snapshot.sourceLinks, evidence as CardSourceLink];
      value = { link: evidence };
    }
    state.snapshot.cards = state.snapshot.cards.map((card) => card.id === cardId ? { ...card, provenance: state.snapshot.sourceLinks.some((link) => link.cardId === cardId) ? "linked" : card.creationOrigin } : card);
  }
  else if (path === `/api/source-documents?projectId=${projectId}`) value = { documents: state.snapshot.sourceChunks.length ? [{ id: state.snapshot.sourceChunks[0]!.documentId, title: "Origin document" }] : [] };
  else if (path === `/api/connectors/connections?projectId=${projectId}`) value = { connections: state.connections };
  else if (path === `/api/settings/safety?projectId=${projectId}`) value = { settings: { projectId, agentMode: "apply", github: true, updatedAt: "2026-10-19T00:00:00.000Z" } };
  else if (path.startsWith(`/api/cards/${cardId}/history?`)) {
    state.historyRequests.push(path);
    const page = path.includes("beforeVersion=") ? 1 : 0;
    if (state.historyFailure === page) return new Response(JSON.stringify({ message: "History read failed" }), { status: 500, headers: { "content-type": "application/json" } });
    value = state.historyPages[page];
  }
  else if (state.snapshot.cards.some((card) => path === `/api/cards/${card.id}/attachments`)) value = { attachments: [] };
  else if (path.startsWith("/api/roadmaps?")) value = { roadmaps: [{ id: roadmapId, name: "Delivery roadmap" }] };
  else if (path === `/api/roadmaps/${roadmapId}`) value = { roadmap: { version: 1, id: roadmapId, projectId, storyMapId, name: "Delivery roadmap", type: "release", createdAt: now, updatedAt: now }, columns: [{ id: "column", name: "Now" }], cards: [{ id: "roadmap-card", columnId: "column", title: "Plan" }], references: state.snapshot.cards.filter((card) => card.level === "story").map((card) => ({ roadmapCardId: "roadmap-card", targetId: card.id })), reports: [] };
  else throw new Error(`Unexpected test request: ${path}`);
  return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
}));
}
