import { createRootRoute, createRoute, createRouter, Navigate, redirect, useParams, useSearch, type RouteComponent } from "@tanstack/react-router";
import { enabledStoryMapViews, isPersonasEnabled, isReleasesViewEnabled, isRoadmapsViewEnabled, isSourcesViewEnabled, isStoryMapViewEnabled } from "./feature-flags";
import type { StoryMapViewPath } from "./story-map-view-paths";
import { RootLayout } from "./routes/RootLayout";
import { RootIndexRoute } from "./routes";
import { StoryMapsIndexRoute } from "./routes/story-maps.index";
import { StoryMapShell } from "./routes/story-map-shell";
import { DiscoveryRoute } from "./routes/story-map.discovery";
import { TreeRoute } from "./routes/story-map.tree";
import { PlanningRoute } from "./routes/story-map.planning";
import { GraphRoute } from "@storymapper/web/app/routes/story-map.graph";
import { SlicesRoute } from "@storymapper/web/app/routes/story-map.slices";
import { BacklogRoute } from "./routes/story-map.backlog";
import { TrackingRoute } from "./routes/story-map.tracking";
import { TimelineRoute } from "./routes/story-map.timeline";
import { ReleasesRoute } from "./routes/story-map.releases";
import { RoadmapsRoute } from "./routes/story-map.roadmaps";
import { AiMcpRoute } from "./routes/story-map.ai-mcp";
import { GitHubRoute } from "./routes/story-map.github";
import { GitHubConnectionsRoute } from "./routes/github";
import { SourcesRoute } from "./routes/sources";
import { CustomizeRoute } from "./routes/customize";
import { PersonasRoute } from "./routes/personas";
import { AuditRoute } from "./routes/audit";
import { OnboardingRoute } from "./routes/onboarding";
import { AgentSetupRoute } from "@storymapper/web/app/routes/agent-setup";

const rootRoute = createRootRoute({ component: RootLayout });

const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: RootIndexRoute
});

const onboardingRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/onboarding",
  component: OnboardingRoute
});

const agentSetupRoute = createRoute({ getParentRoute: () => rootRoute, path: "/agent-setup", component: AgentSetupRoute });

const storyMapsIndexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/story-maps",
  component: StoryMapsIndexRoute
});

const storyMapShellRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/story-maps/$storyMapId",
  validateSearch: (search: Record<string, unknown>): { card?: string; preview?: string } => ({
    ...(typeof search.card === "string" ? { card: search.card } : {}),
    ...(typeof search.preview === "string" ? { preview: search.preview } : {})
  }),
  component: StoryMapShell
});

const storyMapIndexRoute = createRoute({
  getParentRoute: () => storyMapShellRoute,
  path: "/",
  component: StoryMapDefaultRoute
});

function storyMapViewRoute(path: StoryMapViewPath, component: RouteComponent) {
  return createRoute({
    getParentRoute: () => storyMapShellRoute, path, component,
    beforeLoad: ({ params, search }) => {
      if (!isStoryMapViewEnabled(path)) throw redirect({ to: `/projects/$projectId/story-maps/$storyMapId/${enabledStoryMapViews[0]!}`, params, search, replace: true });
    }
  });
}

const discoveryRoute = storyMapViewRoute("discovery", DiscoveryRoute);
const treeRoute = storyMapViewRoute("tree", TreeRoute);
const planningRoute = storyMapViewRoute("planning", PlanningRoute);
const graphRoute = storyMapViewRoute("graph", GraphRoute);
const slicesRoute = storyMapViewRoute("slices", SlicesRoute);
const backlogRoute = storyMapViewRoute("backlog", BacklogRoute);
const trackingRoute = storyMapViewRoute("tracking", TrackingRoute);
const timelineRoute = storyMapViewRoute("timeline", TimelineRoute);
function auxiliaryMapViewRoute(path: "releases" | "roadmaps", component: RouteComponent, isEnabled: () => boolean) {
  return createRoute({
    getParentRoute: () => storyMapShellRoute, path, component,
    beforeLoad: ({ params, search }) => {
      if (!isEnabled()) throw redirect({ to: `/projects/$projectId/story-maps/$storyMapId/${enabledStoryMapViews[0]!}`, params, search, replace: true });
    }
  });
}

const releasesRoute = auxiliaryMapViewRoute("releases", ReleasesRoute, () => isReleasesViewEnabled);
const roadmapsRoute = auxiliaryMapViewRoute("roadmaps", RoadmapsRoute, () => isRoadmapsViewEnabled);
const aiMcpRoute = createRoute({ getParentRoute: () => storyMapShellRoute, path: "ai-mcp", component: AiMcpRoute });
const githubRoute = storyMapViewRoute("github", GitHubRoute);

const sourcesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/sources",
  component: SourcesRoute,
  beforeLoad: ({ params }) => {
    if (!isSourcesViewEnabled) throw redirect({ to: "/projects/$projectId/story-maps", params, replace: true });
  }
});
const customizeRoute = createRoute({ getParentRoute: () => rootRoute, path: "/projects/$projectId/customize", component: CustomizeRoute });
const personasRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/personas",
  validateSearch: (search: Record<string, unknown>): { persona?: string } => (
    typeof search.persona === "string" ? { persona: search.persona } : {}
  ),
  component: PersonasRoute,
  beforeLoad: ({ params }) => {
    if (!isPersonasEnabled) throw redirect({ to: "/projects/$projectId/story-maps", params, replace: true });
  }
});
const githubConnectionsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/github",
  validateSearch: (search: Record<string, unknown>): { storyMapId?: string } => (
    typeof search.storyMapId === "string" ? { storyMapId: search.storyMapId } : {}
  ),
  component: GitHubConnectionsRoute
});
const auditRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$projectId/audit",
  validateSearch: (search: Record<string, unknown>): { restorePoint?: string } => (
    typeof search.restorePoint === "string" && /^[a-z0-9_.-]+$/i.test(search.restorePoint) ? { restorePoint: search.restorePoint } : {}
  ),
  component: AuditRoute
});

const routeTree = rootRoute.addChildren([
  indexRoute,
  onboardingRoute,
  agentSetupRoute,
  storyMapsIndexRoute,
  storyMapShellRoute.addChildren([
    storyMapIndexRoute,
    discoveryRoute,
    treeRoute,
    planningRoute,
    slicesRoute,
    graphRoute,
    backlogRoute,
    trackingRoute,
    timelineRoute,
    releasesRoute,
    roadmapsRoute,
    aiMcpRoute,
    githubRoute
  ]),
  sourcesRoute,
  customizeRoute,
  personasRoute,
  githubConnectionsRoute,
  auditRoute
]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

function StoryMapDefaultRoute() {
  const { projectId, storyMapId } = useParams({ strict: false }) as { projectId: string; storyMapId: string };
  const search = useSearch({ strict: false });
  return <Navigate to={`/projects/$projectId/story-maps/$storyMapId/${enabledStoryMapViews[0]!}`} params={{ projectId, storyMapId }} search={search} replace />;
}
