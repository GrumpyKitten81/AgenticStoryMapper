// @vitest-environment jsdom
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { storyMapSnapshotSchema } from "@storymapper/contracts";
import { useStoryMapBoardState } from "@storymapper/web/features/story-map";
import { TreeGrid } from "@storymapper/web/features/story-map/components/TreeGrid";
import { TreeColumnPicker } from "@storymapper/web/features/story-map/components/TreeColumnPicker";

it("hides changed, status, estimate and assignee by default and toggles columns from the picker", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  localStorage.clear();
  const projectId = randomUUID(); const storyMapId = randomUUID(); const now = "2026-10-31T00:00:00.000Z";
  const snapshot = storyMapSnapshotSchema.parse({ storyMap: { id: storyMapId, projectId, version: 1, name: "Tree", createdAt: now, updatedAt: now },
    cards: [{ id: randomUUID(), parentId: null, key: "LSM-1", level: "activity", title: "Activity", storyMapId, version: 1, creationOrigin: "inference", provenance: "inference", releaseId: null, position: 0, createdAt: now, updatedAt: now }],
    releases: [], sourceLinks: [], cardDependencies: [], githubLinks: [], remoteWorkItemLinks: [], workflowStatuses: [], personas: [], cardPersonas: [], annotations: [], cardAnnotations: [], storyTemplates: [] });
  const client = new QueryClient(); const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  function Tree() { const state = useStoryMapBoardState(snapshot, projectId, undefined); return createElement("div", null, createElement(TreeColumnPicker, { estimationUnit: "points" }), createElement(TreeGrid, { state, onSelectCard: vi.fn() })); }
  const headers = () => [...host.querySelectorAll(".tree-header .tree-cell")].map((cell) => cell.className.replace("tree-cell tree-cell-", ""));
  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Tree))));
    expect(headers()).toEqual(["key", "priority", "release", "link"]);
    expect(host.querySelectorAll(".tree-row .tree-cell")).toHaveLength(4);
    await act(async () => host.querySelector<HTMLButtonElement>("[aria-haspopup='menu']")!.click());
    const items = [...host.querySelectorAll<HTMLButtonElement>("[role='menuitemcheckbox']")];
    expect(items.map((item) => item.getAttribute("aria-checked"))).toEqual(["false", "true", "false", "true", "false", "true", "false", "true"]);
    await act(async () => items.find((item) => item.textContent === "Status")!.click());
    await act(async () => items.find((item) => item.textContent === "Key")!.click());
    expect(headers()).toEqual(["status", "priority", "release", "link"]);
  } finally { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); }
});
