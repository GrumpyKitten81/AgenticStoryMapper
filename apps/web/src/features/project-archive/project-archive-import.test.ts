// @vitest-environment jsdom // REQ portable archive import interactions
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { ImportProjectArchiveResponse } from "@storymapper/contracts";
import { appStrings as strings } from "@storymapper/ui-strings";
import { ProjectArchivePanel } from "./ProjectArchivePanel";
import { useActiveStoryMapStore } from "../../app/stores/active-story-map-store";
import { reloadProjectArchiveRuntime } from "@storymapper/web/features/project-archive/project-archive-runtime";

const navigate = vi.hoisted(() => vi.fn());
vi.mock("@tanstack/react-router", () => ({ useNavigate: () => navigate }));
vi.mock("@storymapper/web/features/project-archive/project-archive-runtime", () => ({ reloadProjectArchiveRuntime: vi.fn() }));
let root: Root;
let host: HTMLDivElement;
let client: QueryClient;
const oldProject = randomUUID();
const imported: ImportProjectArchiveResponse = {
  localPath: "/demo/imported.lsm", projectId: randomUUID(), opened: true,
  manifest: { formatVersion: 1, schemaVersion: `release-sha256-${"a".repeat(64)}`, exportedAt: "2026-10-04T12:00:00.000Z", appVersion: "0.1.0", databaseFileName: "storymapper.sqlite", databaseSha256: "a".repeat(64), dataClassification: "business-data", redactedTables: [], redactedRowCount: 0, counts: { projects: 1, storyMaps: 1, cards: 3 }, includedFolders: [] }
};

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  notifyManager.setScheduler((callback) => queueMicrotask(callback));
  navigate.mockReset().mockResolvedValue(undefined);
  vi.mocked(reloadProjectArchiveRuntime).mockClear();
  useActiveStoryMapStore.setState({ activeProjectId: oldProject, activeStoryMapId: "old-map", lastActiveProjectId: oldProject, lastActiveStoryMapId: "old-map" });
  client = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  client.setQueryData(["story-map", "old-map"], { title: "Stale old Project" });
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
  await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(ProjectArchivePanel, { projectId: oldProject }))));
});

afterEach(async () => {
  await act(async () => root.unmount());
  client.clear();
  host.remove();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

async function selectFile(): Promise<void> {
  const input = host.querySelector("input")!;
  Object.defineProperty(input, "files", { configurable: true, value: [new File(["demo archive"], "demo.zip")] });
  await act(async () => input.dispatchEvent(new Event("change", { bubbles: true })));
}

it("announces pending import, blocks overlapping actions, clears old data and navigates to the opened Project", async () => {
  let resolve!: (response: Response) => void;
  vi.stubGlobal("fetch", vi.fn(() => new Promise<Response>((done) => { resolve = done; })));
  host.querySelectorAll("button")[1]!.focus();
  await selectFile();
  expect([...host.querySelectorAll("button")].every((button) => button.disabled)).toBe(true);
  expect(host.textContent).toContain(strings.importingProject);
  expect(navigate).not.toHaveBeenCalled();
  await act(async () => resolve(new Response(JSON.stringify(imported), { headers: { "content-type": "application/json" } })));
  expect(navigate).toHaveBeenCalledWith({ to: "/projects/$projectId/story-maps", params: { projectId: imported.projectId } });
  expect(client.getQueryData(["story-map", "old-map"])).toBeUndefined();
  expect(useActiveStoryMapStore.getState()).toMatchObject({ activeProjectId: imported.projectId, activeStoryMapId: undefined, lastActiveStoryMapId: undefined });
  expect(host.querySelector('[role="status"]')?.textContent).toContain("now open");
  expect(document.activeElement).toBe(host.querySelector('[role="status"]'));
  expect([...host.querySelectorAll("button")].every((button) => !button.disabled)).toBe(true);
});

it("shows the supported-version diagnostic and retains old Project state after refusal", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ message: "Unsupported archive format version 99. Supported versions: 1." }), { status: 400, headers: { "content-type": "application/json" } })));
  host.querySelectorAll("button")[1]!.focus();
  await selectFile();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Supported versions: 1");
  expect(document.activeElement).toBe(host.querySelector('[role="alert"]'));
  expect(client.getQueryData(["story-map", "old-map"])).toEqual({ title: "Stale old Project" });
  expect(useActiveStoryMapStore.getState().activeProjectId).toBe(oldProject);
  expect(navigate).not.toHaveBeenCalled();
  expect([...host.querySelectorAll("button")].every((button) => !button.disabled)).toBe(true);
  expect(reloadProjectArchiveRuntime).not.toHaveBeenCalled();
});

it("keeps explicit non-JSON refusals in the current Project without reloading", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("Upload refused", { status: 413 })));
  await selectFile();
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("413");
  expect(client.getQueryData(["story-map", "old-map"])).toEqual({ title: "Stale old Project" });
  expect(reloadProjectArchiveRuntime).not.toHaveBeenCalled();
});
