import { randomUUID } from "node:crypto";
import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { storyMapSnapshotSchema } from "@storymapper/contracts";
import { expect, it, vi } from "vitest";
import { RootLayout } from "@storymapper/web/app/routes/RootLayout";

const fixture = vi.hoisted(() => ({ cards: [] as unknown[] }));
vi.mock("@tanstack/react-router", () => ({
  useSearch: () => ({}),
  useParams: () => ({ projectId: "project", storyMapId: "map" }),
  useLocation: () => ({ pathname: "/projects/project/story-maps/map/discovery" }),
  Outlet: () => null,
  Link: ({ children }: { children: ReactNode }) => createElement("a", null, children)
}));
vi.mock("@storymapper/web/app/api", () => ({
  api: {},
  useSafetySettings: () => ({ data: { settings: { agentMode: "apply", github: false } } }),
  useApiHealth: () => ({ isError: false }),
  useProjects: () => ({ data: { projects: [{ id: "project", name: "Local project" }] } }),
  useStoryMaps: () => ({ data: { storyMaps: [{ id: "map", projectId: "project" }] } }),
  useStoryMap: () => ({ data: { storyMap: { id: "map", projectId: "project", name: "Lifecycle map" }, cards: fixture.cards, releases: [] } })
}));
vi.mock("@storymapper/web/app/stores/active-story-map-store", () => ({
  useActiveStoryMapStore: (select: (state: Record<string, string>) => unknown) => select({ activeProjectId: "project", activeStoryMapId: "map" })
}));

it("keeps the header Card count aligned with effective visible content while retaining the complete snapshot", () => {
  const now = new Date().toISOString();
  const storyMapId = randomUUID();
  const activityId = randomUUID();
  const card = { creationOrigin: "manual", provenance: "manual", version: 1, storyMapId, releaseId: null, status: "todo", parked: false, createdAt: now, updatedAt: now };
  const snapshot = storyMapSnapshotSchema.parse({
    storyMap: { version: 1, id: storyMapId, projectId: randomUUID(), name: "Lifecycle map", createdAt: now, updatedAt: now },
    cards: [
      { ...card, id: activityId, key: "LSM-1", parentId: null, position: 0, level: "activity", title: "Container" },
      { ...card, id: randomUUID(), key: "LSM-2", parentId: activityId, position: 0, level: "step", title: "Retained step" },
      { ...card, id: randomUUID(), key: "LSM-3", parentId: null, position: 1, level: "activity", title: "Visible neighbor" }
    ], releases: [], sourceLinks: [], cardDependencies: [], githubLinks: [], remoteWorkItemLinks: [], workflowStatuses: [], personas: [], cardPersonas: [], annotations: [], cardAnnotations: [], storyTemplates: []
  });
  const client = new QueryClient();
  const render = () => renderToStaticMarkup(createElement(QueryClientProvider, { client }, createElement(RootLayout)));
  fixture.cards = snapshot.cards;
  expect(render()).toContain("3 cards");
  fixture.cards = snapshot.cards.map((item) => item.id === activityId ? { ...item, parked: true } : item);
  expect(render()).toContain("1 cards");
  fixture.cards = snapshot.cards.map((item) => item.id === activityId ? { ...item, status: "archived" } : item);
  expect(render()).toContain("1 cards");
  expect(snapshot.cards).toHaveLength(3);
  client.clear();
});
