import { readStylesheet } from "@storymapper/web/test-fixtures/styles";
import { ConflictError } from "@storymapper/web/app/conflicts";
import { syncConflictStrings } from "@storymapper/web/ui-strings/sync-conflicts";
import { IncomingGitHubError } from "@storymapper/web/app/incoming-github-error";
// @vitest-environment jsdom // REQ Story 6.4
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { cardSchema, changeSetSchema, syncConflictSchema, type SyncConflict, storyMapSnapshotSchema, type Card, type ChangeSetPreviewResponse, type RemotePushPlan, type RemotePushPlanResponse, type PlanWorkItemSyncRequest, type Release, type RemoteWorkItemLink, type WorkItemSyncHealthReport } from "@storymapper/contracts";
import { panelStrings, storyMapStrings } from "@storymapper/ui-strings";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createMemoryHistory, createRootRoute, createRouter, RouterContextProvider, RouterProvider } from "@tanstack/react-router";
import { BoardToolbar } from "@storymapper/web/features/story-map";
import { useStoryMapBoardState, type StoryMapBoardState } from "@storymapper/web/features/story-map";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { remotePushStrings } from "@storymapper/web/ui-strings/remote-push";
import { GitHubSyncPanel } from "@storymapper/web/features/github-sync/GitHubSyncPanel";

const mocks = vi.hoisted(() => ({ preview: undefined as ChangeSetPreviewResponse | undefined, import: vi.fn(), pull: vi.fn(), resolve: vi.fn(), conflicts: [] as SyncConflict[], plan: vi.fn(), read: vi.fn(), confirm: vi.fn(), resume: vi.fn(), legacyPush: vi.fn(), sync: vi.fn(), connectionScope: vi.fn(), privacyScope: vi.fn(), links: [] as RemoteWorkItemLink[], deletedLocalLinks: [] as WorkItemSyncHealthReport["deletedLocalLinks"], connections: [] as Array<{ id: string; name: string; readOnly: boolean }> }));
vi.mock("@storymapper/web/app/api", () => ({
  useChangeSetPreview: () => ({ data: mocks.preview, isFetching: false, isPlaceholderData: false, error: null, refetch: vi.fn() }),
  api: { getCardReviews: async () => ({ settings: { reviewBeforeAgentPush: true, reviewAfterAgentCreate: false, reviewAfterAgentContentChange: false, allowHumanPushOverride: false }, summaries: [], requests: [], reports: [], decisions: [], fixes: [], runningRequestIds: [] }), importWorkItems: mocks.import, pullStoryMapWorkItems: mocks.pull, readRemotePushPlan: mocks.read, planWorkItemSync: mocks.plan, confirmRemotePushPlan: mocks.confirm, resumeRemotePushPlan: mocks.resume, pushWorkItems: mocks.legacyPush, syncWorkItems: mocks.sync, resolveSyncConflict: mocks.resolve },
  useConnectorConnections: (projectId: string) => { mocks.connectionScope(projectId); return { data: { connections: mocks.connections } }; },
  useSafetySettings: (projectId: string) => { mocks.privacyScope(projectId); return { data: { settings: { github: true } } }; },
  useWorkItemSyncHealth: () => ({ data: { links: mocks.links, totalLinks: mocks.links.length, openConflicts: mocks.conflicts, deletedLinks: mocks.deletedLocalLinks, deletedLocalLinks: mocks.deletedLocalLinks, stateCounts: {} } })
}));

const mapId = randomUUID();
const fixtureProjectId = randomUUID();
const fixtureRouter = createRouter({ routeTree: createRootRoute(), history: createMemoryHistory({ initialEntries: ["/"] }) });
let cards: Card[];
let releases: Release[];
let mapVersion: number;
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
const plans = new Map<string, RemotePushPlan>();

function pushPlan(request: PlanWorkItemSyncRequest): RemotePushPlan {
  const selected = cards.filter((card) => (request.cardIds === undefined || request.cardIds.includes(card.id)) && (!request.releaseId || card.releaseId === request.releaseId));
  const plan: RemotePushPlan = {
    id: randomUUID(), actor: { actorType: "human", actorId: "fixture-human" }, projectId: fixtureProjectId, storyMapId: mapId, connectionId: request.connectionId,
    epoch: useLiveInteractionStore.getState().epoch!, createdAt: "2026-10-19T00:00:00.000Z", selection: { ...(request.cardIds === undefined ? {} : { cardIds: request.cardIds }), ...(request.releaseId ? { releaseId: request.releaseId } : {}) },
    localFingerprint: "local", connectionFingerprint: "connection", safetyFingerprint: "safety", remoteFingerprint: "remote",
    remoteEvidence: { issueTypes: ["Task"], labels: ["reviewed"], writable: true, milestones: [] },
    items: selected.filter((card) => card.level !== "note").map((card) => ({ id: randomUUID(), entityId: card.id, kind: "issue", action: "create", marker: `marker:${card.id}`, dependencies: [], labelAdditions: ["reviewed"], labelRemovals: [], managedLabels: [], payload: { title: card.title, body: "Reviewed body", labels: ["reviewed"], issueType: "Task", remoteState: "open", milestoneNumber: null } })),
    exclusions: selected.filter((card) => card.level === "note").map((card) => ({ entityId: card.id, reason: "Notes are excluded from push." })), blockers: []
  };
  const release = releases.find((item) => item.id === request.releaseId);
  if (release) plan.items.unshift({ id: randomUUID(), entityId: release.id, kind: "milestone", action: "create", marker: `release:${release.id}`, dependencies: [], labelAdditions: [], labelRemovals: [], managedLabels: [], payload: { title: release.name, description: release.goal, dueOn: release.releaseDate, state: release.released ? "closed" : "open" } });
  plans.set(plan.id, plan);
  return plan;
}

function executedPlan(planId: string, status: "completed" | "interrupted" = "completed"): RemotePushPlanResponse {
  const plan = plans.get(planId)!;
  return { plan, execution: { planId, status, items: plan.items.map((item, index) => ({ itemId: item.id, state: status === "interrupted" && index > 0 ? "uncertain" : "succeeded", attempt: 1, remoteId: String(index + 1), url: `https://github.com/owner/repo/issues/${index + 1}` })) } };
}

function incoming() {
  const changeSet = changeSetSchema.parse({ id: randomUUID(), projectId: fixtureProjectId, title: "Incoming changes", source: "github", status: "proposed", createdAt: "2026-10-19T00:00:00.000Z", operations: [] });
  return { changeSet, changeSetId: changeSet.id, outcome: "proposed", previewRef: { changeSetId: changeSet.id }, items: [] };
}

async function render(selectedCardIds?: string[]) {
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(RouterContextProvider, { router: fixtureRouter, children: createElement(GitHubSyncPanel, {
      projectId: fixtureProjectId, storyMapId: mapId, storyMapName: "Selected map", storyMapVersion: mapVersion,
      cards, releases, links: [], selectedCardIds
    }) })));
  });
}

function button(text: string) {
  return [...host.querySelectorAll("button")].find((item) => item.textContent?.trim() === text)!;
}

async function click(text: string) {
  await act(async () => button(text).click());
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler(queueMicrotask);
  vi.resetAllMocks();
  plans.clear();
  releases = [];
  mapVersion = 1;
  mocks.links = [];
  mocks.deletedLocalLinks = [];
  mocks.conflicts = [];
  mocks.preview = undefined;
  useLiveInteractionStore.setState({ epoch: "epoch-current", restoreRevision: 0, restorePending: false, reviewRevision: 0, pendingChanges: {} });
  mocks.connections = [{ id: randomUUID(), name: "Main", readOnly: false }, { id: randomUUID(), name: "Other", readOnly: false }];
  cards = Array.from({ length: 10 }, (_, index) => cardSchema.parse({
    id: randomUUID(), storyMapId: mapId, key: `MAP-${index + 1}`, title: `Selected Story ${index + 1}`,
    level: "story", parentId: null, releaseId: null, creationOrigin: "manual", provenance: "manual", position: index, version: 1, createdAt: "2026-10-17T00:00:00.000Z", updatedAt: "2026-10-17T00:00:00.000Z"
  }));
  cards.push(cardSchema.parse({ ...cards[0], id: randomUUID(), key: "MAP-11", title: "Selected Note", level: "note" }));
  mocks.plan.mockImplementation(async (request: PlanWorkItemSyncRequest) => request.mode === "import" ? { plan: { storyMapId: mapId, connectionId: request.connectionId, mode: "import", provider: "github", items: [] } } : { plan: pushPlan(request) });
  mocks.sync.mockResolvedValue(incoming());
  mocks.import.mockResolvedValue(incoming());
  mocks.pull.mockResolvedValue(incoming());
  mocks.confirm.mockImplementation(async (planId: string) => executedPlan(planId));
  mocks.resume.mockImplementation(async (planId: string) => executedPlan(planId));
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  vi.clearAllMocks();
  vi.unstubAllGlobals();
});
it("reviews every retained target including excluded Notes, and pushes precisely the reviewed eligible Cards", async () => {
  await render(cards.map((card) => card.id));
  const scope = host.querySelector('[aria-label="Selected Cards for GitHub"]')!;
  expect(scope.querySelectorAll("li")).toHaveLength(11);
  expect(scope.textContent).toContain("11 selected Cards; 10 eligible Cards");
  expect(scope.textContent).toContain("Selected Note — Excluded from push");
  expect(button(panelStrings.push).disabled).toBe(true);
  await click(panelStrings.plan);
  expect(mocks.plan.mock.calls[0]![0].cardIds).toEqual(cards.map((card) => card.id));
  expect(host.querySelectorAll(".github-dry-run")).toHaveLength(10);
  await click(panelStrings.push);
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
  expect(mocks.confirm.mock.calls[0]![0]).toBe([...plans.keys()][0]);
  expect(mocks.legacyPush).not.toHaveBeenCalled();
});
it("keeps whole-map and selected scope while separating incoming Sync review from outgoing plans", async () => {
  await render();
  await click(panelStrings.plan);
  expect(mocks.plan.mock.calls[0]![0].cardIds).toBeUndefined();
  await click(panelStrings.push);
  expect(plans.get(mocks.confirm.mock.calls[0]![0])?.selection.cardIds).toBeUndefined();
  await click(panelStrings.sync);
  expect(mocks.sync.mock.calls[0]![0]).toMatchObject({ apply: false });
  expect(mocks.sync.mock.calls[0]![0].cardIds).toBeUndefined();
  expect(mocks.plan).toHaveBeenCalledTimes(1);
  const ticked = cards[1]!;
  await act(async () => [...host.querySelectorAll<HTMLInputElement>(".card-pick-list input")].find((input) => input.parentElement?.textContent?.includes(ticked.key))!.click());
  await click(panelStrings.plan);
  expect(mocks.plan.mock.calls[1]![0].cardIds).toEqual([ticked.id]);
  await click(panelStrings.push);
  expect(plans.get(mocks.confirm.mock.calls[1]![0])?.selection.cardIds).toEqual([ticked.id]);
  await click(panelStrings.sync);
  expect(mocks.sync.mock.calls[1]![0]).toMatchObject({ apply: false, cardIds: [ticked.id] });
  expect(mocks.plan).toHaveBeenCalledTimes(2);
});
it.each(["empty", "note"])("never broadens an explicit %s selection", async (kind) => {
  await render(kind === "note" ? [cards[10]!.id] : []);
  expect(button(panelStrings.plan).disabled).toBe(true);
  expect(button(panelStrings.push).disabled).toBe(true);
  await click(panelStrings.plan);
  await click(panelStrings.push);
  expect(mocks.plan).not.toHaveBeenCalled();
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it("invalidates review when explicit scope or connection changes, including changing back", async () => {
  const selected = cards.slice(0, 2).map((card) => card.id);
  await render(selected);
  await click(panelStrings.plan);
  expect(button(panelStrings.push).disabled).toBe(false);
  await render([cards[0]!.id]);
  expect(button(panelStrings.push).disabled).toBe(true);
  await render(selected);
  expect(button(panelStrings.push).disabled).toBe(true);
  await click(panelStrings.plan);
  const connection = host.querySelector<HTMLSelectElement>(".github-form select")!;
  await act(async () => { connection.value = mocks.connections[1]!.id; connection.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(button(panelStrings.push).disabled).toBe(true);
  await click(panelStrings.push);
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it("cannot authorize push using an import preview", async () => {
  await render();
  await click(panelStrings.plan);
  expect(button(panelStrings.push).disabled).toBe(false);
  await click(panelStrings.previewImport);
  expect(button(panelStrings.push).disabled).toBe(true);
  await click(panelStrings.push);
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it.each(["import", "pull"] as const)("%s action sends apply:false and renders the incoming review", async (action) => {
  mocks.links = [{ id: randomUUID(), externalRefId: randomUUID(), connectionId: mocks.connections[0]!.id, provider: "github", cardId: cards[0]!.id, remoteId: "7", remoteNumber: 7, url: "https://github.com/owner/repo/issues/7", labels: [], managedLabels: [], syncState: "synced", parentOverrideLocal: false }];
  await render();
  await click(action === "import" ? panelStrings.previewImport : panelStrings.pullAllGitHubLinks);
  expect(mocks[action]).toHaveBeenCalledWith(expect.objectContaining({ apply: false }));
  expect(host.querySelector('[aria-label="Incoming GitHub changes"]')).not.toBeNull();
});
it("rejects a pending plan response after its selection changed", async () => {
  let finish!: (value: unknown) => void;
  mocks.plan.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render([cards[0]!.id]);
  await click(panelStrings.plan);
  await render([]);
  await act(async () => finish({ plan: { storyMapId: mapId, connectionId: mocks.connections[0]!.id, mode: "push", provider: "github", items: [] } }));
  expect(button(panelStrings.push).disabled).toBe(true);
  expect(host.querySelector(".github-dry-run-list")).toBeNull();
});
it("invalidates a reviewed request when release scope or Card versions change", async () => {
  await render([cards[0]!.id]);
  await click(panelStrings.plan);
  expect(button(panelStrings.push).disabled).toBe(false);
  cards = cards.map((card, index) => index === 0 ? { ...card, version: 2 } : card);
  await render([cards[0]!.id]);
  expect(button(panelStrings.push).disabled).toBe(true);
  await click(panelStrings.plan);
  const release = host.querySelectorAll<HTMLSelectElement>(".github-form select")[1]!;
  const option = document.createElement("option");
  option.value = randomUUID();
  release.append(option);
  await act(async () => { release.value = option.value; release.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(button(panelStrings.plan).disabled).toBe(false);
  expect(button(panelStrings.push).disabled).toBe(true);
  await click(panelStrings.push);
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it("retains the read-only connection guard for an explicit selected scope", async () => {
  mocks.connections[0]!.readOnly = true;
  await render([cards[0]!.id]);
  expect(button(panelStrings.plan).disabled).toBe(true);
  expect(button(panelStrings.push).disabled).toBe(true);
  await click(panelStrings.plan);
  expect(mocks.plan).not.toHaveBeenCalled();
});
it("omits broad operations and mutable scope controls from selected mode with the actual stylesheet", async () => {
  const style = document.createElement("style");
  style.textContent = readStylesheet(join(process.cwd(), "src/styles/global.css"));
  document.head.append(style);
  try {
    await render(cards.map((card) => card.id));
    for (const text of [panelStrings.pullAllGitHubLinks, panelStrings.previewImport, panelStrings.pull, panelStrings.sync]) expect(button(text)).toBeUndefined();
    expect(host.querySelector(".card-pick-list")).toBeNull();
    expect(host.querySelector('input[type="checkbox"]')).toBeNull();
    expect(host.querySelector('input[placeholder]')).toBeNull();
    expect(host.querySelector(".github-link-list")).toBeNull();
    expect(host.querySelector('select[aria-label="Sync State"]')).toBeNull();
    expect(button(panelStrings.useAsDefaultForThisStoryMap)).toBeUndefined();
    expect(getComputedStyle(host.querySelector(".github-form")!).display).toBe("grid");
    expect(button(panelStrings.plan)).toBeDefined(); expect(button(panelStrings.push)).toBeDefined();
  } finally { style.remove(); }
});
it("submits a delayed reviewed push once for same-tick repeated clicks", async () => {
  let finish!: (value: unknown) => void;
  mocks.confirm.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render([cards[0]!.id]);
  await click(panelStrings.plan);
  await act(async () => { button(panelStrings.push).click(); button(panelStrings.push).click(); });
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
  expect(button(panelStrings.plan).disabled).toBe(true);
  await act(async () => finish(executedPlan(mocks.confirm.mock.calls[0]![0])));
  expect(button(panelStrings.plan).disabled).toBe(false);
});
it("blocks Plan and Push while incoming Sync preparation is pending", async () => {
  let finish!: (value: unknown) => void;
  await render();
  await click(panelStrings.plan);
  mocks.sync.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => {
    button(panelStrings.sync).click(); button(panelStrings.sync).click();
    button(panelStrings.plan).click(); button(panelStrings.push).click();
  });
  expect(mocks.sync).toHaveBeenCalledTimes(1);
  expect(mocks.plan).toHaveBeenCalledTimes(1);
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(button(panelStrings.plan).disabled).toBe(true);
  await act(async () => finish(incoming()));
  expect(button(panelStrings.plan).disabled).toBe(false);
  expect(button(panelStrings.push).disabled).toBe(true);
});
it("hands real Toolbar retained hidden selection to the real panel with Project and map ownership", async () => {
  const projectId = randomUUID();
  const snapshot = storyMapSnapshotSchema.parse({
    storyMap: { id: mapId, projectId, name: "Owned selection map", version: 1, createdAt: cards[0]!.createdAt, updatedAt: cards[0]!.updatedAt },
    cards: [cards[0], cards[1], cards[10], cards[2]], releases: [], sourceLinks: [], cardDependencies: [],
    githubLinks: [], remoteWorkItemLinks: [], workflowStatuses: [], personas: [], cardPersonas: [], annotations: [], cardAnnotations: [], storyTemplates: []
  });
  let board!: StoryMapBoardState;
  function Fixture() {
    board = useStoryMapBoardState(snapshot, projectId);
    return createElement(BoardToolbar, { state: board });
  }
  const routeTree = createRootRoute({ component: Fixture });
  const testRouter = createRouter({ routeTree, history: createMemoryHistory({ initialEntries: ["/"] }) });
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router: testRouter })));
    await testRouter.load();
  });
  await act(async () => {
    board.setBulkSelectedIds(new Set([cards[0]!.id, cards[1]!.id, cards[10]!.id]));
    board.setFilters((value) => ({ ...value, search: cards[0]!.title }));
  });
  expect(board.selectedIds.size).toBe(3);
  expect(board.selectedVisibleIds.size).toBe(1);
  await click(storyMapStrings.selectedGitHubDryRun);
  const scope = document.body.querySelector('[aria-label="Selected Cards for GitHub"]')!;
  expect(scope.querySelectorAll("li")).toHaveLength(3);
  expect(scope.textContent).toContain(cards[0]!.title);
  expect(scope.textContent).toContain(cards[1]!.title);
  expect(scope.textContent).toContain("Selected Note — Excluded from push");
  expect(scope.textContent).not.toContain(cards[2]!.title);
  expect(mocks.connectionScope).toHaveBeenCalledWith(projectId);
  expect(mocks.privacyScope).toHaveBeenCalledWith(projectId);
  await act(async () => [...document.body.querySelectorAll("button")].find((item) => item.textContent?.trim() === panelStrings.plan)!.click());
  expect(mocks.plan.mock.calls[0]![0]).toEqual({ storyMapId: mapId, connectionId: mocks.connections[0]!.id,
    cardIds: [cards[0]!.id, cards[1]!.id, cards[10]!.id], releaseId: undefined, mode: "push" });
});

it("shows exact type, label diff, per-item links and resumes only the retained plan id", async () => {
  mocks.confirm.mockImplementationOnce(async (planId: string) => executedPlan(planId, "interrupted"));
  await render([cards[0]!.id, cards[1]!.id]);
  await click(panelStrings.plan);
  const plan = [...plans.values()][0]!;
  expect(host.textContent).toContain("Native Issue type: Task");
  expect(host.textContent).toContain("Add labels: reviewed");
  expect(host.textContent).toContain("Reviewed body");
  await click(remotePushStrings.confirm);
  expect(mocks.confirm.mock.calls[0]![0]).toBe(plan.id);
  expect(host.textContent).toContain("Succeeded");
  expect(host.textContent).toContain("Outcome uncertain");
  expect([...host.querySelectorAll<HTMLAnchorElement>('[aria-label="Remote effect results"] a')].map((link) => link.href)).toEqual(["https://github.com/owner/repo/issues/1", "https://github.com/owner/repo/issues/2"]);
  let finish!: (value: RemotePushPlanResponse) => void;
  mocks.resume.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await act(async () => { button(remotePushStrings.resume).click(); button(remotePushStrings.resume).click(); });
  expect(mocks.resume.mock.calls).toEqual([[plan.id]]);
  expect(mocks.plan).toHaveBeenCalledTimes(1);
  await act(async () => finish(executedPlan(plan.id)));
  expect(host.textContent).toContain(remotePushStrings.completed);
  expect(button(remotePushStrings.resume)).toBeUndefined();
});
it("permits a reviewed Milestone for an explicitly selected empty Release", async () => {
  cards = [];
  releases = [{ id: randomUUID(), storyMapId: mapId, version: 1, name: "Empty release", goal: "Reviewed Release goal", released: true, releaseDate: null, startDate: null, position: 0 }];
  await render();
  expect(button(panelStrings.plan).disabled).toBe(true);
  const select = host.querySelectorAll<HTMLSelectElement>(".github-form select")[1]!;
  await act(async () => { select.value = releases[0]!.id; select.dispatchEvent(new Event("change", { bubbles: true })); });
  expect(button(panelStrings.plan).disabled).toBe(false);
  await click(panelStrings.plan);
  expect(mocks.plan.mock.calls[0]![0].releaseId).toBe(releases[0]!.id);
  expect(host.querySelectorAll(".github-dry-run")).toHaveLength(1);
  expect(host.textContent).toContain("Create Milestone: Empty release");
  expect(host.textContent).toContain("Reviewed Release goal");
  await click(panelStrings.push);
  expect(mocks.confirm).toHaveBeenCalledTimes(1);
});
it("rejects a late old-epoch plan after lower-version Restore and refuses same-tick stale confirmation", async () => {
  cards[0] = { ...cards[0]!, version: 3 };
  let finish!: (value: { plan: RemotePushPlan }) => void;
  mocks.plan.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render([cards[0]!.id]);
  await click(panelStrings.plan);
  const oldPlan = pushPlan(mocks.plan.mock.calls[0]![0]);
  await act(async () => {
    useLiveInteractionStore.getState().recordEpoch("restored-epoch");
    button(panelStrings.push).click();
  });
  cards[0] = { ...cards[0]!, version: 1 };
  await render([cards[0]!.id]);
  await act(async () => useLiveInteractionStore.setState({ epoch: "restored-epoch", restorePending: false }));
  await act(async () => finish({ plan: oldPlan }));
  expect(host.querySelector(".github-dry-run-list")).toBeNull();
  expect(button(panelStrings.push).disabled).toBe(true);
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it("ignores late execution success from a replaced database epoch", async () => {
  let finish!: (value: RemotePushPlanResponse) => void;
  mocks.confirm.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render([cards[0]!.id]);
  await click(panelStrings.plan);
  const id = [...plans.keys()][0]!;
  await click(panelStrings.push);
  await act(async () => { useLiveInteractionStore.getState().recordEpoch("replacement"); useLiveInteractionStore.getState().finishEpoch("replacement"); });
  await act(async () => finish(executedPlan(id)));
  expect(host.querySelector('[aria-label="Remote effect results"]')).toBeNull();
  expect(host.textContent).not.toContain(remotePushStrings.completed);
  expect(button(panelStrings.push).disabled).toBe(true);
});
it("refuses both confirmation buttons for an actionable blocked plan", async () => {
  mocks.plan.mockImplementationOnce(async (request: PlanWorkItemSyncRequest) => ({ plan: { ...pushPlan(request), blockers: ['Create the configured label "reviewed" in the GitHub repository.'] } }));
  await render([cards[0]!.id]);
  await click(panelStrings.plan);
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Create the configured label");
  await act(async () => { button(panelStrings.push).click(); button(remotePushStrings.confirm).click(); });
  expect(mocks.confirm).not.toHaveBeenCalled();
});


async function loadSavedPlan(id: string) {
  const input = [...host.querySelectorAll("label")].find((label) => label.textContent === remotePushStrings.savedPlanId)!.querySelector<HTMLInputElement>("input")!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, id);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await click(remotePushStrings.readPlan);
}
it("loads a persisted interrupted plan after reopening and resumes the same exact id", async () => {
  const plan = pushPlan({ storyMapId: mapId, connectionId: mocks.connections[0]!.id, cardIds: [cards[0]!.id], mode: "push" });
  mocks.read.mockResolvedValueOnce(executedPlan(plan.id, "interrupted"));
  await render([cards[0]!.id]);
  await loadSavedPlan(plan.id);
  expect(mocks.read.mock.calls).toEqual([[plan.id]]);
  expect(host.textContent).toContain("Reviewed body");
  expect(mocks.plan).not.toHaveBeenCalled();
  expect(mocks.confirm).not.toHaveBeenCalled();
  await click(remotePushStrings.resume);
  expect(mocks.resume.mock.calls).toEqual([[plan.id]]);
});
it.each(["project", "map", "connection", "epoch", "selection"])("refuses a saved plan with foreign %s before confirmation or resume", async (field) => {
  const plan = pushPlan({ storyMapId: mapId, connectionId: mocks.connections[0]!.id, cardIds: [cards[0]!.id], mode: "push" });
  if (field === "project") plan.projectId = randomUUID();
  if (field === "map") plan.storyMapId = randomUUID();
  if (field === "connection") plan.connectionId = mocks.connections[1]!.id;
  if (field === "epoch") plan.epoch = "old-epoch";
  if (field === "selection") plan.selection.cardIds = [cards[1]!.id];
  mocks.read.mockResolvedValueOnce(executedPlan(plan.id, "interrupted"));
  await render([cards[0]!.id]);
  await loadSavedPlan(plan.id);
  expect(host.textContent).toContain(remotePushStrings.scopeChanged);
  expect(button(remotePushStrings.resume)).toBeUndefined();
  expect(button(remotePushStrings.confirm)).toBeUndefined();
  expect(button(panelStrings.push).disabled).toBe(true);
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.resume).not.toHaveBeenCalled();
});

it.each(["whole-map", "different-checkbox", "release"])("refuses a saved plan that differs from the current %s controls", async (scope) => {
  releases = [{ id: randomUUID(), storyMapId: mapId, version: 1, name: "Selected release", goal: "", released: false, releaseDate: null, startDate: null, position: 0 }];
  const plan = pushPlan({ storyMapId: mapId, connectionId: mocks.connections[0]!.id, ...(scope === "different-checkbox" ? { cardIds: [cards[1]!.id] } : {}), mode: "push" });
  mocks.read.mockResolvedValueOnce(executedPlan(plan.id, "interrupted"));
  await render();
  if (scope === "release") {
    const select = host.querySelectorAll<HTMLSelectElement>(".github-form select")[1]!;
    await act(async () => { select.value = releases[0]!.id; select.dispatchEvent(new Event("change", { bubbles: true })); });
  } else await act(async () => host.querySelector<HTMLInputElement>(".card-pick-list input")!.click());
  await loadSavedPlan(plan.id);
  expect(host.textContent).toContain(remotePushStrings.scopeChanged);
  expect(button(remotePushStrings.resume)).toBeUndefined();
  expect(button(remotePushStrings.confirm)).toBeUndefined();
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.resume).not.toHaveBeenCalled();
});
it("loads only a plan matching current checkbox and Release scope and drops it when that scope changes", async () => {
  releases = [{ id: randomUUID(), storyMapId: mapId, version: 1, name: "Selected release", goal: "", released: false, releaseDate: null, startDate: null, position: 0 }];
  const plan = pushPlan({ storyMapId: mapId, connectionId: mocks.connections[0]!.id, cardIds: [cards[0]!.id], releaseId: releases[0]!.id, mode: "push" });
  mocks.read.mockResolvedValueOnce(executedPlan(plan.id, "interrupted"));
  await render();
  const select = host.querySelectorAll<HTMLSelectElement>(".github-form select")[1]!;
  await act(async () => {
    host.querySelector<HTMLInputElement>(".card-pick-list input")!.click();
    select.value = releases[0]!.id; select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await loadSavedPlan(plan.id);
  expect(button(remotePushStrings.resume)).toBeDefined();
  await act(async () => host.querySelector<HTMLInputElement>(".card-pick-list input")!.click());
  expect(button(remotePushStrings.resume)).toBeUndefined();
  expect(mocks.resume).not.toHaveBeenCalled();
});
it("uses incoming-safe Sync preparation for a quick linked Card action", async () => {
  mocks.links = [{ id: randomUUID(), externalRefId: randomUUID(), connectionId: mocks.connections[0]!.id, provider: "github", cardId: cards[0]!.id, remoteId: "7", remoteNumber: 7, url: "https://github.com/owner/repo/issues/7", labels: [], managedLabels: [], syncState: "unsynced", parentOverrideLocal: false }];
  await render();
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>(".github-link-row button")].find((item) => item.textContent === panelStrings.sync)!.click());
  expect(mocks.sync.mock.calls[0]![0]).toEqual({ storyMapId: mapId, connectionId: mocks.connections[0]!.id, cardIds: [cards[0]!.id], confirm: true, apply: false });
  expect(host.querySelector('[aria-label="Incoming GitHub changes"]')).not.toBeNull();
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.plan).not.toHaveBeenCalled();
});
it("discards a late incoming review after Restore changes epoch", async () => {
  let finish!: (value: unknown) => void;
  mocks.sync.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render();
  await click(panelStrings.sync);
  await act(async () => useLiveInteractionStore.setState({ epoch: "restored-epoch", restorePending: false }));
  await act(async () => finish(incoming()));
  expect(host.querySelector('[aria-label="Incoming GitHub changes"]')).toBeNull();
  expect(mocks.plan).not.toHaveBeenCalled();
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it("refuses confirmation when checkbox scope changes in the same event", async () => {
  await render();
  await click(panelStrings.plan);
  const confirm = button(remotePushStrings.confirm);
  await act(async () => { host.querySelector<HTMLInputElement>(".card-pick-list input")!.click(); confirm.click(); });
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(host.querySelector('[aria-label="GitHub Dry Run"]')).toBeNull();
});
it("refuses saved-plan resume when Release scope changes in the same event", async () => {
  releases = [{ id: randomUUID(), storyMapId: mapId, version: 1, name: "New scope", goal: "", released: false, releaseDate: null, startDate: null, position: 0 }];
  const plan = pushPlan({ storyMapId: mapId, connectionId: mocks.connections[0]!.id, mode: "push" });
  mocks.read.mockResolvedValueOnce(executedPlan(plan.id, "interrupted"));
  await render();
  await loadSavedPlan(plan.id);
  const resume = button(remotePushStrings.resume);
  const select = host.querySelectorAll<HTMLSelectElement>(".github-form select")[1]!;
  await act(async () => { select.value = releases[0]!.id; select.dispatchEvent(new Event("change", { bubbles: true })); resume.click(); });
  expect(mocks.resume).not.toHaveBeenCalled();
});
it("refuses a saved Unscheduled-only plan while the current Release scope is All", async () => {
  const plan = pushPlan({ storyMapId: mapId, connectionId: mocks.connections[0]!.id, mode: "push" });
  plan.selection.releaseId = null;
  mocks.read.mockResolvedValueOnce(executedPlan(plan.id, "interrupted"));
  await render();
  await loadSavedPlan(plan.id);
  expect(host.textContent).toContain(remotePushStrings.scopeChanged);
  expect(button(remotePushStrings.resume)).toBeUndefined();
  expect(button(remotePushStrings.confirm)).toBeUndefined();
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(mocks.resume).not.toHaveBeenCalled();
});

function conflictFixture(connectionId = mocks.connections[0]!.id): SyncConflict {
  return syncConflictSchema.parse({ id: randomUUID(), externalRefId: randomUUID(), syncRunId: randomUUID(), connectionId, cardId: cards[0]!.id, remoteId: "7", field: "title", localValue: "Reviewed local title", remoteValue: "Reviewed GitHub title", createdAt: cards[0]!.createdAt });
}
it("shows captured values and prepares the incoming ChangeSet for Keep remote without applying it", async () => {
  mocks.conflicts = [conflictFixture()];
  const command = incoming();
  mocks.resolve.mockResolvedValue(command);
  await render();
  expect(host.textContent).toContain("Reviewed local title");
  expect(host.textContent).toContain("Reviewed GitHub title");
  await click(panelStrings.keepRemote);
  expect(mocks.resolve).toHaveBeenCalledWith(mocks.conflicts[0]!.id, { storyMapId: mapId, resolution: "remote", reviewed: { localValue: "Reviewed local title", remoteValue: "Reviewed GitHub title" }, apply: false });
  expect(host.querySelector('[aria-label="Incoming GitHub changes"]')).not.toBeNull();
  expect(document.activeElement?.textContent).toBe("Incoming GitHub changes");
  expect(host.querySelector('[aria-label="GitHub Dry Run"]')).toBeNull();
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it("opens the exact local choice Dry Run in the conflict's actual Card and connection scope", async () => {
  const connectionId = mocks.connections[1]!.id;
  mocks.conflicts = [conflictFixture(connectionId)];
  mocks.resolve.mockResolvedValue({ plan: pushPlan({ storyMapId: mapId, connectionId, cardIds: [cards[0]!.id], mode: "push" }), execution: { status: "reviewed", items: [] } });
  await render();
  await click(panelStrings.keepLocal);
  expect(mocks.resolve).toHaveBeenCalledWith(mocks.conflicts[0]!.id, { storyMapId: mapId, resolution: "local", reviewed: { localValue: "Reviewed local title", remoteValue: "Reviewed GitHub title" }, apply: false });
  expect(host.querySelector('[aria-label="GitHub Dry Run"]')).not.toBeNull();
  expect(mocks.confirm).not.toHaveBeenCalled();
  await click(remotePushStrings.confirm);
  expect(mocks.confirm).toHaveBeenCalledWith([...plans.keys()][0]);
});
it("uses the disputed connection's read-only policy and permits remote choice", async () => {
  mocks.connections[1]!.readOnly = true;
  mocks.conflicts = [conflictFixture(mocks.connections[1]!.id)];
  mocks.resolve.mockResolvedValue(incoming());
  await render();
  expect(button(panelStrings.keepLocal).disabled).toBe(true);
  expect(button(panelStrings.keepRemote).disabled).toBe(false);
  expect(host.textContent).toContain(syncConflictStrings.readOnly);
  await click(panelStrings.keepLocal);
  expect(mocks.resolve).not.toHaveBeenCalled();
  await click(panelStrings.keepRemote);
  expect(mocks.resolve).toHaveBeenCalledTimes(1);
});
it("requires deliberate re-review after drift and sends the newly displayed evidence only on renewed choice", async () => {
  const conflict = conflictFixture();
  mocks.conflicts = [conflict];
  mocks.resolve.mockRejectedValueOnce(new ConflictError("Review current values.", [{ reason: "fingerprint", operationId: conflict.id, index: 0, entity: "card", id: conflict.cardId!, current: { ...conflict, localValue: "Changed local", remoteValue: "Changed GitHub" }, message: "Review current values." }])).mockResolvedValue(incoming());
  await render();
  await click(panelStrings.keepRemote);
  expect(host.textContent).toContain(syncConflictStrings.drift);
  expect(document.activeElement?.textContent).toContain(syncConflictStrings.drift);
  expect(button(panelStrings.keepRemote).disabled).toBe(true);
  expect(host.textContent).toContain("Changed GitHub");
  await click(syncConflictStrings.reviewCurrent);
  expect(mocks.resolve).toHaveBeenCalledTimes(1);
  expect(host.textContent).toContain(syncConflictStrings.original);
  expect(document.activeElement).toBe(button(panelStrings.keepLocal));
  await click(panelStrings.keepRemote);
  expect(mocks.resolve.mock.calls[1]![1].reviewed).toEqual({ localValue: "Changed local", remoteValue: "Changed GitHub" });
});
it("holds and excludes sibling actions while resolving and rejects a late pre-Restore result", async () => {
  mocks.conflicts = [conflictFixture()];
  let finish!: (value: unknown) => void;
  mocks.resolve.mockImplementationOnce(() => new Promise((resolve) => { finish = resolve; }));
  await render();
  await act(async () => { button(panelStrings.keepRemote).click(); button(panelStrings.keepRemote).click(); button(panelStrings.plan).click(); });
  expect(mocks.resolve).toHaveBeenCalledTimes(1);
  expect(mocks.plan).not.toHaveBeenCalled();
  expect(host.querySelector('[data-live-suspended-draft]')).not.toBeNull();
  expect(button(panelStrings.keepLocal).disabled).toBe(true);
  await act(async () => useLiveInteractionStore.setState({ epoch: "restored-epoch", restorePending: false }));
  await act(async () => finish(incoming()));
  expect(host.querySelector('[aria-label="Incoming GitHub changes"]')).toBeNull();
  expect(host.querySelector('[data-live-suspended-draft]')).toBeNull();
});
it("keeps the exact quick-Card scope for a separately requested outgoing plan after incoming Apply", async () => {
  const command = incoming();
  mocks.sync.mockResolvedValue(command);
  const changeSet = { ...command.changeSet, status: "applied" as const };
  mocks.preview = { changeSet, presentationStatus: "applied", closed: true, selectedOperationIds: [], conflicts: [], boards: [], canApprove: false, canApply: false, operations: [] };
  mocks.links = [{ id: randomUUID(), externalRefId: randomUUID(), connectionId: mocks.connections[0]!.id, provider: "github", cardId: cards[0]!.id, remoteId: "7", remoteNumber: 7, url: "https://github.com/owner/repo/issues/7", labels: [], syncState: "unsynced", parentOverrideLocal: false }];
  await render();
  await act(async () => [...host.querySelectorAll<HTMLButtonElement>(".github-link-row button")].find((item) => item.textContent === panelStrings.sync)!.click());
  expect(mocks.plan).not.toHaveBeenCalled();
  await vi.waitFor(() => expect(host.querySelector("[data-live-suspended-draft]")).toBeNull());
  await click("Prepare outgoing Dry Run");
  expect(mocks.plan.mock.calls[0]![0]).toMatchObject({ mode: "sync", cardIds: [cards[0]!.id] });
  expect(host.querySelector('[aria-label="GitHub Dry Run"]')).not.toBeNull();
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it("shows failed and not-attempted preparation rows and allows a fresh incoming retry", async () => {
  mocks.sync.mockRejectedValueOnce(new IncomingGitHubError("Provider preparation failed.", 400, [
    { status: "failed", cardId: cards[0]!.id, remoteId: "7", code: "validation", message: "Provider unavailable.", details: { phase: "prepare" } },
    { status: "not_attempted", cardId: cards[1]!.id, remoteId: "8", message: "An earlier preparation failed." }
  ]));
  await render();
  await click(panelStrings.sync);
  const results = host.querySelector('[aria-label="Preparation results"]')!;
  expect(results.querySelectorAll("li")).toHaveLength(2);
  expect(results.textContent).toContain("Failed 7");
  expect(results.textContent).toContain("Not attempted 8");
  expect(results.textContent).toContain("An earlier preparation failed.");
  expect(host.querySelector('[aria-label="Incoming GitHub changes"]')).toBeNull();
  expect(mocks.plan).not.toHaveBeenCalled();
  await click(panelStrings.sync);
  expect(mocks.sync).toHaveBeenCalledTimes(2);
  expect(host.querySelector('[aria-label="Incoming GitHub changes"]')).not.toBeNull();
  expect(host.textContent).not.toContain("Provider unavailable.");
});
it("ignores a late incoming preparation failure after the database epoch changes", async () => {
  let fail!: (error: Error) => void;
  mocks.sync.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
  await render();
  await click(panelStrings.sync);
  await act(async () => useLiveInteractionStore.setState({ epoch: "replacement-epoch", restorePending: false }));
  await act(async () => fail(new IncomingGitHubError("Stale provider failure.", 400, [{ status: "failed", remoteId: "7", code: "validation", message: "Stale item.", details: { phase: "prepare" } }])));
  expect(host.textContent).not.toContain("Stale provider failure.");
  expect(host.querySelector('[aria-label="Preparation results"]')).toBeNull();
});
it("retains deleted local identities and GitHub navigation without pretending the Card still exists", async () => {
  const entityId = randomUUID();
  mocks.deletedLocalLinks = [{ id: randomUUID(), externalRefId: randomUUID(), storyMapId: mapId, entityType: "card", entityId, url: "https://github.com/fixture/repo/issues/99", syncState: "local_deleted" }];
  await render();
  expect(host.textContent).toContain(syncConflictStrings.deletedLocal("card", entityId));
  const row = [...host.querySelectorAll(".github-link-row")].find((row) => row.textContent?.includes(entityId))!;
  expect(row.querySelector<HTMLAnchorElement>("a")!.href).toBe("https://github.com/fixture/repo/issues/99");
  expect(row.querySelector("button")).toBeNull();
  expect(row.querySelectorAll("a")).toHaveLength(1);
});
it("cancels a local resolution Dry Run without confirming and releases its live hold", async () => {
  mocks.conflicts = [conflictFixture()];
  mocks.resolve.mockResolvedValue({ plan: pushPlan({ storyMapId: mapId, connectionId: mocks.connections[0]!.id, cardIds: [cards[0]!.id], mode: "push" }), execution: { status: "reviewed", items: [] } });
  await render();
  await click(panelStrings.keepLocal);
  const confirm = button(remotePushStrings.confirm);
  await act(async () => { button(remotePushStrings.cancel).click(); confirm.click(); });
  expect(host.querySelector('[aria-label="GitHub Dry Run"]')).toBeNull();
  expect(host.querySelector('[data-live-suspended-draft]')).toBeNull();
  expect(mocks.confirm).not.toHaveBeenCalled();
  expect(host.textContent).toContain("Reviewed GitHub title");
});
it("ignores a late confirmation failure from the previous database epoch", async () => {
  let fail!: (error: Error) => void;
  mocks.confirm.mockImplementationOnce(() => new Promise((_resolve, reject) => { fail = reject; }));
  await render([cards[0]!.id]);
  await click(panelStrings.plan);
  await click(remotePushStrings.confirm);
  await act(async () => useLiveInteractionStore.setState({ epoch: "replacement-epoch", restorePending: false }));
  await act(async () => fail(new Error("Old database confirmation failed.")));
  expect(host.textContent).not.toContain("Old database confirmation failed.");
  expect(host.querySelector('[aria-label="Remote effect results"]')).toBeNull();
});
it("never resurrects an incoming review after external selection changes away and back", async () => {
  await render();
  await click(panelStrings.sync);
  expect(host.querySelector('[aria-label="Incoming GitHub changes"]')).not.toBeNull();
  await render([cards[0]!.id]);
  await render();
  expect(host.querySelector('[aria-label="Incoming GitHub changes"]')).toBeNull();
});
it("names two same-field conflict rows by Card and canonical Issue and resolves the chosen identity", async () => {
  const first = conflictFixture();
  const second = { ...conflictFixture(), cardId: cards[1]!.id, remoteId: "8", remoteValue: "Second GitHub title" };
  mocks.conflicts = [first, second];
  mocks.links = [first, second].map((conflict, index) => ({ id: randomUUID(), externalRefId: conflict.externalRefId, connectionId: conflict.connectionId, provider: "github", cardId: conflict.cardId!, remoteId: conflict.remoteId!, remoteNumber: index + 7, url: `https://github.com/fixture/repo/issues/${index + 7}`, labels: [], syncState: "conflict", parentOverrideLocal: false }));
  mocks.resolve.mockResolvedValue(incoming());
  await render();
  for (const [index, conflict] of mocks.conflicts.entries()) {
    const card = cards[index]!;
    const row = host.querySelector<HTMLElement>(`[aria-label="${syncConflictStrings.reviewCard(card.key, card.title)}"]`)!;
    expect(row.textContent).toContain(`${card.key} ${card.title}`);
    const link = row.querySelector<HTMLAnchorElement>(`[aria-label="${syncConflictStrings.openIssueForCard(card.key, index + 7)}"]`)!;
    expect(link.href).toBe(`https://github.com/fixture/repo/issues/${index + 7}`);
    if (conflict.id === second.id) await act(async () => [...row.querySelectorAll<HTMLButtonElement>("button")].find((button) => button.textContent === panelStrings.keepRemote)!.click());
  }
  expect(mocks.resolve).toHaveBeenCalledTimes(1);
  expect(mocks.resolve).toHaveBeenCalledWith(second.id, { storyMapId: mapId, resolution: "remote", reviewed: { localValue: second.localValue, remoteValue: second.remoteValue }, apply: false });
});
it.each(["plan", "local"] as const)("returns focus to the connected %s initiator after Dry Run Cancel", async (kind) => {
  if (kind === "local") {
    mocks.conflicts = [conflictFixture()];
    mocks.resolve.mockResolvedValue({ plan: pushPlan({ storyMapId: mapId, connectionId: mocks.connections[0]!.id, cardIds: [cards[0]!.id], mode: "push" }), execution: { status: "reviewed", items: [] } });
  }
  await render();
  const origin = button(kind === "plan" ? panelStrings.plan : panelStrings.keepLocal);
  await act(async () => { origin.focus(); origin.click(); });
  expect(document.activeElement).toBe(host.querySelector('.github-dry-run-list h3'));
  const cancel = button(remotePushStrings.cancel);
  await act(async () => { cancel.focus(); cancel.click(); });
  expect(document.activeElement).toBe(origin);
  expect(host.querySelector('.github-dry-run-list')).toBeNull();
  expect(mocks.confirm).not.toHaveBeenCalled();
});
it.each(["plan", "local"] as const)("does not reclaim focus from another control when %s Dry Run Cancel is invoked", async (kind) => {
  if (kind === "local") {
    mocks.conflicts = [conflictFixture()];
    mocks.resolve.mockResolvedValue({ plan: pushPlan({ storyMapId: mapId, connectionId: mocks.connections[0]!.id, cardIds: [cards[0]!.id], mode: "push" }), execution: { status: "reviewed", items: [] } });
  }
  await render();
  const origin = button(kind === "plan" ? panelStrings.plan : panelStrings.keepLocal);
  await act(async () => { origin.focus(); origin.click(); });
  const other = host.querySelector<HTMLInputElement>('.github-form input')!;
  other.focus();
  await act(async () => button(remotePushStrings.cancel).click());
  expect(document.activeElement).toBe(other);
});
it.each([["scope", "plan"], ["epoch", "plan"], ["scope", "local"], ["epoch", "local"]] as const)("does not restore Dry Run focus after %s invalidation for %s", async (kind, source) => {
  if (source === "local") {
    mocks.conflicts = [conflictFixture()];
    mocks.resolve.mockResolvedValue({ plan: pushPlan({ storyMapId: mapId, connectionId: mocks.connections[0]!.id, cardIds: [cards[0]!.id], mode: "push" }), execution: { status: "reviewed", items: [] } });
  }
  await render();
  const origin = button(source === "plan" ? panelStrings.plan : panelStrings.keepLocal);
  await act(async () => { origin.focus(); origin.click(); });
  const cancel = button(remotePushStrings.cancel);
  const other = host.querySelector<HTMLInputElement>('.github-form input')!;
  other.focus();
  await act(async () => {
    if (kind === "epoch") useLiveInteractionStore.setState({ epoch: "restored-focus", restorePending: false });
    else {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(other, "Changed scope");
      other.dispatchEvent(new Event("input", { bubbles: true }));
    }
    cancel.click();
  });
  expect(document.activeElement).toBe(other);
  expect(host.querySelector('.github-dry-run-list')).toBeNull();
  expect(mocks.confirm).not.toHaveBeenCalled();
});
