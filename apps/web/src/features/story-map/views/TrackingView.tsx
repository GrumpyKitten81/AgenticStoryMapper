import { FilterAncestors } from "@storymapper/web/features/story-map/components/FilterAncestors";
import { BoardToolbar } from "@storymapper/web/features/story-map/components/BoardToolbar";
import { useMemo } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { ReleaseKanban } from "@storymapper/web/features/releases";
import { useStoryMapBoardStateContext, usePreviewBoard, useStoryMapSnapshot } from "@storymapper/web/app/routes/story-map-shell";
import { dependencyKeysByCard } from "@storymapper/web/components/CardDependencyBadges";

export function TrackingView() {
  const state = useStoryMapBoardStateContext();
  const canonicalSnapshot = useStoryMapSnapshot();
  const preview = usePreviewBoard();
  const snapshot = preview?.snapshot ?? canonicalSnapshot;
  const dependencyKeys = useMemo(() => dependencyKeysByCard(snapshot), [snapshot.cards, snapshot.cardDependencies]);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { card?: string; preview?: string };

  return (
    <section className="route-panel">
      {!state.preview ? <BoardToolbar state={state} /> : null}<FilterAncestors />
      <ReleaseKanban
        preview={preview ?? (search.preview ? { snapshot, markers: [] } : undefined)}
        sourceLinkedCardIds={snapshot.sourceLinks.filter((link) => link.kind === "chunk").map((link) => link.cardId)}
        githubLinkedCardIds={snapshot.githubLinks.flatMap((link) => link.cardId ? [link.cardId] : [])}
        estimationUnit={snapshot.storyMap.estimationUnit}
        releases={snapshot.releases}
        cards={state.filtered.cards}
        canonicalCards={snapshot.cards}
        matchingCardIds={state.filtered.matchingCardIds}
        remoteWorkItemLinks={snapshot.remoteWorkItemLinks}
        githubStatusCatalogs={snapshot.githubStatusCatalogs}
        dependencyKeys={dependencyKeys}
        workflowStatuses={snapshot.workflowStatuses}
        storyMapId={snapshot.storyMap.id}
        onSelectCard={(cardId) => void (navigate as (options: unknown) => Promise<void>)({ search: { ...search, card: cardId } })}
      />
    </section>
  );
}
