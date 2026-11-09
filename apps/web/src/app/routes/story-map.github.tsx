import { useParams } from "@tanstack/react-router";
import { GitHubSyncPanel } from "../../features/github-sync/GitHubSyncPanel";
import { useStoryMapSnapshot } from "./story-map-shell";

export function GitHubRoute() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const snapshot = useStoryMapSnapshot();
  return (
    <section className="route-panel">
      <GitHubSyncPanel
        projectId={projectId}
        storyMapId={snapshot.storyMap.id}
        storyMapName={snapshot.storyMap.name}
        storyMapVersion={snapshot.storyMap.version}
        defaultConnectionId={snapshot.storyMap.defaultConnectionId}
        cards={snapshot.cards}
        releases={snapshot.releases}
        links={snapshot.githubLinks}
      />
    </section>
  );
}
