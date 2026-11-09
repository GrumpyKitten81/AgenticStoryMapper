import { appStrings as strings, storyMapStrings } from "@storymapper/ui-strings";

const headings: Record<string, string> = {
  "story-maps": strings.storyMaps, sources: strings.sources, releases: strings.releases,
  roadmaps: strings.roadmaps, customize: strings.customize, personas: strings.personas,
  onboarding: strings.onboarding, "agent-setup": strings.agentSetup, "ai-mcp": strings.aiMcp, audit: strings.activity,
  discovery: strings.discovery, tree: strings.tree, planning: strings.planning,
  backlog: strings.backlog, tracking: strings.tracking, slices: storyMapStrings.slices,
  graph: storyMapStrings.graph, timeline: strings.timeline
};

export function routeHeading(pathname: string): string {
  const segment = pathname.replace(/\/$/, "").split("/").at(-1) ?? "";
  if (segment === "github") return pathname.includes("/story-maps/") ? strings.githubSync : strings.connections;
  return headings[segment] ?? strings.storyMaps;
}
