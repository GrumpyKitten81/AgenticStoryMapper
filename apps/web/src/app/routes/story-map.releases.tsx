import { FilterAncestors } from "@storymapper/web/features/story-map/components/FilterAncestors";
import { BoardToolbar } from "@storymapper/web/features/story-map/components/BoardToolbar";
import { useSearch } from "@tanstack/react-router";
import { ReleasePanel } from "@storymapper/web/features/releases/ReleasePanel";
import { hasActiveBoardFilters } from "@storymapper/web/features/story-map/board-filters";
import { useStoryMapBoardStateContext, usePreviewBoard, useStoryMapSnapshot } from "@storymapper/web/app/routes/story-map-shell";

export function ReleasesRoute() {
  const snapshot = useStoryMapSnapshot();
  const state = useStoryMapBoardStateContext();
  const projection = usePreviewBoard();
  const search = useSearch({ strict: false }) as { preview?: string };
  const displayed = projection?.snapshot ?? snapshot;
  return (
    <section className="route-panel">
      {!state.preview ? <BoardToolbar state={state} /> : null}<FilterAncestors />
      <ReleasePanel releases={displayed.releases} canonicalReleases={snapshot.releases} cards={displayed.cards} matchingCardIds={hasActiveBoardFilters(state.filters) ? state.filtered.matchingCardIds : undefined} sourceLinkedCardIds={displayed.sourceLinks.map((link) => link.cardId)} githubLinkedCardIds={displayed.githubLinks.flatMap((link) => link.cardId ?? [])} storyMapId={snapshot.storyMap.id} externalRefs={displayed.externalRefs} estimationUnit={displayed.storyMap.estimationUnit} preview={Boolean(search.preview)} previewReady={Boolean(projection)} previewMarkers={projection?.markers} />
    </section>
  );
}
