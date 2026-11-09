import { useParams, useSearch } from "@tanstack/react-router";
import { GitHubConnectionsPanel } from "../../features/github-sync/GitHubConnectionsPanel";

export function GitHubConnectionsRoute() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { storyMapId } = useSearch({ strict: false }) as { storyMapId?: string };
  return (
    <section className="route-panel">
      <GitHubConnectionsPanel projectId={projectId} storyMapId={storyMapId} />
    </section>
  );
}