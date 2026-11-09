import { CardDependencyBadges, type CardDependencyKeys } from "@storymapper/web/components/CardDependencyBadges";
import type { ChangeSetPreviewBoard, Card, Release } from "@storymapper/contracts";
import { DndContext, type DragEndEvent, useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { buildSlicesReport, getChildren } from "@storymapper/core";
import { useLayoutEffect, useMemo, useRef } from "react";
import { SliceDependencyCues, sliceCuesByCard } from "@storymapper/web/features/story-map/components/SliceDependencyCues";
import { StorySliceMove } from "@storymapper/web/features/story-map/components/StorySliceMove";
import { CardTile, SortableCardTile } from "@storymapper/web/features/story-map/components/CardTile";
import { resolveStoryCellDropTarget, storyBoardCollisionDetection } from "@storymapper/web/features/story-map/drop-targets";
import type { StoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";
import { panelStrings, storyMapStrings as strings } from "@storymapper/ui-strings";
import { PreviewMarker } from "@storymapper/web/components/PreviewMarker";
import { usePointerMoveDrag } from "@storymapper/web/features/story-map/components/usePointerMoveDrag";

interface SwimlaneGridProps {
  state: StoryMapBoardState;
  onSelectCard: (cardId: string) => void;
}

type ReleaseRow = { id: string; label: string; releaseId: string | null; release?: Release };

export function SwimlaneGrid(props: SwimlaneGridProps) {
  const result = useSwimlaneGridState(props);
  if (result === null || !("liveDrag" in result)) return result;
  return renderSwimlaneGrid(result);
}

function useSwimlaneGridState({ state, onSelectCard }: SwimlaneGridProps) {
  const boardRef = useRef<HTMLDivElement>(null);
  const focused = useRef<HTMLElement | null>(null);
  const { planningShowAllReleases: showAllChosen, setPlanningShowAllReleases: setShowAll } = state;
  const showAll = showAllChosen || Boolean(state.preview);
  const liveDrag = usePointerMoveDrag(state);
  const dependencyCues = useMemo(() => sliceCuesByCard(buildSlicesReport(state.snapshot).dependencies), [state.snapshot]);
  const { snapshot, filtered, activities, selectedVisibleIds, toggleBulkSelection, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, releaseNameById, updateCard, moveCard } = state;
  const activityStepGroups = activities.map((activity) => ({
    activity,
    steps: getChildren(filtered.cards, activity.id).filter((card) => card.level === "step")
  }));
  const steps = activityStepGroups.flatMap((group) => group.steps);
  const rows: ReleaseRow[] = [
    ...snapshot.releases.slice().sort((left, right) => left.position - right.position).map((release) => ({
      id: `release:${release.id}`,
      label: release.name,
      releaseId: release.id,
      release
    })),
    { id: "release:unscheduled", label: strings.unscheduled, releaseId: null }
  ];
  useLayoutEffect(() => {
    const active = focused.current;
    if (active?.closest("[hidden]") && (document.activeElement === active || document.activeElement === document.body)) {
      boardRef.current?.focus();
      focused.current = null;
    }
  });
  const gridTemplateColumns = `180px repeat(${Math.max(steps.length, 1)}, minmax(190px, 1fr))`;

  function handleDragEnd(event: DragEndEvent) {
    if (state.preview) return;
    const activeCard = filtered.cards.find((card) => card.id === String(event.active.id));
    if (!activeCard || activeCard.level !== "story" || !event.over) return;
    const target = resolveStoryCellDropTarget(filtered.cards, String(event.over.id));
    if (!target) return;
    moveCard.mutate({
      cardId: activeCard.id, baseVersion: liveDrag.baseVersion(),
      patch: { parentId: target.parentId, position: target.position, releaseId: target.releaseId }
    });
  }

  if (steps.length === 0) {
    return <div className="empty-state">{strings.emptyPlanningSteps}</div>;
  }
  return { liveDrag, handleDragEnd, updateCard, showAll, state, setShowAll, boardRef, focused, gridTemplateColumns, activityStepGroups, dependencyKeys, steps, rows, filtered, dependencyCues, selectedVisibleIds, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, releaseNameById, onSelectCard, toggleBulkSelection };
}

function renderSwimlaneGrid(model: Exclude<ReturnType<typeof useSwimlaneGridState>, import("react").ReactElement | null>) {
  const { liveDrag, handleDragEnd, updateCard, showAll, state, setShowAll, boardRef, focused, gridTemplateColumns, activityStepGroups, dependencyKeys, steps, rows, filtered, dependencyCues, selectedVisibleIds, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, releaseNameById, onSelectCard, toggleBulkSelection } = model;
  return (
    <DndContext sensors={liveDrag.sensors} collisionDetection={storyBoardCollisionDetection} onDragStart={liveDrag.start} onDragCancel={liveDrag.end} onDragEnd={(event) => { liveDrag.end(); handleDragEnd(event); }}>
      {updateCard.error ? <p role="alert">{updateCard.error.message}</p> : null}
      <label className="checkbox-row"><input type="checkbox" checked={showAll} disabled={Boolean(state.preview)} onChange={(event) => setShowAll(event.target.checked)} />{panelStrings.showAllReleases}</label>
      <div className="swimlane-scroll" data-story-map-export-target="planning" ref={boardRef} tabIndex={-1} onFocusCapture={(event) => { focused.current = event.target as HTMLElement; }} onBlurCapture={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) focused.current = null; }}>
        <div className="swimlane-activity-header" style={{ gridTemplateColumns }}>
          <div className="swimlane-corner">{strings.release}</div>
          {activityStepGroups.filter((group) => group.steps.length > 0).map((group) => (
            <div className={`swimlane-activity-cell${filtered.matchingCardIds.has(group.activity.id) ? "" : " filter-context"}`} key={group.activity.id} style={{ gridColumn: `span ${group.steps.length}` }}>
              {group.activity.title}<PreviewMarker marker={state.preview?.markers.find((marker) => marker.entity === "card" && marker.entityId === group.activity.id)} />
              <div className="card-badges"><CardDependencyBadges dependencies={dependencyKeys[group.activity.id]} /></div>
            </div>
          ))}
        </div>
        <div className="swimlane-step-header" style={{ gridTemplateColumns }}>
          <div />
          {steps.map((step) => <div className={`swimlane-step-cell${filtered.matchingCardIds.has(step.id) ? "" : " filter-context"}`} key={step.id}>{step.title}<PreviewMarker marker={state.preview?.markers.find((marker) => marker.entity === "card" && marker.entityId === step.id)} /><div className="card-badges"><CardDependencyBadges dependencies={dependencyKeys[step.id]} /></div></div>)}
        </div>
        {renderSwimlaneColumns(model)}
      </div>
    </DndContext>
  );
}

function SwimlaneCell(props: {
  hidden: boolean;
  state: StoryMapBoardState;
  dependencyCues: Map<string, import("@storymapper/contracts").SliceDependencyCue[]>;
  preview: ChangeSetPreviewBoard | undefined;
  step: Card;
  row: ReleaseRow;
  stories: Card[];
  selectedVisibleIds: Set<string>;
  sourceCounts: Record<string, number>;
  githubIssueByCardId: Record<string, number>;
  githubStatusByCardId: Record<string, string>;
  externalRefsByCardId: Record<string, import("@storymapper/contracts").ExternalRef[]>;
  dependencyKeys: Record<string, CardDependencyKeys>;
  releaseNameById: Map<string, string>;
  onSelectCard: (cardId: string) => void;
  onBulkToggle: (cardId: string) => void;
  onUpdateCard: NonNullable<Parameters<typeof CardTile>[0]["onUpdateCard"]>;
}) {
  return renderSwimlaneCell(useSwimlaneCellState(props));
}

function useSwimlaneCellState({
  hidden,
  preview,
  step,
  row,
  stories,
  selectedVisibleIds,
  sourceCounts,
  githubIssueByCardId,
  githubStatusByCardId,
  externalRefsByCardId, dependencyKeys,
  releaseNameById,
  onSelectCard,
  onBulkToggle,
  onUpdateCard,
  state,
  dependencyCues
}: {
  hidden: boolean;
  state: StoryMapBoardState;
  dependencyCues: Map<string, import("@storymapper/contracts").SliceDependencyCue[]>;
  preview: ChangeSetPreviewBoard | undefined;
  step: Card;
  row: ReleaseRow;
  stories: Card[];
  selectedVisibleIds: Set<string>;
  sourceCounts: Record<string, number>;
  githubIssueByCardId: Record<string, number>;
  githubStatusByCardId: Record<string, string>;
  externalRefsByCardId: Record<string, import("@storymapper/contracts").ExternalRef[]>;
  dependencyKeys: Record<string, CardDependencyKeys>;
  releaseNameById: Map<string, string>;
  onSelectCard: (cardId: string) => void;
  onBulkToggle: (cardId: string) => void;
  onUpdateCard: NonNullable<Parameters<typeof CardTile>[0]["onUpdateCard"]>;
}) {
  const droppableId = `cell:${step.id}:${row.releaseId ?? "none"}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId, disabled: Boolean(preview) || hidden });
  return { hidden, preview, stories, isOver, setNodeRef, state, selectedVisibleIds, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, releaseNameById, onSelectCard, onBulkToggle, onUpdateCard, dependencyCues };
}

function renderSwimlaneCell({ hidden, preview, stories, isOver, setNodeRef, state, selectedVisibleIds, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, releaseNameById, onSelectCard, onBulkToggle, onUpdateCard, dependencyCues }: ReturnType<typeof useSwimlaneCellState>) {
  return (
    <SortableContext items={hidden || preview ? [] : stories.map((story) => story.id)} strategy={verticalListSortingStrategy}>
      <div className={isOver ? "swimlane-cell droppable-over" : "swimlane-cell"} ref={setNodeRef}>
        {stories.map((story) => (
          <div key={story.id}>
            <PlanningTile
              hidden={hidden}
              updatePending={state.updateCard.isPending}
              readOnly={hidden}
              preview={preview}
              key={story.id}
              card={story}
              estimationUnit={state.snapshot.storyMap.estimationUnit}
              variant="planning"
              bulkSelected={selectedVisibleIds.has(story.id)}
              sourceLinkCount={sourceCounts[story.id] ?? 0}
              githubIssue={githubIssueByCardId[story.id]}
              githubSyncState={githubStatusByCardId[story.id]}
              externalRefs={externalRefsByCardId[story.id]} dependencies={dependencyKeys[story.id]}
              releaseName={story.releaseId ? releaseNameById.get(story.releaseId) : undefined}
              onSelect={(id) => { if (!preview) onSelectCard(id); }}
              onBulkToggle={onBulkToggle}
              {...(preview ? {} : { onUpdateCard })}
            />
            <SliceDependencyCues cues={dependencyCues.get(story.id) ?? []} />
            <StorySliceMove card={story} state={state} />
          </div>
        ))}
      </div>
    </SortableContext>
  );
}

function PlanningTile({ preview, hidden, ...props }: Parameters<typeof CardTile>[0] & { preview: ChangeSetPreviewBoard | undefined; hidden: boolean }) {
  return preview ? <CardTile {...props} readOnly previewMarker={preview.markers.find((marker) => marker.entity === "card" && marker.entityId === props.card.id)} /> : <SortableCardTile {...props} hidden={hidden} />;
}

function renderSwimlaneColumns(model: Exclude<ReturnType<typeof useSwimlaneGridState>, import("react").ReactElement | null>) {
  const { rows, showAll, gridTemplateColumns, state, filtered, steps, dependencyCues, selectedVisibleIds, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, releaseNameById, onSelectCard, toggleBulkSelection, updateCard } = model;
  return <div className="swimlane-body">
    {rows.map((row) => (
      <div className="swimlane-row" hidden={!showAll && Boolean(row.release?.released)} key={row.id} style={{ gridTemplateColumns }}>
        <div className="swimlane-row-label">
          <strong className={state.preview?.markers.some((marker) => marker.entityId === row.releaseId && marker.kind === "removed") ? "preview-removed" : ""}>{row.label}</strong><PreviewMarker marker={state.preview?.markers.find((marker) => marker.entity === "release" && marker.entityId === row.releaseId)} />
          <span>{strings.countStories(filtered.cards.filter((card) => card.level === "story" && (card.releaseId ?? null) === row.releaseId).length)}</span>
        </div>
        {steps.map((step) => {
          const stories = getChildren(filtered.cards, step.id).filter((card) => card.level === "story" && (card.releaseId ?? null) === row.releaseId);
          return (
            <SwimlaneCell
              key={`${row.id}:${step.id}`}
              hidden={!showAll && Boolean(row.release?.released)}
              preview={state.preview}
              step={step}
              row={row}
              stories={stories}
              state={state}
              dependencyCues={dependencyCues}
              selectedVisibleIds={selectedVisibleIds}
              sourceCounts={sourceCounts}
              githubIssueByCardId={githubIssueByCardId}
              githubStatusByCardId={githubStatusByCardId}
              externalRefsByCardId={externalRefsByCardId} dependencyKeys={dependencyKeys}
              releaseNameById={releaseNameById}
              onSelectCard={onSelectCard}
              onBulkToggle={toggleBulkSelection}
              onUpdateCard={(cardId, patch, baseVersion) => patch.businessValue !== undefined || patch.effort !== undefined ? updateCard.mutateAsync({ cardId, patch, ...(baseVersion !== undefined ? { baseVersion } : {}) }) : updateCard.mutate({ cardId, patch })}
            />
          );
        })}
      </div>
    ))}
  </div>;
}
