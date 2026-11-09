import { storyMapViewPaths, viewFlagName, type StoryMapViewPath } from "@storymapper/web/app/story-map-view-paths";

const enabledByDefault: readonly StoryMapViewPath[] = ["discovery", "tree"];

function readFeatureFlag(name: string, defaultValue: boolean): boolean {
  const value: unknown = import.meta.env[name];
  if (value === undefined) return defaultValue;
  if (value !== "true" && value !== "false") throw new Error(`${name} must be "true" or "false"`);
  return value === "true";
}

export const enabledStoryMapViews: readonly StoryMapViewPath[] = storyMapViewPaths.filter((path) => readFeatureFlag(viewFlagName(path), enabledByDefault.includes(path)));
if (!enabledStoryMapViews.length) throw new Error("At least one VITE_FEATURE_VIEW_* flag must be enabled");
export const isStoryMapViewEnabled = (path: StoryMapViewPath) => enabledStoryMapViews.includes(path);

export const isSourcesViewEnabled = readFeatureFlag("VITE_FEATURE_VIEW_SOURCES", false);

export const isReleasesViewEnabled = readFeatureFlag("VITE_FEATURE_VIEW_RELEASES", false);
export const isRoadmapsViewEnabled = readFeatureFlag("VITE_FEATURE_VIEW_ROADMAPS", false);

export const isPersonasEnabled = readFeatureFlag("VITE_FEATURE_PERSONAS", false);
