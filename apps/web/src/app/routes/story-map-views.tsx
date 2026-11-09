import { Link } from "@tanstack/react-router";
import { appStrings as strings, storyMapStrings } from "@storymapper/ui-strings";
import { isStoryMapViewEnabled } from "@storymapper/web/app/feature-flags";

const views = [
  ["discovery", strings.discovery], ["tree", strings.tree], ["planning", strings.planning],
  ["backlog", strings.backlog], ["tracking", strings.tracking], ["slices", storyMapStrings.slices],
  ["graph", storyMapStrings.graph], ["timeline", strings.timeline], ["github", strings.githubSync]
] as const;

export function StoryMapViews({ params, search = {} }: {
  params: { projectId: string; storyMapId: string } | undefined;
  search?: { card?: string; preview?: string };
}) {
  return <nav className="story-map-view-tab-list" aria-label={strings.viewsNavigation}>
    {params ? views.filter(([path]) => isStoryMapViewEnabled(path)).map(([path, label]) => <Link key={path}
      to={`/projects/$projectId/story-maps/$storyMapId/${path}`} params={params} search={search}
      className={path === "slices" || path === "github" ? "view-tab-divider" : undefined}
      activeProps={{ className: path === "slices" || path === "github" ? "active view-tab-divider" : "active" }}>
      {label}{path === "timeline" ? <span className="experimental-label">{strings.experimental}</span> : null}
    </Link>) : null}
  </nav>;
}
