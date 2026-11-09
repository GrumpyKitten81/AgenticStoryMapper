import type { QueryClient } from "@tanstack/react-query";

export function invalidateReleaseViews(queryClient: QueryClient, storyMapId?: string): Promise<unknown> {
  if (!storyMapId) return Promise.resolve();
  return Promise.all(["story-map", "release-summary", "release-timeline", "release-notes", "backlog-health", "work-item-sync-health", "github-sync-health"].map((key) => queryClient.invalidateQueries({ queryKey: [key, storyMapId] })));
}
