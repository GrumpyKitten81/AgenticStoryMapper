import type { QueryClient } from "@tanstack/react-query";

export async function invalidateRemotePushQueries(client: QueryClient, storyMapId: string | undefined): Promise<void> {
  await Promise.all([
    ["card-reviews"], ["activity"],
    ...["work-item-sync-health", "story-map", "github-sync-health", "backlog-health"].map((key) => storyMapId ? [key, storyMapId] : [key])
  ].map((queryKey) => client.invalidateQueries({ queryKey })));
}
