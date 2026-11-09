// @vitest-environment jsdom // REQ server ghosts remain visible and cannot mutate simulated IDs
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { expect, it, vi } from "vitest";
import { storyMapSnapshotSchema, type ChangeSetPreviewMarker, type ChangeSetPreviewBoard } from "@storymapper/contracts";
import { useStoryMapBoardState } from "@storymapper/web/features/story-map";
import { TreeGrid } from "@storymapper/web/features/story-map";
import { SwimlaneGrid } from "@storymapper/web/features/story-map";

it.each([false, true])("renders both dependency directions on Planning headers from complete adjacency (preview=%s)", async (projected) => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const projectId = randomUUID(); const storyMapId = randomUUID(); const now = "2026-10-13T00:00:00.000Z";
  const snapshot = storyMapSnapshotSchema.parse({
    storyMap: { id: storyMapId, projectId, version: 1, name: "Dependencies", createdAt: now, updatedAt: now },
    cards: [
      { level: "activity", key: "LSM-1", title: "Activity" },
      { level: "step", key: "LSM-2", title: "Step" },
      { level: "story", key: projected ? "NEW-1" : "LSM-3", title: "Story" },
      { level: "story", key: "LSM-4", title: "Archived prerequisite", status: "archived" }
    ].map((card) => ({ id: randomUUID(), parentId: null, ...card, storyMapId, version: 1, creationOrigin: "inference", provenance: "inference", releaseId: null, position: 0, createdAt: now, updatedAt: now })),
    cardDependencies: [], releases: [], sourceLinks: [], githubLinks: [], remoteWorkItemLinks: [], workflowStatuses: [], personas: [], cardPersonas: [], annotations: [], cardAnnotations: [], storyTemplates: []
  });
  const [activity, step, story, archived] = snapshot.cards;
  step!.parentId = activity!.id; story!.parentId = step!.id; archived!.parentId = step!.id;
  snapshot.cardDependencies = [[activity!, step!], [step!, archived!], [story!, activity!]].map(([dependent, prerequisite]) => ({ id: randomUUID(), cardId: dependent!.id, prerequisiteCardId: prerequisite!.id, createdAt: now }));
  const preview: ChangeSetPreviewBoard | undefined = projected ? { snapshot, markers: [{ entity: "card", entityId: story!.id, kind: "added", operationIds: ["add"] }] } : undefined;
  const client = new QueryClient(); const host = document.createElement("div"); document.body.append(host); const root = createRoot(host);
  function Board() { const state = useStoryMapBoardState(snapshot, projectId, preview); return createElement(SwimlaneGrid, { state, onSelectCard: vi.fn() }); }
  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Board))));
    const activityBadges = [...host.querySelectorAll(".swimlane-activity-cell .dependency-badge")];
    const stepBadges = [...host.querySelectorAll(".swimlane-step-cell .dependency-badge")];
    expect(activityBadges.map((badge) => badge.textContent)).toEqual(["Depends on (1): LSM-2", `Required by (1): ${story!.key}`]);
    expect(stepBadges.map((badge) => badge.textContent)).toEqual(["Depends on (1): LSM-4", "Required by (1): LSM-1"]);
    expect([...activityBadges, ...stepBadges].every((badge) => badge.getAttribute("title") === badge.textContent)).toBe(true);
    expect(host.textContent).not.toContain(archived!.title);
  } finally { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); }
});

it("renders NEW-n cards and removed hierarchy/release ghosts in Tree and Planning with disabled editing", async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  const projectId = randomUUID(); const storyMapId = randomUUID(); const now = "2026-10-12T00:00:00.000Z";
  const snapshot = storyMapSnapshotSchema.parse({ storyMap: { id: storyMapId, projectId, version: 1, name: "Preview", createdAt: now, updatedAt: now },
    cards: [
      { id: randomUUID(), key: "LSM-1", level: "activity", parentId: null, title: "Removed activity", parked: true },
      { id: randomUUID(), key: "LSM-2", level: "step", title: "Removed step" },
      { id: randomUUID(), key: "NEW-1", level: "story", title: "New story" }
    ].map((card) => ({ parentId: null, ...card, storyMapId, version: 1, creationOrigin: "inference", provenance: "inference", releaseId: null, position: 0, createdAt: now, updatedAt: now })),
    releases: [{ id: randomUUID(), storyMapId, version: 1, name: "Removed release", startDate: null, releaseDate: null, position: 0, createdAt: now, updatedAt: now }], sourceLinks: [], cardDependencies: [], githubLinks: [], remoteWorkItemLinks: [], workflowStatuses: [], personas: [], cardPersonas: [], annotations: [], cardAnnotations: [], storyTemplates: [] });
  snapshot.cards[1]!.parentId = snapshot.cards[0]!.id; snapshot.cards[2]!.parentId = snapshot.cards[1]!.id; snapshot.cards[2]!.releaseId = snapshot.releases[0]!.id;
  const preview: ChangeSetPreviewBoard = { snapshot, markers: snapshot.cards.map<ChangeSetPreviewMarker>((card, index) => ({ entity: "card", entityId: card.id, kind: index === 2 ? "added" : "removed", operationIds: ["op"] })).concat([{ entity: "release", entityId: snapshot.releases[0]!.id, kind: "removed", operationIds: ["op"] }]) };
  const archivedId = randomUUID();
  snapshot.cards.push({ ...snapshot.cards[2]!, id: archivedId, key: "LSM-4", title: "Archived prerequisite", status: "archived" });
  snapshot.cardDependencies = [{ id: randomUUID(), cardId: snapshot.cards[2]!.id, prerequisiteCardId: archivedId, createdAt: now }];
  const client = new QueryClient(); const host = document.createElement("div"); document.body.append(host); const root = createRoot(host); const selected = vi.fn(); const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  function Boards() { const state = useStoryMapBoardState(snapshot, projectId, preview); return createElement("div", null, createElement(TreeGrid, { state, onSelectCard: selected }), createElement(SwimlaneGrid, { state, onSelectCard: selected })); }
  try {
    await act(async () => root.render(createElement(QueryClientProvider, { client }, createElement(Boards))));
    expect(host.querySelector('[data-story-map-export-target="tree"]')!.textContent).toContain("NEW-1");
    expect(host.querySelector('[data-story-map-export-target="planning"]')!.textContent).toContain("Removed release");
    expect(host.querySelectorAll(".preview-marker")).toHaveLength(7);
    expect(host.querySelector('[data-story-map-export-target="tree"]')!.textContent).toContain("Depends on (1): LSM-4");
    expect(host.querySelector('[data-story-map-export-target="planning"]')!.textContent).toContain("Depends on (1): LSM-4");
    expect(host.querySelector(`[data-live-card-id="${archivedId}"]`)).toBeNull();
    expect(host.querySelectorAll(".preview-marker [aria-hidden=true]")).toHaveLength(7);
    expect(host.querySelectorAll('.tree-row.preview-removed')).toHaveLength(2);
    expect(host.querySelector('.card-checkbox input[type="checkbox"]')!.hasAttribute("disabled")).toBe(true);
    expect(host.querySelector(".drag-handle")).toBeNull();
    expect([...host.querySelectorAll<HTMLInputElement>(".planning-card-fields input")].every((input) => input.disabled)).toBe(true);
    await act(async () => host.querySelector<HTMLButtonElement>('.card-content-button')!.click());
    expect(selected).not.toHaveBeenCalled(); expect(fetch).not.toHaveBeenCalled();
  } finally { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); }
});
