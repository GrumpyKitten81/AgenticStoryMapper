// @vitest-environment jsdom // REQ Story 6.1
import { act, createElement } from "react";
import axe from "axe-core";
import { getByRole } from "@testing-library/dom";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { StoryMapViewPath } from "@storymapper/web/app/story-map-view-paths";
import { router } from "@storymapper/web/app/router";
import { useActiveStoryMapStore } from "@storymapper/web/app/stores/active-story-map-store";

const state = vi.hoisted(() => ({
  maps: [{ id: "map", projectId: "project", name: "Map One" }], owner: "project",
  availability: undefined as Promise<void> | undefined, availabilityError: false, snapshotError: false,
  personasEnabled: true, sourcesEnabled: true, releasesEnabled: true, roadmapsEnabled: true,
  regularViews: undefined as StoryMapViewPath[] | undefined,
  requests: [] as Array<{ path: string; body?: Record<string, unknown> }>
}));
vi.mock("@storymapper/web/app/feature-flags", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@storymapper/web/app/feature-flags")>();
  return {
  ...actual,
  get enabledStoryMapViews() { return state.regularViews ?? actual.enabledStoryMapViews; },
  get isPersonasEnabled() { return state.personasEnabled; },
  get isSourcesViewEnabled() { return state.sourcesEnabled; },
  get isReleasesViewEnabled() { return state.releasesEnabled; },
  get isRoadmapsViewEnabled() { return state.roadmapsEnabled; }
  };
});
vi.mock("@storymapper/web/app/api", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@storymapper/web/app/api")>();
  return {
    api: actual.api, useCustomization: actual.useCustomization, useWorkItemSyncHealth: actual.useWorkItemSyncHealth, useConnectorConnections: actual.useConnectorConnections,
    useStoryMaps: actual.useStoryMaps, useStoryMap: actual.useStoryMap, useMcpHostConfigs: actual.useMcpHostConfigs,
    useApiHealth: () => ({}),
    useProjects: () => ({ data: { projects: [{ id: "project", name: "Project" }, { id: "other", name: "Other" }] } }),
    useSafetySettings: () => ({ data: { settings: { agentMode: "apply", github: false } } })
  };
});
vi.mock("@storymapper/web/app/live/useLiveUpdates", () => ({ useLiveUpdates: () => ({ connection: "connected" }) }));
vi.mock("@storymapper/web/features/restore-points/RestoreResultDialog", () => ({ RestoreResultDialog: () => null }));
vi.mock("@storymapper/web/features/restore-points/RestoreProgressDialog", () => ({ RestoreProgressDialog: () => null }));
vi.mock("@storymapper/web/features/what-changed/WhatChangedProvider", () => ({ WhatChangedProvider: ({ children }: { children: unknown }) => children, WhatChangedButton: () => null }));
vi.mock("@storymapper/web/features/changesets/useChangeSetReview", () => ({ useChangeSetReview: () => ({ preview: {} }) }));
vi.mock("@storymapper/web/features/changesets/ChangeSetReview", () => ({ ChangeSetReview: () => null }));
vi.mock("@storymapper/web/features/story-map/useStoryMapBoardState", async () => {
  const { defaultBoardFilters } = await import("@storymapper/web/features/story-map/board-filters");
  return { useStoryMapBoardState: (snapshot: { cards: Array<{ id: string }> }, _projectId: string, preview: unknown) => ({
    snapshot, preview, selectedIds: new Set<string>(), createCard: { isPending: false }, lifecycleNotice: "", moveCard: { error: null }, filters: defaultBoardFilters,
    filtered: { cards: snapshot.cards, visibleCardIds: new Set(snapshot.cards.map((card) => card.id)), matchingCardIds: new Set(snapshot.cards.map((card) => card.id)) }
  }) };
});
vi.mock("@storymapper/web/features/story-map/components/CardDetailModal", () => ({ CardDetailModal: () => null }));
vi.mock("@storymapper/web/features/story-map/components/StoryMapExportActions", () => ({ StoryMapExportActions: () => createElement("button", null, "Export") }));
vi.mock("@storymapper/web/features/story-map/components/BoardToolbar", () => ({ BoardToolbar: () => null, DiscoveryBoardToolbar: () => null }));
vi.mock("@storymapper/web/app/routes/story-map.discovery", () => ({ DiscoveryRoute: () => null }));
vi.mock("@storymapper/web/app/routes/story-map.tree", () => ({ TreeRoute: () => null }));
vi.mock("@storymapper/web/app/routes/story-map.planning", () => ({ PlanningRoute: () => null }));
vi.mock("@storymapper/web/app/routes/story-map.backlog", () => ({ BacklogRoute: () => null }));
vi.mock("@storymapper/web/app/routes/story-map.tracking", () => ({ TrackingRoute: () => null }));
vi.mock("@storymapper/web/app/routes/story-map.slices", () => ({ SlicesRoute: () => null }));
vi.mock("@storymapper/web/app/routes/story-map.graph", () => ({ GraphRoute: () => null }));
vi.mock("@storymapper/web/app/routes/story-map.timeline", () => ({ TimelineRoute: () => null }));
vi.mock("@storymapper/web/app/routes/story-map.github", () => ({ GitHubRoute: () => null }));
vi.mock("@storymapper/web/app/routes/story-map.releases", () => ({ ReleasesRoute: () => null }));
vi.mock("@storymapper/web/app/routes/story-map.roadmaps", () => ({ RoadmapsRoute: () => null }));
vi.mock("@storymapper/web/app/routes/story-map.ai-mcp", () => ({ AiMcpRoute: () => null }));
vi.mock("@storymapper/web/app/routes/sources", () => ({ SourcesRoute: () => createElement("section", { "data-testid": "sources-view" }) }));
vi.mock("@storymapper/web/app/routes/personas", () => ({ PersonasRoute: () => null }));
vi.mock("@storymapper/web/app/routes/github", () => ({ GitHubConnectionsRoute: () => null }));
vi.mock("@storymapper/web/app/routes/audit", () => ({ AuditRoute: () => null }));
vi.mock("@storymapper/web/app/routes/story-maps.index", () => ({ StoryMapsIndexRoute: () => null }));
vi.mock("@storymapper/web/app/routes/onboarding", () => ({ OnboardingRoute: () => null }));

let root: Root;
let client: QueryClient;
const base = "/projects/project/story-maps/map";
async function mount(url: string) {
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  router.update({ history: createMemoryHistory({ initialEntries: [url] }) });
  root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => { root.render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router }))); await router.load(); });
  if (!state.availability) await settled();
}
async function settled() { await vi.waitFor(async () => { await act(async () => {}); expect(client.isFetching()).toBe(0); }); }
async function go(url: string) { await act(async () => { await router.navigate({ to: url }); }); if (!state.availability) await settled(); }
function links(name: string) { return [...document.querySelectorAll<HTMLAnchorElement>(`nav[aria-label="${name}"] a`)]; }
function structure(label: string) {
  expect(document.querySelectorAll("main")).toHaveLength(1);
  expect(document.querySelector("main")!.getAttribute("aria-labelledby")).toBe(document.querySelector("h1")!.id);
  expect(document.querySelectorAll("h1")).toHaveLength(1);
  expect(document.querySelector("h1")!.textContent).toBe(label);
  expect(document.activeElement).toBe(document.querySelector("h1"));
  expect(document.querySelector('[role="banner"]')).not.toBeNull();
  expect(document.querySelector('nav[aria-label="Views"]')).not.toBeNull();
}
beforeEach(() => {
  state.personasEnabled = true; state.sourcesEnabled = true; state.releasesEnabled = true; state.roadmapsEnabled = true; state.regularViews = undefined;
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  state.availability = undefined; state.availabilityError = false; state.snapshotError = false; state.requests = [];
  vi.stubGlobal("fetch", vi.fn(async (path: string, init?: RequestInit) => {
    state.requests.push({ path, ...(init?.body ? { body: JSON.parse(String(init.body)) as Record<string, unknown> } : {}) });
    if (path.startsWith("/api/story-maps?")) {
      await state.availability;
      if (state.availabilityError) return Response.json({ message: "Map inventory unavailable" }, { status: 503 });
      const projectId = new URL(path, "http://localhost").searchParams.get("projectId");
      return Response.json({ storyMaps: state.maps.filter((map) => map.projectId === projectId) });
    }
    if (path.startsWith("/api/story-maps/") && state.snapshotError) return Response.json({ message: "Map snapshot unavailable" }, { status: 503 });
    if (path.startsWith("/api/story-maps/")) return Response.json({ storyMap: { id: path.split("/").at(-1), projectId: state.owner, name: "Map One" }, cards: [], releases: [], remoteWorkItemLinks: [] });
    if (path.startsWith("/api/customization?")) return Response.json({ workflowStatuses: [], annotations: [], storyTemplates: [], personas: [], cardPersonas: [], cardAnnotations: [], usageCards: [] });
    if (path === "/api/mcp/host-configs") return Response.json({ development: { command: "/node", args: ["/bridge.mjs", "/runtime.lsm"] }, claudeDesktop: { mcpServers: {} }, cursor: { mcpServers: {} }, vsCode: { servers: {} } });
    if (path === "/api/workflow-statuses" && init?.method === "POST") return Response.json({ id: "created-status", ...JSON.parse(String(init.body)) });
    throw new Error(`Unexpected navigation fixture request: ${path}`);
  }));
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  state.maps = [{ id: "map", projectId: "project", name: "Map One" }]; state.owner = "project";
  useActiveStoryMapStore.getState().setActiveStoryMap({ projectId: "stale", storyMapId: "stale-map" });
});
afterEach(async () => { await act(async () => root?.unmount()); client?.clear(); document.body.innerHTML = ""; notifyManager.setScheduler((callback) => setTimeout(callback, 0)); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("exposes real ordered navigation, active anchors, landmarks, titles and exports without flags", async () => {
  await mount(`${base}/discovery`);
  structure("Discovery"); expect(document.title).toBe("Discovery - Map One - Agentic Story Mapper");
  expect(links("Main").map((link) => link.textContent)).toEqual(["Story Maps", "Sources", "Releases", "RoadmapsExperimental", "Agent setup", "Connections", "Personas", "Customize", "AI / MCP", "Activity", "Onboarding"]);
  expect(links("Views").map((link) => link.textContent)).toEqual(["Discovery", "Tree", "Planning", "Backlog", "Tracking", "Slices", "Graph", "TimelineExperimental", "GitHub Sync"]);
  expect(links("Views")[0]!.className).toBe("active");
  expect([...document.querySelectorAll("button")].some((button) => button.textContent === "Export")).toBe(true);
  const skip = document.querySelector<HTMLAnchorElement>(".skip-link")!;
  expect(document.querySelector("a")).toBe(skip);
  await act(async () => skip.click()); expect(document.activeElement?.id).toBe("workspace");
  for (const link of links("Views").slice(1)) {
    await act(async () => { link.click(); }); structure(link.textContent!.replace("Experimental", ""));
    expect(document.querySelector('nav[aria-label="Views"] a.active')?.getAttribute("href")).toBe(router.state.location.pathname);
  }
});

it("loads every Main page and keeps Views available on map auxiliary pages", async () => {
  await mount(`${base}/discovery`);
  for (const name of ["Releases", "RoadmapsExperimental", "AI / MCP", "Agent setup", "Connections", "Personas", "Customize", "Sources", "Activity", "Onboarding"]) {
    const link = links("Main").find((entry) => entry.textContent === name)!;
    expect(link.getAttribute("href")).toBeTruthy();
    await act(async () => link.click());
    structure(name.replace("Experimental", ""));
    expect(document.title).toContain(name.replace("Experimental", ""));
    expect(links("Views")).toHaveLength(9);
  }
});

it("opens working Agent setup with zero maps through its global route and Setup navigation", async () => {
  state.maps = [];
  useActiveStoryMapStore.getState().setActiveStoryMap({ projectId: "project", storyMapId: undefined });
  await mount("/agent-setup");
  structure("Agent setup");
  expect(links("Main").find((link) => link.textContent === "Agent setup")?.getAttribute("href")).toBe("/agent-setup");
  expect(document.querySelectorAll(".mcp-config-panel code")).toHaveLength(4);
  expect(document.querySelector(".mcp-config-panel")?.textContent).toContain("connect your coding host through MCP before map work");
  expect(document.querySelector(".safety-switch-strip button")).not.toBeNull();
  expect(state.requests.some(({ path }) => path === "/api/mcp/host-configs")).toBe(true);
  expect(state.requests.some(({ path }) => path.startsWith("/api/story-maps/"))).toBe(false);
});

it("keeps optional toolbar help read-only in a preview", async () => {
  await mount(`${base}/tree?preview=preview-one`);
  const trigger = getByRole(document.body, "button", { name: "Story Map help" });
  await act(async () => { trigger.focus(); trigger.click(); });
  const dialog = getByRole(document.body, "dialog", { name: "Story Map help" });
  const create = getByRole(dialog, "button", { name: "Create your first Activity" }) as HTMLButtonElement;
  expect(create.disabled).toBe(true);
  await act(async () => create.click());
  expect(document.querySelectorAll('[role="dialog"]')).toHaveLength(1);
  await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
  expect(document.activeElement).toBe(trigger);
});

it("places one Card reviews action in the shared toolbar and excludes previews", async () => {
  await mount(`${base}/discovery`);
  for (const view of ["discovery", "tree", "planning", "backlog", "tracking", "slices", "graph", "timeline", "github"]) {
    await go(`${base}/${view}`);
    const review = getByRole(document.body, "button", { name: "Card reviews" });
    expect(review.closest(".view-toolbar-actions")).not.toBeNull();
    expect(document.querySelectorAll('[title^="Open Definition of Ready review"]')).toHaveLength(1);
  }
  await go(`${base}/tree?preview=preview-one`);
  expect(document.querySelector('[title^="Open Definition of Ready review"]')).toBeNull();
});

it.each(["slices", "graph", "github"])("keeps help available on enabled %s routes without export support", async (view) => {
  for (const preview of [false, true]) {
    if (preview) await go(`${base}/${view}?preview=preview-one`);
    else await mount(`${base}/${view}`);
    expect(router.state.location.pathname).toBe(`${base}/${view}`);
    const trigger = getByRole(document.body, "button", { name: "Story Map help" });
    expect(trigger.closest(".view-toolbar-actions")).not.toBeNull();
    expect([...document.querySelectorAll("button")].some((button) => button.textContent === "Export")).toBe(false);
    await act(async () => { trigger.focus(); trigger.click(); });
    const dialog = getByRole(document.body, "dialog", { name: "Story Map help" });
    expect((getByRole(dialog, "button", { name: "Create your first Activity" }) as HTMLButtonElement).disabled).toBe(preview);
    await act(async () => dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })));
    expect(document.activeElement).toBe(trigger);
  }
});

it("preserves query state through real links, default redirect and history without stealing search-only focus", async () => {
  await mount(`${base}?card=card-one&preview=preview-one`);
  expect(router.state.location.pathname).toBe(`${base}/discovery`);
  expect(router.state.location.search).toEqual({ card: "card-one", preview: "preview-one" });
  const link = links("Views")[1]!;
  await act(async () => { link.click(); }); structure("Tree");
  expect(router.state.location.search).toEqual({ card: "card-one", preview: "preview-one" });
  const control = document.querySelector<HTMLButtonElement>("button")!; control.focus();
  await go(`${base}/tree?card=card-two&preview=preview-two`);
  expect(document.activeElement).toBe(control);
  await act(async () => router.history.back());
  await act(async () => router.history.back()); structure("Discovery");
  await act(async () => router.history.forward()); structure("Tree");
  await go("/projects/project/audit?restorePoint=restore-1"); structure("Activity");
  control.focus(); await go("/projects/project/audit?restorePoint=restore-2"); expect(document.activeElement).toBe(control);
});

it("omits unavailable or cross-Project maps and clears stale scope on direct Project pages", async () => {
  await mount("/projects/other/sources"); structure("Sources");
  expect(links("Views")).toHaveLength(0); expect(document.title).toBe("Sources - Agentic Story Mapper");
  expect(links("Main").every((link) => !link.href.includes("stale") && !link.href.includes("/story-maps/map/"))).toBe(true);
  expect(useActiveStoryMapStore.getState().activeProjectId).toBe("other");
  expect(useActiveStoryMapStore.getState().activeStoryMapId).toBeUndefined();
  await go(`${base}/releases`); structure("Releases"); expect(links("Views")).toHaveLength(9);
  await go("/projects/other/story-maps/map/tree"); structure("Tree");
  expect(links("Views")).toHaveLength(0); expect(document.body.textContent).toContain("No story map available.");
  state.owner = "other";
  await act(async () => { await client.invalidateQueries({ queryKey: ["story-map", "map"] }); });
  await go(`${base}/tree`); expect(links("Views")).toHaveLength(0);
  expect(document.body.textContent).toContain("No story map available.");
});

it("keeps Story Maps current on map pages and targets the list after returning", async () => {
  await mount(`${base}/tree`);
  const section = links("Main")[0]!;
  expect(section.classList.contains("active")).toBe(true);
  expect(section.getAttribute("aria-current")).toBe("location");
  await go("/projects/project/story-maps");
  expect(links("Main")[0]!.getAttribute("href")).toBe("/projects/project/story-maps");
  expect(links("Main")[0]!.classList.contains("active")).toBe(true);
  expect(links("Main")[0]!.getAttribute("aria-current")).toBe("page");
});

it("preserves the active second Project on Onboarding", async () => {
  useActiveStoryMapStore.getState().setActiveStoryMap({ projectId: "other", storyMapId: undefined });
  await mount("/onboarding");
  expect(useActiveStoryMapStore.getState().activeProjectId).toBe("other");
  expect(links("Main").find((link) => link.textContent === "Sources")!.getAttribute("href")).toBe("/projects/other/sources");
});

it("uses a bookmarked Connections map before the remembered map", async () => {
  useActiveStoryMapStore.getState().setActiveStoryMap({ projectId: "project", storyMapId: "remembered" });
  state.maps.push({ id: "remembered", projectId: "project", name: "Remembered" });
  await mount("/projects/project/github?storyMapId=map");
  expect(useActiveStoryMapStore.getState().activeStoryMapId).toBe("map");
  expect(links("Views")[0]!.getAttribute("href")).toContain("/story-maps/map/discovery");
});

it("focuses the heading when Connections URL map scope changes", async () => {
  state.maps.push({ id: "second", projectId: "project", name: "Second" });
  await mount("/projects/project/github?storyMapId=map");
  const control = document.querySelector<HTMLButtonElement>("button")!;
  control.focus();
  await go("/projects/project/github?storyMapId=second");
  structure("Connections");
  expect(useActiveStoryMapStore.getState().activeStoryMapId).toBe("second");
  expect(links("Views")[0]!.getAttribute("href")).toContain("/story-maps/second/discovery");
  for (const [direction, storyMapId] of [["back", "map"], ["forward", "second"]] as const) {
    control.focus();
    await act(async () => router.history[direction]());
    await settled();
    structure("Connections");
    expect(router.state.location.search).toEqual({ storyMapId });
    expect(useActiveStoryMapStore.getState().activeStoryMapId).toBe(storyMapId);
    expect(links("Views")[0]!.getAttribute("href")).toContain(`/story-maps/${storyMapId}/discovery`);
  }
});

it("waits for delayed availability despite a cached snapshot and reports an inventory error", async () => {
  let release!: () => void;
  state.availability = new Promise<void>((resolve) => { release = resolve; });
  await mount(`${base}/tree`);
  client.setQueryData(["story-map", "map"], { storyMap: { id: "map", projectId: "project", name: "Map One" }, cards: [], releases: [], remoteWorkItemLinks: [] });
  await act(async () => {});
  expect(document.body.textContent).toContain("Loading local story map...");
  expect(document.body.textContent).not.toContain("No story map available.");
  expect(links("Views")).toHaveLength(0);
  state.availabilityError = true;
  await act(async () => { release(); }); state.availability = undefined;
  await settled();
  expect([...document.querySelectorAll('[role="alert"]')].map((alert) => alert.textContent)).toContain("Request failed: 503");
  expect(document.body.textContent).not.toContain("No story map available.");
});

it("withholds a removed same-Project map despite its retained successful snapshot", async () => {
  await mount(`${base}/tree`);
  expect(client.getQueryData(["story-map", "map"])).toBeDefined();
  state.maps = [];
  await act(async () => { await client.invalidateQueries({ queryKey: ["story-maps", "project"] }); });
  await settled();
  expect(links("Views")).toHaveLength(0);
  expect(document.querySelector(".story-map-shell")).toBeNull();
  expect(document.body.textContent).toContain("No story map available.");
  expect(useActiveStoryMapStore.getState().activeStoryMapId).toBeUndefined();
  expect(client.getQueryData(["story-map", "map"])).toBeDefined();
});

it.each(["project", "other"])("uses validated scope for real Customize reads and creation in %s", async (projectId) => {
  useActiveStoryMapStore.getState().setActiveStoryMap({ projectId: "project", storyMapId: "map" });
  await mount(`/projects/${projectId}/customize`);
  const expectedMap = projectId === "project" ? "map" : undefined;
  const reads = state.requests.filter((request) => request.path.startsWith("/api/customization?"));
  expect(reads.length).toBeGreaterThan(0);
  expect(reads.map((request) => request.path)).toContain(`/api/customization?projectId=${projectId}${expectedMap ? "&storyMapId=map" : ""}`);
  expect(reads.every((request) => !request.path.includes("storyMapId=map") || projectId === "project")).toBe(true);
  await act(async () => { document.querySelector<HTMLButtonElement>('.customization-block-head button')!.click(); });
  const input = document.querySelector<HTMLInputElement>('[role="dialog"] input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Review");
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await act(async () => { document.querySelector<HTMLButtonElement>('[role="dialog"] button[type="submit"]')!.click(); });
  await vi.waitFor(() => expect(state.requests.find((request) => request.path === "/api/workflow-statuses")).toBeDefined());
  expect(state.requests.find((request) => request.path === "/api/workflow-statuses")!.body).toEqual({ projectId, ...(expectedMap ? { storyMapId: expectedMap } : {}), name: "Review", group: "todo", color: "#eef2ff" });
});

it.each([false, true])("gates real Customize reads and creation until remembered map validation settles (error=%s)", async (failed) => {
  useActiveStoryMapStore.getState().setActiveStoryMap({ projectId: "project", storyMapId: "map" });
  let release!: () => void;
  state.availability = new Promise<void>((resolve) => { release = resolve; });
  await mount("/projects/project/customize");
  expect(document.querySelector(".customization-panel")).toBeNull();
  expect(document.body.textContent).toContain("Loading local story map...");
  expect(state.requests.filter((request) => request.path.startsWith("/api/customization?") || request.path === "/api/workflow-statuses")).toEqual([]);
  state.availabilityError = failed;
  await act(async () => { release(); }); state.availability = undefined;
  await settled();
  const reads = state.requests.filter((request) => request.path.startsWith("/api/customization?"));
  if (failed) {
    expect(document.querySelector(".customization-panel")).toBeNull();
    expect(reads).toEqual([]);
    expect([...document.querySelectorAll('[role="alert"]')].map((alert) => alert.textContent)).toContain("Request failed: 503");
  } else {
    expect(document.querySelector(".customization-panel")).not.toBeNull();
    expect(reads.map((request) => request.path)).toContain("/api/customization?projectId=project&storyMapId=map");
  }
  expect(state.requests.filter((request) => request.path === "/api/workflow-statuses")).toEqual([]);
});

it("exposes effective scope, changes writes deliberately, and drops the previous Project editor", async () => {
  useActiveStoryMapStore.getState().setActiveStoryMap({ projectId: "project", storyMapId: "map" });
  await mount("/projects/project/customize");
  expect(document.body.textContent).toContain("Effective scope: Map One");
  const scope = [...document.querySelectorAll("label")].find((label) => label.firstChild?.textContent === "Customization scope")!.querySelector("select")!;
  await act(async () => { scope.value = ""; scope.dispatchEvent(new Event("change", { bubbles: true })); });
  await settled();
  expect(document.body.textContent).toContain("Effective scope: Project-wide");
  await act(async () => document.querySelector<HTMLButtonElement>(".customization-block-head button")!.click());
  const name = document.querySelector<HTMLInputElement>('[role=dialog] input')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(name, "Project status"); name.dispatchEvent(new Event("input", { bubbles: true })); });
  await act(async () => document.querySelector<HTMLButtonElement>('[role=dialog] button[type=submit]')!.click());
  await settled();
  expect(state.requests.find((request) => request.path === "/api/workflow-statuses")!.body).toMatchObject({ projectId: "project", name: "Project status" });
  expect(state.requests.find((request) => request.path === "/api/workflow-statuses")!.body).not.toHaveProperty("storyMapId");
  await act(async () => document.querySelector<HTMLButtonElement>(".customization-block-head button")!.click());
  await go("/projects/other/customize");
  expect(document.querySelector('[role=dialog]')).toBeNull();
  expect(document.body.textContent).toContain("Effective scope: Project-wide");
  expect([...document.querySelectorAll(".customization-panel select option")].map((option) => option.getAttribute("value"))).not.toContain("map");
});

it("retains an open Customize draft in an unavailable map scope without admitting a Project write", async () => {
  useActiveStoryMapStore.getState().setActiveStoryMap({ projectId: "project", storyMapId: "map" });
  await mount("/projects/project/customize");
  await act(async () => document.querySelector<HTMLButtonElement>(".customization-block-head button")!.click());
  const input = document.querySelector<HTMLInputElement>('[role=dialog] input')!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Retained map draft"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  const readCount = state.requests.filter((request) => request.path === "/api/customization?projectId=project").length;
  state.maps = [];
  await act(async () => { await client.invalidateQueries({ queryKey: ["story-maps", "project"] }); });
  await settled();
  expect(document.querySelector<HTMLInputElement>('[role=dialog] input')!.value).toBe("Retained map draft");
  const save = document.querySelector<HTMLButtonElement>('[role=dialog] button[type=submit]')!;
  expect(save.disabled).toBe(true);
  expect(document.querySelector('[role=dialog] [role=alert]')?.textContent).toContain("Selected Story Map unavailable");
  await act(async () => save.click());
  expect(state.requests.some((request) => request.path === "/api/workflow-statuses")).toBe(false);
  expect(state.requests.filter((request) => request.path === "/api/customization?projectId=project")).toHaveLength(readCount);
  await act(async () => [...document.querySelectorAll<HTMLButtonElement>('[role=dialog] button')].find((button) => button.textContent === "Cancel")!.click());
  const scope = [...document.querySelectorAll("label")].find((label) => label.firstChild?.textContent === "Customization scope")!.querySelector("select")!;
  expect(scope.value).toBe("map");
  await act(async () => { scope.value = ""; scope.dispatchEvent(new Event("change", { bubbles: true })); });
  await settled();
  expect(document.querySelector<HTMLButtonElement>(".customization-block-head button")!.disabled).toBe(false);
});


it.each(["inventory", "snapshot"])("retains the same Customize dialog and draft after a background %s read fails", async (read) => {
  useActiveStoryMapStore.getState().setActiveStoryMap({ projectId: "project", storyMapId: "map" });
  await mount("/projects/project/customize");
  await act(async () => document.querySelector<HTMLButtonElement>(".customization-block-head button")!.click());
  const dialog = document.querySelector('[role=dialog]')!;
  const input = dialog.querySelector<HTMLInputElement>("input")!;
  await act(async () => { Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, "Draft survives background failure"); input.dispatchEvent(new Event("input", { bubbles: true })); });
  if (read === "inventory") state.availabilityError = true;
  else state.snapshotError = true;
  await act(async () => { await client.invalidateQueries({ queryKey: read === "inventory" ? ["story-maps", "project"] : ["story-map", "map"] }); });
  await settled();
  expect(document.querySelector('[role=dialog]')).toBe(dialog);
  expect(dialog.querySelector("input")).toBe(input);
  expect(input.value).toBe("Draft survives background failure");
  expect([...document.querySelectorAll('[role=alert]')].some((alert) => alert.textContent?.includes("Request failed: 503"))).toBe(true);
  if (read === "inventory") {
    const save = dialog.querySelector<HTMLButtonElement>('button[type=submit]')!;
    expect(save.disabled).toBe(true);
    await act(async () => save.click());
    expect(state.requests.some((request) => request.path === "/api/workflow-statuses")).toBe(false);
  }
});

it("audits the real desktop shell landmarks and navigation names", async () => {
  await mount(`${base}/tree`);
  expect(getByRole(document.body, "main")).toBeDefined();
  expect(getByRole(document.body, "link", { name: "Skip to workspace" })).toBeDefined();
  const result = await axe.run(document.body, {
    runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] },
    rules: { "color-contrast": { enabled: false } }
  });
  expect(result.passes.length).toBeGreaterThan(0);
  expect(result.violations.map(({ id, nodes }) => ({ id, targets: nodes.map(({ target }) => target) }))).toEqual([]);
});

it.each(["project", "other"])("hides disabled Sources and redirects direct URLs within %s", async (projectId) => {
  state.sourcesEnabled = false;
  await mount(`/projects/${projectId}/sources`);
  expect(router.state.location.pathname).toBe(`/projects/${projectId}/story-maps`);
  expect(links("Main").some((link) => link.textContent === "Sources")).toBe(false);
  expect(document.querySelector('[data-testid="sources-view"]')).toBeNull();
  expect(state.requests.some(({ path }) => path.includes("/sources"))).toBe(false);
});

it("shows enabled Sources in navigation and opens its direct route", async () => {
  await mount("/projects/project/sources");
  expect(router.state.location.pathname).toBe("/projects/project/sources");
  expect(links("Main").find((link) => link.textContent === "Sources")?.getAttribute("href")).toBe("/projects/project/sources");
  expect(document.querySelector('[data-testid="sources-view"]')).not.toBeNull();
});

it.each(["releases", "roadmaps"] as const)("omits disabled %s and redirects within the same map preserving validated search", async (view) => {
  state.regularViews = ["tree"];
  state.releasesEnabled = view !== "releases";
  state.roadmapsEnabled = view !== "roadmaps";
  state.maps = [{ id: "second-map", projectId: "other", name: "Other Map" }];
  state.owner = "other";
  const otherBase = "/projects/other/story-maps/second-map";
  await mount(`${otherBase}/${view}?card=card-one&preview=preview-one`);
  expect(router.state.location.pathname).toBe(`${otherBase}/tree`);
  expect(router.state.location.search).toEqual({ card: "card-one", preview: "preview-one" });
  expect(links("Main").some((link) => link.href.includes(`/${view}`))).toBe(false);
  const availableView = view === "releases" ? "roadmaps" : "releases";
  expect(links("Main").some((link) => link.href.includes(`/${availableView}`))).toBe(true);
  await go(`${otherBase}/${availableView}`);
  expect(router.state.location.pathname).toBe(`${otherBase}/${availableView}`);
});

it("hides both auxiliary map views independently of the regular view tabs", async () => {
  state.releasesEnabled = false;
  state.roadmapsEnabled = false;
  await mount(`${base}/tree`);
  expect(links("Main").some((link) => /Releases|Roadmaps/.test(link.textContent ?? ""))).toBe(false);
  expect(links("Views")).toHaveLength(9);
});

it.each(["project", "other"])("hides disabled Personas and redirects bookmarks within %s", async (projectId) => {
  state.personasEnabled = false;
  await mount(`/projects/${projectId}/personas?persona=existing`);
  expect(router.state.location.pathname).toBe(`/projects/${projectId}/story-maps`);
  expect(links("Main").some((link) => link.textContent === "Personas")).toBe(false);
  await go(`/projects/${projectId}/customize`);
  expect(document.querySelector(".customization-personas-link")).toBeNull();
});

it("keeps enabled Persona navigation and Customize links", async () => {
  await mount("/projects/project/customize");
  expect(document.querySelector(".customization-personas-link")?.getAttribute("href")).toBe("/projects/project/personas");
  await go("/projects/project/personas?persona=existing");
  expect(router.state.location.pathname).toBe("/projects/project/personas");
  expect(router.state.location.search).toEqual({ persona: "existing" });
});
