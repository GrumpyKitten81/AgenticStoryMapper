import { FilterAncestors } from "@storymapper/web/features/story-map/components/FilterAncestors";
import { BoardToolbar } from "@storymapper/web/features/story-map/components/BoardToolbar";
import { useParams } from "@tanstack/react-router";
import { RoadmapPanel } from "../../features/roadmaps/RoadmapPanel";
import { useStoryMapBoardStateContext, useStoryMapSnapshot } from "./story-map-shell";

export function RoadmapsRoute() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const snapshot = useStoryMapSnapshot();
  const state = useStoryMapBoardStateContext();
  return (
    <section className="route-panel">
      {!state.preview ? <BoardToolbar state={state} /> : null}<FilterAncestors />
      <RoadmapPanel projectId={projectId} storyMapId={snapshot.storyMap.id} estimationUnit={snapshot.storyMap.estimationUnit} releases={snapshot.releases} cards={state.filtered.cards} matchingCardIds={state.filtered.matchingCardIds} statusContext={{ remoteWorkItemLinks: snapshot.remoteWorkItemLinks, workflowStatuses: snapshot.workflowStatuses }} />
    </section>
  );
}
