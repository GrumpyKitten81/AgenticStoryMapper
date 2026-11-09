// @vitest-environment jsdom // REQ FR-49
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, Outlet, RouterProvider } from "@tanstack/react-router";
import { storyMapSnapshotSchema, type StoryMapSnapshot } from "@storymapper/contracts";
import { appStrings, panelStrings } from "@storymapper/ui-strings";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { router } from "@storymapper/web/app/router";

vi.mock("@storymapper/web/app/routes/RootLayout", () => ({ RootLayout: () => createElement(Outlet) }));

const projectId = randomUUID();
const mapId = randomUUID();
const releaseId = randomUUID();
let snapshot: StoryMapSnapshot;
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let requests: Array<{ path: string; method: string }>;

function fixture(): StoryMapSnapshot {
  const now = "2026-10-04T10:00:00.000Z";
  const base = { creationOrigin: "manual", provenance: "manual", version: 1, storyMapId: mapId, releaseId: null, position: 0, createdAt: now, updatedAt: now };
  const archivedId = randomUUID();
  const archivedStepId = randomUUID();
  const parkedId = randomUUID();
  const parkedStepId = randomUUID();
  const visibleId = randomUUID();
  const hiddenId = randomUUID();
  const parkedStoryId = randomUUID();
  const archivedStoryId = randomUUID();
  const remoteBase = { provider: "github", connectionId: randomUUID(), url: "https://github.com/fixture/repo/issues/1", labels: [] };
  const remoteLinks = [
    { ...remoteBase, id: randomUUID(), cardId: visibleId, remoteId: "1", syncState: "synced" },
    { ...remoteBase, id: randomUUID(), cardId: hiddenId, remoteId: "2", syncState: "unsynced" },
    { ...remoteBase, id: randomUUID(), cardId: parkedStoryId, remoteId: "3", syncState: "stale" },
    { ...remoteBase, id: randomUUID(), cardId: archivedStoryId, remoteId: "4", syncState: "unsynced" },
    { ...remoteBase, id: randomUUID(), releaseId, remoteId: "release", syncState: "unsynced" }
  ].map((link, index) => ({ ...link, externalRefId: randomUUID(), remoteNumber: index + 1, remoteId: String(index + 1), url: `https://github.com/fixture/repo/${"releaseId" in link ? "milestone" : "issues"}/${index + 1}` }));
  return storyMapSnapshotSchema.parse({
    storyMap: { version: 1, id: mapId, projectId, name: "Visible sync inventory", createdAt: now, updatedAt: now },
    cards: [
      { ...base, id: archivedId, parentId: null, key: "MAP-1", level: "activity", title: "Archived Activity", status: "archived" },
      { ...base, id: archivedStepId, parentId: archivedId, key: "MAP-2", level: "step", title: "Archived descendant Step" },
      { ...base, id: hiddenId, parentId: archivedStepId, key: "MAP-3", level: "story", title: "Archived descendant Story" },
      { ...base, id: parkedId, parentId: null, key: "MAP-4", level: "activity", title: "Parked Activity", parked: true },
      { ...base, id: parkedStepId, parentId: parkedId, key: "MAP-5", level: "step", title: "Parked descendant Step" },
      { ...base, id: parkedStoryId, parentId: parkedStepId, key: "MAP-6", level: "story", title: "Parked descendant Story" },
      { ...base, id: archivedStoryId, parentId: null, key: "MAP-7", level: "story", title: "Explicitly archived Story", status: "archived" },
      { ...base, id: visibleId, parentId: null, key: "MAP-8", level: "story", title: "Visible Story" }
    ],
    releases: [{ ...base, id: releaseId, name: "Delivery", position: 0, startDate: "2026-10-01", releaseDate: "2026-10-31" }],
    sourceLinks: [], cardDependencies: [], remoteWorkItemLinks: remoteLinks,
    githubLinks: remoteLinks.map((link) => ({ id: link.externalRefId, issueNumber: "cardId" in link ? link.remoteNumber : undefined, cardId: "cardId" in link ? link.cardId : undefined, releaseId: "releaseId" in link ? link.releaseId : undefined, repo: "fixture/repo", url: link.url, syncState: link.syncState })),
    workflowStatuses: [], personas: [], cardPersonas: [], annotations: [], cardAnnotations: [], storyTemplates: []
  });
}

async function mount(view: "tree" | "github") {
  router.update({ history: createMemoryHistory({ initialEntries: [`/projects/${projectId}/story-maps/${mapId}/${view}`] }) });
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
    await router.load();
  });
  await vi.waitFor(async () => {
    await act(async () => {});
    expect(host.querySelector(".story-map-shell")).not.toBeNull();
    expect(host.textContent).toContain("Visible Story");
  });
}

beforeEach(() => {
  localStorage.clear();
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  snapshot = fixture();
  requests = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    requests.push({ path, method: init?.method ?? "GET" });
    let value: unknown;
    if (path === `/api/story-maps/${mapId}`) value = snapshot;
    else if (path === `/api/story-maps?projectId=${projectId}`) value = { storyMaps: [snapshot.storyMap] };
    else if (path === `/api/source-documents?projectId=${projectId}`) value = { documents: [] };
    else if (path === `/api/connectors/connections?projectId=${projectId}`) value = { connections: [] };
    else if (path === `/api/settings/safety?projectId=${projectId}`) value = { settings: { projectId, agentMode: "apply", github: false, updatedAt: "2026-10-19T00:00:00.000Z" } };
    else if (path === `/api/sync/work-items/health?storyMapId=${mapId}`) value = {
      storyMapId: mapId, totalLinks: 2,
      links: snapshot.remoteWorkItemLinks.filter((link) => link.remoteId === "1" || Boolean(link.releaseId)),
      stateCounts: { synced: 1, unsynced: 1, stale: 0, conflict: 0, remote_deleted: 0, local_deleted: 0 },
      openConflicts: [], staleLinks: [], deletedLinks: []
    };
    else throw new Error(`Unexpected test request: ${path}`);
    return new Response(JSON.stringify(value), { headers: { "content-type": "application/json" } });
  }));
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it("keeps Release-owned toolbar links and their pending count while excluding hidden Card links", async () => {
  await mount("tree");
  const pull = host.querySelector<HTMLButtonElement>(`button[aria-label="${appStrings.pullGithub}"]`)!;
  expect(pull.title).toBe(`${appStrings.githubLinksHint(2, 1)} ${appStrings.pullGithubHint(2)}`);
  expect(pull.disabled).toBe(false);
  expect(snapshot.remoteWorkItemLinks).toHaveLength(5);
  expect(requests.every((request) => request.method === "GET" && request.path.startsWith("/api/"))).toBe(true);
});

it("hides the toolbar pull when only hidden Card links remain", async () => {
  const visibleCardId = snapshot.cards.find((card) => card.title === "Visible Story")!.id;
  snapshot.remoteWorkItemLinks = snapshot.remoteWorkItemLinks.filter((link) => link.cardId && link.cardId !== visibleCardId);
  await mount("tree");
  expect(host.querySelector(`button[aria-label="${appStrings.pullGithub}"]`)).toBeNull();
  expect(snapshot.remoteWorkItemLinks).toHaveLength(3);
});

it("offers only visible Stories in the routed sync picker and retains Release-owned canonical counts", async () => {
  await mount("github");
  const picker = host.querySelector(".card-pick-list")!;
  expect(picker.querySelectorAll('input[type="checkbox"]')).toHaveLength(1);
  expect(picker.textContent).toBe("MAP-8 Visible Story");
  const legacyCount = [...host.querySelectorAll(".github-health-grid > div")].find((item) => item.querySelector("span")?.textContent === panelStrings.legacyLinks)!;
  expect(legacyCount.querySelector("strong")?.textContent).toBe("2");
  expect(snapshot.cards).toHaveLength(8);
  expect(snapshot.githubLinks).toHaveLength(5);
  expect(requests.every((request) => request.method === "GET" && request.path.startsWith("/api/"))).toBe(true);
});
