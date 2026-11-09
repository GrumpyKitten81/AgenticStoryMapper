export const storyMapViewPaths = ["discovery", "tree", "planning", "backlog", "tracking", "slices", "graph", "timeline", "github"] as const;
export type StoryMapViewPath = typeof storyMapViewPaths[number];
export const viewFlagName = (path: StoryMapViewPath) => `VITE_FEATURE_VIEW_${path.toUpperCase()}`;
