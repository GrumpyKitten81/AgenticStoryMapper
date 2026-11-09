import { ChangedMarker } from "@storymapper/web/features/what-changed";
import { useMemo, type ReactElement } from "react";
import "@storymapper/web/styles/slices.css";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { DndContext, useDraggable, useDroppable, type DragEndEvent } from "@dnd-kit/core";
import type { Card, SlicesReport } from "@storymapper/contracts";
import { buildSlicesReport } from "@storymapper/core";
import { storyMapStrings as strings } from "@storymapper/ui-strings";
import { useStoryMapBoardStateContext } from "@storymapper/web/app/routes/story-map-shell";
import { usePointerMoveDrag } from "@storymapper/web/features/story-map/components/usePointerMoveDrag";
import type { StoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";
import { BoardToolbar } from "@storymapper/web/features/story-map/components/BoardToolbar";
import { SliceLane } from "@storymapper/web/features/story-map/components/SliceLane";
import { SliceDependencyCues, sliceCuesByCard } from "@storymapper/web/features/story-map/components/SliceDependencyCues";
import { StorySliceMove } from "@storymapper/web/features/story-map/components/StorySliceMove";
import { PlanStateComparison } from "@storymapper/web/features/story-map/components/PlanStateComparison";
import { PlanDriftDrawer } from "@storymapper/web/features/reports";
import { PreviewMarker } from "@storymapper/web/components/PreviewMarker";
import { FilterAncestors } from "@storymapper/web/features/story-map/components/FilterAncestors";

export function SlicesView(): ReactElement {
  const state = useStoryMapBoardStateContext();
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { card?: string; preview?: string };
  const liveDrag = usePointerMoveDrag(state);
  const report = useMemo(() => buildSlicesReport(state.snapshot), [state.snapshot]);
  const cards = useMemo(() => new Map(state.snapshot.cards.map((card) => [card.id, card])), [state.snapshot.cards]);
  const visibleIds = useMemo(() => new Set(state.filtered.cards.map((card) => card.id)), [state.filtered.cards]);
  const cues = useMemo(() => sliceCuesByCard(report.dependencies), [report]);
  function drop(event: DragEndEvent): void {
    liveDrag.end();
    if (state.preview || !event.over) return;
    const card = cards.get(String(event.active.id));
    const lane = report.lanes.find((item) => `slice:${item.releaseId ?? "unscheduled"}` === String(event.over!.id));
    if (!card || !visibleIds.has(card.id) || !lane || card.releaseId === lane.releaseId) return;
    state.moveCard.mutate({ cardId: card.id, baseVersion: liveDrag.baseVersion(), patch: { parentId: card.parentId, releaseId: lane.releaseId, position: state.snapshot.cards.filter((item) => item.level === "story" && item.parentId === card.parentId && item.releaseId === lane.releaseId).length } }, {
      onSuccess: () => {
        requestAnimationFrame(() => { if (document.activeElement === document.body) document.querySelector<HTMLElement>(`button[data-card-id="${card.id}"]`)?.focus(); });
      }
    });
  }
  return <section className="board-workspace slices-workspace">
    {!state.preview ? <BoardToolbar state={state} displayedCardIds={new Set(report.lanes.flatMap((lane) => lane.storyIds).filter((id) => visibleIds.has(id)))} /> : null}
    <FilterAncestors />
    <DndContext sensors={liveDrag.sensors} onDragStart={liveDrag.start} onDragCancel={liveDrag.end} onDragEnd={drop}>
      <div className="slice-lanes" data-story-map-export-target="slices">{report.lanes.map((lane) => <DroppableLane key={lane.releaseId ?? "unscheduled"} lane={lane} dependencies={report.dependencies} cards={cards} disabled={Boolean(state.preview)}>{lane.storyIds.flatMap((id) => {
        const card = cards.get(id);
        return card ? [<SliceStory key={id} card={card} hidden={!visibleIds.has(id)} state={state} cues={cues.get(id) ?? []} select={() => void (navigate as (options: unknown) => Promise<void>)({ search: { ...search, card: id } })} />] : [];
      })}</DroppableLane>)}</div>
    </DndContext>
    <PlanStateComparison key={state.snapshot.storyMap.id} storyMapId={state.snapshot.storyMap.id} readOnly={Boolean(search.preview)} />
    <PlanDriftDrawer key={`drift:${state.snapshot.storyMap.id}`} storyMapId={state.snapshot.storyMap.id} readOnly={Boolean(state.preview)} />
  </section>;
}

function DroppableLane({ lane, dependencies, cards, disabled, children }: { lane: SlicesReport["lanes"][number]; dependencies: SlicesReport["dependencies"]; cards: ReadonlyMap<string, Card>; disabled: boolean; children: React.ReactNode }): ReactElement {
  const { setNodeRef, isOver } = useDroppable({ id: `slice:${lane.releaseId ?? "unscheduled"}`, disabled });
  return <div ref={setNodeRef} data-slice-drop-id={lane.releaseId ?? "unscheduled"} className={isOver ? "slice-drop-target droppable-over" : "slice-drop-target"}><SliceLane lane={lane} dependencies={dependencies} cards={cards}>{children}</SliceLane></div>;
}

function SliceStory({ card, hidden, state, cues, select }: { card: Card; hidden: boolean; state: StoryMapBoardState; cues: SlicesReport["dependencies"]; select: () => void }): ReactElement {
  const drag = useDraggable({ id: card.id, disabled: hidden || Boolean(state.preview) });
  return <article ref={drag.setNodeRef} hidden={hidden} className={`slice-story${state.filtered.matchingCardIds.has(card.id) ? "" : " filter-context"}`} data-live-card-id={card.id} style={drag.transform ? { transform: `translate3d(${drag.transform.x}px,${drag.transform.y}px,0)`, zIndex: 2 } : undefined}>
    <PreviewMarker marker={state.preview?.markers.find((marker) => marker.entity === "card" && marker.entityId === card.id)} />
    <button type="button" className="card-content-button" data-card-id={card.id} disabled={hidden || Boolean(state.preview)} onClick={select} aria-label={`${card.key} ${strings.story} ${card.title}`}><strong>{strings.sliceStoryTitle(card.key, card.title)}</strong><span>{strings.sliceStoryStatus(card.status, card.estimate)}</span></button>
    <ChangedMarker cardId={card.id} /><SliceDependencyCues cues={cues} />
    {!state.preview ? <button type="button" className="drag-handle" aria-label={strings.dragCard(card.title)} {...drag.attributes} {...drag.listeners}>{strings.sliceDragGlyph}</button> : null}
    <StorySliceMove card={card} state={state} />
  </article>;
}
