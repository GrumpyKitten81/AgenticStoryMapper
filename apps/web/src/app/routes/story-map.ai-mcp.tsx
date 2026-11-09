import { useParams } from "@tanstack/react-router";
import { AiMcpPanel } from "../../features/ai-mcp/AiMcpPanel";
import { useStoryMapSnapshot } from "./story-map-shell";

export function AiMcpRoute() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const snapshot = useStoryMapSnapshot();
  return (
    <section className="route-panel">
      <AiMcpPanel projectId={projectId} storyMapId={snapshot.storyMap.id} cards={snapshot.cards} releases={snapshot.releases} />
    </section>
  );
}
