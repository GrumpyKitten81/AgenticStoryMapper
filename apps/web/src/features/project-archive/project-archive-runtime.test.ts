// @vitest-environment jsdom // REQ mounted archive refresh and uncertain-response recovery
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, RouterProvider } from "@tanstack/react-router";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ImportProjectArchiveResponse } from "@storymapper/contracts";
import { router } from "../../app/router";
import { useActiveStoryMapStore } from "../../app/stores/active-story-map-store";
import { reloadProjectArchiveRuntime } from "@storymapper/web/features/project-archive/project-archive-runtime";

vi.mock("@storymapper/web/features/project-archive/project-archive-runtime", () => ({ reloadProjectArchiveRuntime: vi.fn() }));

const projectId = randomUUID();
const importedId = randomUUID();
const mapId = randomUUID();
const result: ImportProjectArchiveResponse = {
  localPath: "/demo/imported.lsm", projectId, opened: true,
  manifest: { formatVersion: 1, schemaVersion: `release-sha256-${"a".repeat(64)}`, exportedAt: "2026-10-04T12:00:00.000Z", appVersion: "0.1.0", databaseFileName: "storymapper.sqlite", databaseSha256: "a".repeat(64), dataClassification: "business-data", redactedTables: [], redactedRowCount: 0, counts: { projects: 1, storyMaps: 1, cards: 3 }, includedFolders: [] }
};
let host: HTMLDivElement;
let root: Root;
let client: QueryClient;
let mapName: string;
let currentProject: string;
let successProject: string;
let loseResponse: boolean;
let posts: number;
let mapReads: number;

function json(body: unknown): Response { return new Response(JSON.stringify(body), { headers: { "content-type": "application/json" } }); }

async function mount(path: string): Promise<void> {
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  router.update({ history: createMemoryHistory({ initialEntries: [path] }) });
  root = createRoot(host);
  await act(async () => {
    root.render(createElement(QueryClientProvider, { client }, createElement(RouterProvider, { router })));
    await router.load();
  });
  await vi.waitFor(async () => { await act(async () => {}); expect(host.querySelector(".story-map-list strong")?.textContent).toBe(mapName); });
}

beforeEach(() => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler(queueMicrotask);
  vi.spyOn(window, "scrollTo").mockImplementation(() => {});
  vi.mocked(reloadProjectArchiveRuntime).mockClear();
  useActiveStoryMapStore.setState({ activeProjectId: undefined, activeStoryMapId: undefined, lastActiveProjectId: undefined, lastActiveStoryMapId: undefined });
  mapName = "Changed after export demo";
  currentProject = projectId;
  successProject = projectId;
  loseResponse = false;
  posts = 0;
  mapReads = 0;
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    if (path === "/api/projects/import") {
      posts++;
      mapName = "Original archive demo";
      if (loseResponse) { currentProject = importedId; throw new TypeError("Import response was lost"); }
      currentProject = successProject;
      return json({ ...result, projectId: currentProject });
    }
    if (path === "/api/projects") return json({ projects: [{ id: currentProject, name: "Portable demo" }] });
    if (path === "/health") return json({ ok: true });
    if (path === "/api/credentials/status") return json({ credentials: [] });
    if (path === `/api/projects/${currentProject}/getting-started`) return json({ checklist: { projectId: currentProject, initialized: true, dismissed: true, completed: { createStoryMap: false, addCards: false, connectGitHub: false, export: false } } });
    if (path === `/api/story-maps?projectId=${currentProject}`) { mapReads++; return json({ storyMaps: [{ id: mapId, name: mapName, description: "" }] }); }
    throw new Error(`Unexpected archive runtime request: ${path}`);
  }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function selectArchive(): Promise<void> {
  const input = host.querySelector<HTMLInputElement>(".project-archive-panel input")!;
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["demo archive"], "demo.zip")] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}

it.each([projectId, importedId])("refetches mounted GET-backed observers and focuses the visible import result for Project %s", async (nextProject) => {
  await mount(`/projects/${projectId}/story-maps`);
  expect(mapReads).toBe(1);
  successProject = nextProject;
  host.querySelectorAll<HTMLButtonElement>(".project-archive-panel button")[1]!.focus();
  await selectArchive();
  await vi.waitFor(async () => { await act(async () => {}); expect(host.querySelector(".story-map-list strong")?.textContent).toBe("Original archive demo"); });
  expect(mapReads).toBeGreaterThan(1);
  expect(router.state.location.pathname).toBe(`/projects/${nextProject}/story-maps`);
  expect(host.textContent).not.toContain("Changed after export demo");
  expect(host.querySelector(".project-archive-result")?.textContent).toContain("now open");
  expect(document.activeElement).toBe(host.querySelector(".project-archive-result"));
  expect(posts).toBe(1);
  expect(reloadProjectArchiveRuntime).not.toHaveBeenCalled();
});

it("reloads after a lost response without resubmitting or claiming success, and the root GET opens the current imported Project", async () => {
  await mount(`/projects/${projectId}/story-maps`);
  loseResponse = true;
  await selectArchive();
  expect(reloadProjectArchiveRuntime).toHaveBeenCalledOnce();
  expect(host.querySelector(".project-archive-result")).toBeNull();
  expect(posts).toBe(1);
  await act(async () => root.unmount());
  client.clear();
  useActiveStoryMapStore.setState({ activeProjectId: undefined, activeStoryMapId: undefined, lastActiveProjectId: undefined, lastActiveStoryMapId: undefined });
  await mount("/");
  expect(router.state.location.pathname).toBe(`/projects/${importedId}/story-maps`);
  expect(host.querySelector(".story-map-list strong")?.textContent).toBe("Original archive demo");
  expect(host.querySelector(".project-archive-result")).toBeNull();
  expect(posts).toBe(1);
});
