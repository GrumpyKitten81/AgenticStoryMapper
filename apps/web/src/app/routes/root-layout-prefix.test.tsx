// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act, createElement, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider, notifyManager } from "@tanstack/react-query";
import { storyMapSnapshotSchema } from "@storymapper/contracts";
import { afterEach, expect, it, vi } from "vitest";
import { api } from "@storymapper/web/app/api";
import { RootLayout } from "@storymapper/web/app/routes/RootLayout";

const fixture = vi.hoisted(() => ({ search: {} as { preview?: string }, snapshot: undefined as unknown }));
vi.mock("@tanstack/react-router", () => ({
  useSearch: () => fixture.search,
  useLocation: () => ({ pathname: "/projects/project/story-maps/map/discovery" }),
  Outlet: () => null,
  Link: ({ children }: { children: ReactNode }) => createElement("a", null, children)
}));
vi.mock("@storymapper/web/app/routes/use-workspace-scope", () => ({ useWorkspaceScope: () => ({
  projectId: "project", storyMapId: "map", urlStoryMapId: "map", storyMap: fixture.snapshot
}) }));
vi.mock("@storymapper/web/app/api", () => ({
  api: { updateStoryMap: vi.fn() },
  useApiHealth: () => ({ isError: false }),
  useProjects: () => ({ data: { projects: [{ id: "project", name: "Project" }] } })
}));
vi.mock("@storymapper/web/app/live/useLiveUpdates", () => ({ useLiveUpdates: () => ({ connection: "connected", failed: false }) }));
vi.mock("@storymapper/web/features/safety/SafetySwitchStrip", () => ({ SafetySwitchStrip: () => null }));
vi.mock("@storymapper/web/features/restore-points/RestoreResultDialog", () => ({ RestoreResultDialog: () => null }));
vi.mock("@storymapper/web/features/restore-points/RestoreProgressDialog", () => ({ RestoreProgressDialog: () => null }));

let dispose: (() => Promise<void>) | undefined;
afterEach(async () => {
  await dispose?.(); dispose = undefined;
  fixture.search = {}; fixture.snapshot = undefined;
  vi.resetAllMocks(); vi.unstubAllGlobals();
  notifyManager.setScheduler((callback) => setTimeout(callback, 0));
});

it("wires actual preview search into a disabled prefix opener and enables normal explicit saves", async () => {
  notifyManager.setScheduler(queueMicrotask);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const now = new Date().toISOString();
  const snapshot = storyMapSnapshotSchema.parse({ storyMap: { id: randomUUID(), projectId: randomUUID(), name: "Preview map", version: 1, createdAt: now, updatedAt: now }, cards: [], releases: [], cardDependencies: [] });
  fixture.snapshot = snapshot;
  fixture.search = { preview: randomUUID() };
  const host = document.createElement("div"); document.body.append(host);
  const root = createRoot(host);
  const client = new QueryClient();
  dispose = async () => { await act(async () => root.unmount()); client.clear(); host.remove(); };
  const render = () => act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(RootLayout))));
  const opener = () => [...host.querySelectorAll<HTMLButtonElement>("button")].find((item) => item.getAttribute("aria-label") === "Edit Card Key prefix")!;
  await render();
  expect(opener().disabled).toBe(true);
  await act(async () => opener().click());
  expect(document.querySelector('[role="dialog"]')).toBeNull();
  expect(api.updateStoryMap).not.toHaveBeenCalled();
  fixture.search = {};
  await render();
  expect(opener().disabled).toBe(false);
  await act(async () => opener().click());
  expect(document.querySelector('[role="dialog"]')).not.toBeNull();
  vi.mocked(api.updateStoryMap).mockResolvedValue({ storyMap: { ...snapshot.storyMap, version: 2 } });
  await act(async () => document.querySelector("form")!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true })));
  expect(api.updateStoryMap).toHaveBeenCalledWith(snapshot.storyMap.id, { cardKeyPrefix: "LSM" }, 1);
});
