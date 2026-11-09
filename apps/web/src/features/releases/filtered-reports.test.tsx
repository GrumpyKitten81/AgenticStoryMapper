// @vitest-environment jsdom // REQ shared status filters reach actual report consumers.
import { randomUUID } from "node:crypto";
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { notifyManager, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { storyMapSnapshotSchema, roadmapDetailsSchema, type ChangeSetPreviewBoard } from "@storymapper/contracts";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReleasesRoute } from "@storymapper/web/app/routes/story-map.releases";
import { ReleaseKanban } from "@storymapper/web/features/releases/ReleaseKanban";
import { RoadmapPanel } from "@storymapper/web/features/roadmaps";
import { defaultBoardFilters } from "@storymapper/web/features/story-map";

vi.mock("@tanstack/react-router", () => ({ useSearch: () => ({ preview: preview ? "review" : undefined }) }));
vi.mock("@storymapper/web/app/routes/story-map-shell", () => ({ useStoryMapSnapshot: () => snapshot, usePreviewBoard: () => preview, useStoryMapBoardStateContext: () => ({ preview, filters, filtered: { matchingCardIds: matches } }) }));
vi.mock("@storymapper/web/features/story-map/components/BoardToolbar", () => ({ BoardToolbar: () => null }));
vi.mock("@storymapper/web/features/story-map/components/FilterAncestors", () => ({ FilterAncestors: () => null }));
const [projectId, storyMapId, rootId, stepId, matchedId, excludedId, releaseId, connectionId, roadmapId, columnId, roadmapCardId] = Array.from({ length: 11 }, () => randomUUID()) as [string, string, string, string, string, string, string, string, string, string, string];
const now = "2026-11-03T00:00:00Z";
const source = { kind: "project" as const, projectId: "delivery", projectName: "Delivery", fieldId: "status" };
const snapshot = storyMapSnapshotSchema.parse({ storyMap: { id: storyMapId, projectId, version: 1, name: "Reports", estimationUnit: "hours", createdAt: now, updatedAt: now },
  cards: [{ id: rootId, level: "activity", parentId: null, title: "Ancestor" }, { id: stepId, level: "step", parentId: rootId, title: "Step" }, { id: matchedId, level: "story", parentId: stepId, title: "Matching story", status: "In Review", estimate: 2 }, { id: excludedId, level: "story", parentId: stepId, title: "Excluded story", status: "done", estimate: 100 }].map((card, index) => ({ storyMapId, version: 1, key: `MAP-${index + 1}`, status: "todo", releaseId, position: index, creationOrigin: "manual", provenance: "manual", createdAt: now, updatedAt: now, ...card })),
  releases: [{ id: releaseId, storyMapId, version: 1, name: "Release", position: 0, startDate: null, releaseDate: null }], remoteWorkItemLinks: [{ id: randomUUID(), externalRefId: randomUUID(), connectionId, cardId: matchedId, provider: "github", remoteId: "1", remoteNumber: 1, url: "https://github.com/owner/repo/issues/1", labels: [], parentOverrideLocal: false, syncState: "synced", statusEvidence: { source, issueState: "closed", membership: "present", optionId: "review", name: "In Review" } }], workflowStatuses: [{ id: randomUUID(), projectId, storyMapId, name: "In Review", group: "active", position: 0 }], sourceLinks: [], githubLinks: [], cardDependencies: [], personas: [], cardPersonas: [], annotations: [], cardAnnotations: [], storyTemplates: [] });
const matches = new Set([matchedId!]);
let preview: ChangeSetPreviewBoard | undefined;
let filters = { ...defaultBoardFilters, statuses: ["In Review"] };
let client: QueryClient, root: Root, host: HTMLDivElement;
beforeEach(() => {
  preview = undefined;
  filters = { ...defaultBoardFilters, statuses: ["In Review"] };
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true); notifyManager.setScheduler(queueMicrotask);
  client = new QueryClient({ defaultOptions: { queries: { retry: false } } }); host = document.body.appendChild(document.createElement("div")); root = createRoot(host);
});
afterEach(async () => { await act(async () => root.unmount()); client.clear(); host.remove(); vi.unstubAllGlobals(); notifyManager.setScheduler((callback) => setTimeout(callback, 0)); });
async function render(element: React.ReactElement) { await act(async () => root.render(createElement(QueryClientProvider, { client }, element))); }

it.each(["releases", "tracking"] as const)("counts only matching stories in %s, excluding ancestor context and canonical nonmatches", async (view) => {
  await render(view === "releases" ? createElement(ReleasesRoute) : createElement(ReleaseKanban, { cards: snapshot.cards.slice(0, 3), canonicalCards: snapshot.cards, matchingCardIds: matches, remoteWorkItemLinks: snapshot.remoteWorkItemLinks, dependencyKeys: {}, workflowStatuses: snapshot.workflowStatuses, releases: snapshot.releases, storyMapId, estimationUnit: "hours" }));
  expect([...host.querySelectorAll(".release-summary-grid strong")].map((node) => node.textContent)).toEqual(["1", "1", "2 hours", "0"]);
  expect(host.querySelector(".release-status-distribution dl")?.textContent).toBe("In Review1");
});

it("uses the server Release summary without filters and restores the projection when filters return", async () => {
  const summary = { storyMapId, scope: "all", releaseId: null, totalCards: 7, totalStories: 6, estimateTotal: 42, unestimatedCards: 3, unestimatedStories: [], statusCounts: { active: 6 }, riskCounts: { missingDescription: 0, missingSource: 0, missingGitHubLink: 0 } };
  vi.stubGlobal("fetch", vi.fn(async (path: string) => {
    expect(path).toBe(`/api/reports/release-summary?storyMapId=${storyMapId}&includeReleased=false`);
    return Response.json(summary);
  }));
  const values = () => [...host.querySelectorAll(".release-summary-grid strong")].map((node) => node.textContent);
  await render(createElement(ReleasesRoute));
  expect(values()).toEqual(["1", "1", "2 hours", "0"]);
  filters = { ...defaultBoardFilters };
  await render(createElement(ReleasesRoute));
  await vi.waitFor(() => expect(values()).toEqual(["7", "6", "42 hours", "3"]));
  expect(host.querySelector(".release-status-distribution dl")?.textContent).toBe("active6");
  filters = { ...defaultBoardFilters, statuses: ["In Review"] };
  await render(createElement(ReleasesRoute));
  expect(values()).toEqual(["1", "1", "2 hours", "0"]);
  expect(host.querySelector(".release-status-distribution dl")?.textContent).toBe("In Review1");
});

it("excludes removed preview ghosts from the matched Release summary", async () => {
  preview = { snapshot, markers: [{ entity: "card", entityId: matchedId!, kind: "removed", operationIds: ["remove"] }] };
  await render(createElement(ReleasesRoute));
  expect(host.querySelector(".release-summary-grid strong")?.textContent).toBe("0");
});

it("recomputes Roadmap progress with matching stories and authoritative status evidence", async () => {
  const details = roadmapDetailsSchema.parse({ roadmap: { id: roadmapId, projectId, storyMapId, version: 1, name: "Roadmap", createdAt: now, updatedAt: now }, columns: [{ id: columnId, roadmapId, name: "Now", position: 0 }], swimlanes: [], cards: [{ id: roadmapCardId, roadmapId, columnId, swimlaneId: null, title: "Theme", reach: null, impact: null, confidence: null, effort: null, position: 0 }], references: [{ id: randomUUID(), roadmapCardId, targetType: "card", targetId: rootId }], reports: [{ roadmapCardId, totalCards: 2, totalStories: 2, doneStories: 1, estimateTotal: 102, progressRatio: 0.5, statusCounts: {} }] });
  vi.stubGlobal("fetch", vi.fn(async (path: string) => Response.json(path.startsWith("/api/roadmaps?") ? { roadmaps: [details.roadmap] } : details)));
  await render(createElement(RoadmapPanel, { projectId, storyMapId, estimationUnit: "hours", releases: snapshot.releases, cards: snapshot.cards, matchingCardIds: matches, statusContext: { remoteWorkItemLinks: snapshot.remoteWorkItemLinks, workflowStatuses: snapshot.workflowStatuses } }));
  await vi.waitFor(() => expect(host.querySelector(".roadmap-card")?.textContent).toContain("100% · 2 hours"));
  expect(host.querySelector(".roadmap-card")?.textContent).not.toContain("Excluded story");
});
