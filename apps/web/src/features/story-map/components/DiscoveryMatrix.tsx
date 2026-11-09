import { DiscoveryNavigationContext, useDiscoveryGrid, type DiscoveryLocation } from "@storymapper/web/features/story-map/components/discovery-navigation";
import { DeleteCardsDialog } from "@storymapper/web/features/story-map/components/DeleteCardsDialog";
import { CardComposer } from "@storymapper/web/features/story-map/components/CardComposer";
import { cardLevelMeta } from "@storymapper/web/features/story-map/card-taxonomy";
import type { Card, CardLevel } from "@storymapper/contracts";
import { DndContext, PointerSensor, useSensor, useSensors, type DragEndEvent } from "@dnd-kit/core";
import { getChildren } from "@storymapper/core";
import { Pin, Plus } from "lucide-react";
import type React from "react";
import { useLayoutEffect, useRef, useState } from "react";
import { AddControl, DraggableCardTile, DroppableCell, NotAssignedLane, ReleaseSection, type DiscoveryColumn, type ReleaseBand } from "@storymapper/web/features/story-map/components/DiscoveryLanes";
import { resolveStoryCellDropTarget, storyBoardCollisionDetection } from "@storymapper/web/features/story-map/drop-targets";
import { useDiscoveryLaneCollapseStore } from "@storymapper/web/app/stores/discovery-lane-collapse-store";
import type { StoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";
import { ReleaseDeleteDialog } from "@storymapper/web/features/story-map/components/ReleaseDeleteDialog";
import { LifecycleDialog } from "@storymapper/web/features/story-map/components/LifecycleDialog";
import { MoveAreaDialog } from "@storymapper/web/features/story-map/components/MoveAreaDialog";
import { storyMapStrings as strings } from "@storymapper/ui-strings";
import { useLiveDrag } from "@storymapper/web/app/live/live-interaction-store";

const CARD_COLUMN_WIDTH = "232px";

interface DiscoveryMatrixProps {
  state: StoryMapBoardState;
  zoom: number;
  onSelectCard: (cardId: string) => void;
}

export function DiscoveryMatrix(props: DiscoveryMatrixProps) {
  return renderDiscoveryMatrix(useDiscoveryMatrixState(props));
}

function useDiscoveryMatrixState(props: DiscoveryMatrixProps) {
  const context = useDiscoveryDrag(props);
  const { state, snapshot, activities, createRelease, moveCard, setOpenAddKey, newReleaseName, setNewReleaseName } = context;

  function submitRelease() {
    if (state.preview) return;
    const name = newReleaseName.trim();
    if (!name) return;
    createRelease.mutate({ storyMapId: snapshot.storyMap.id, name });
    setNewReleaseName("");
    setOpenAddKey(null);
  }

  function moveActivity(activityId: string, direction: "left" | "right") {
    if (state.preview) return;
    const index = activities.findIndex((activity) => activity.id === activityId);
    if (index < 0) return;
    const neighbor = direction === "left" ? activities[index - 1] : activities[index + 1];
    if (!neighbor) return;
    const others = activities.filter((activity) => activity.id !== activityId);
    const neighborIndex = others.findIndex((activity) => activity.id === neighbor.id);
    const targetIndex = direction === "left" ? neighborIndex : neighborIndex + 1;
    moveCard.mutate({ cardId: activityId, patch: { parentId: null, position: targetIndex } });
  }
  return { ...context, moveActivity, submitRelease };
}

function renderDiscoveryMatrix(model: ReturnType<typeof useDiscoveryMatrixState>) {
  const { navigation, sensors, state, dragVersion, liveDrag, handleDragEnd, activities, createCard, setComposer, composer, onSelectCard, scrollRef, gridRef, visibleColumns, notAssignedRow, gridTemplateColumns, activityRowHeight, zoom, pinnedNotAssigned, notAssignedHeight, pinnedUnscheduled, unscheduledCellHeight, activityStepGroups, hierarchyVisibleIds, boardCards, selectedVisibleIds, snapshot, prepareFocusRecovery, storyMapId, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, workItemProviderByCardId, releaseNameById, toggleBulkSelection, updateCard, handleDeleteStory, setParkTarget, moveActivity, columns, columnIndices, releases, filtered, orderedReleases, releaseRows, setPinnedUnscheduled, collapsedLaneSet, toggleLane, setMoveAreaTarget, updateRelease, setReleaseTarget, notAssignedRef, setPinnedNotAssigned, notAssignedCards, retainedNotAssignedCards, openAddKey, newReleaseName, setOpenAddKey, setNewReleaseName, submitRelease, deleteTarget, setDeleteTarget, parkTarget, moveAreaTarget, releaseTarget } = model;
  return (
    <DiscoveryNavigationContext.Provider value={navigation}><DndContext sensors={state.preview ? [] : sensors} collisionDetection={storyBoardCollisionDetection} onDragStart={(event) => { dragVersion.current = state.captureMoveVersion(String(event.active.id)); navigation.activate(String(event.active.id)); liveDrag.start(); }} onDragCancel={liveDrag.end} onDragEnd={(event) => { liveDrag.end(); handleDragEnd(event); }}>
      {composer && !state.preview ? <CardComposer state={state} level={composer.level} initialParentId={composer.parentId ?? null} initialReleaseId={composer.releaseId ?? null} onClose={() => setComposer(null)} onSelectCard={onSelectCard} /> : null}
      <div className="discovery-matrix-scroll" data-story-map-export-target="discovery" ref={scrollRef}>
        <section
          ref={gridRef}
          role="grid"
          tabIndex={-1}
          className="discovery-matrix"
          aria-label={strings.discoveryStoryMap}
          aria-multiselectable="true"
          aria-colcount={visibleColumns.length}
          aria-rowcount={notAssignedRow + 2}
          style={{ gridTemplateColumns, "--discovery-activity-h": activityRowHeight ? `${activityRowHeight}px` : "auto", "--discovery-zoom": zoom, "--pinned-na-h": pinnedNotAssigned ? `${notAssignedHeight}px` : "0px", "--pinned-unscheduled-h": pinnedUnscheduled ? `${unscheduledCellHeight}px` : "0px" } as React.CSSProperties}
        >
          <div role="row" aria-rowindex={1} style={{ display: "contents" }}>{activityStepGroups.map((group, groupIndex) => renderDiscoveryActivity(model, group, groupIndex))}
            <div role="columnheader" aria-colindex={visibleColumns.length} className="discovery-activity-cell discovery-add-activity-cell">
              <button type="button" className="add-tile add-tile-thin" aria-label={strings.newActivity} title={strings.newActivity} disabled={Boolean(state.preview)} onClick={() => { createCard.reset(); setComposer({ level: "activity" }); }}><Plus size={14} /></button>
            </div>

          </div><div role="row" aria-rowindex={2} style={{ display: "contents" }}>{columns.map((column, index) => renderDiscoveryStepColumn(model, column, index))}

          </div>{releases.map((release, index) => renderDiscoveryReleaseBand(model, release, index))}

          {renderDiscoveryNotAssignedLane(model)}

          {renderDiscoveryAddRelease(model)}
        </section>
      </div>
      {deleteTarget ? <DeleteCardsDialog cards={deleteTarget} state={state} onClose={() => setDeleteTarget(null)} /> : null}
      {parkTarget ? <LifecycleDialog card={parkTarget} snapshot={snapshot} action="park" onClose={() => setParkTarget(null)} onNotice={state.setLifecycleNotice} /> : null}
      {moveAreaTarget && !state.preview ? <MoveAreaDialog target={moveAreaTarget} state={state} onClose={() => setMoveAreaTarget(null)} /> : null}
      {releaseTarget?.releaseId ? <ReleaseDeleteDialog releaseId={releaseTarget.releaseId} name={releaseTarget.label} snapshot={snapshot} onClose={() => setReleaseTarget(null)} onNotice={state.setLifecycleNotice} /> : null}
    </DndContext></DiscoveryNavigationContext.Provider>
  );
}

function columnWidth(column: DiscoveryColumn): string {
  if (column.kind === "step") return CARD_COLUMN_WIDTH;
  if (column.kind === "add-step" && !column.hasSteps) return CARD_COLUMN_WIDTH;
  return "42px";
}

function useDiscoverySelection({ state, zoom, onSelectCard }: DiscoveryMatrixProps) {
  const liveDrag = useLiveDrag();
  const sensors = useSensors(useSensor(PointerSensor));
  const dragVersion = useRef<number | undefined>(undefined);
  const [composer, setComposer] = useState<{ level: CardLevel; parentId?: string; releaseId?: string | null } | null>(null);
  const {
    snapshot,
    filtered,
    boardCards,
    activities,
    selectedVisibleIds,
    toggleBulkSelection,
    createCard,
    createRelease,
    updateRelease,
    updateCard,
    sourceCounts,
    githubIssueByCardId,
    githubStatusByCardId,
    externalRefsByCardId, dependencyKeys,
    externalRefsByReleaseId,
    workItemProviderByCardId,
    releaseNameById,
    moveCard
  } = state;
  const [openAddKey, setOpenAddKey] = useState<string | null>(null);
  const [newReleaseName, setNewReleaseName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<Card[] | null>(null);
  const [moveAreaTarget, setMoveAreaTarget] = useState<Card | null>(null);
  const [releaseTarget, setReleaseTarget] = useState<ReleaseBand | null>(null);
  const [parkTarget, setParkTarget] = useState<Card | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [activityRowHeight, setActivityRowHeight] = useState(0);
  const [pinnedUnscheduled, setPinnedUnscheduled] = useState(false);
  const [pinnedNotAssigned, setPinnedNotAssigned] = useState(false);
  const notAssignedRef = useRef<HTMLDivElement>(null);
  return { state, zoom, onSelectCard, liveDrag, sensors, dragVersion, composer, setComposer, snapshot, filtered, boardCards, activities, selectedVisibleIds, toggleBulkSelection, createCard, createRelease, updateRelease, updateCard, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, externalRefsByReleaseId, workItemProviderByCardId, releaseNameById, moveCard, openAddKey, setOpenAddKey, newReleaseName, setNewReleaseName, deleteTarget, setDeleteTarget, moveAreaTarget, setMoveAreaTarget, releaseTarget, setReleaseTarget, parkTarget, setParkTarget, scrollRef, activityRowHeight, setActivityRowHeight, pinnedUnscheduled, setPinnedUnscheduled, pinnedNotAssigned, setPinnedNotAssigned, notAssignedRef };
}

function useDiscoveryColumns(props: DiscoveryMatrixProps) {
  const context = useDiscoverySelection(props);
  const { snapshot, filtered, boardCards } = context;
  const [notAssignedHeight, setNotAssignedHeight] = useState(0);
  const [unscheduledCellHeight, setUnscheduledCellHeight] = useState(0);
  const storyMapId = snapshot.storyMap.id;
  const hierarchyVisibleIds = filtered.visibleCardIds;
  const collapsedLaneIds = useDiscoveryLaneCollapseStore((store) => store.collapsedByMap[storyMapId]);
  const toggleLane = useDiscoveryLaneCollapseStore((store) => store.toggleLane);
  const collapsedLaneSet = new Set(collapsedLaneIds ?? []);
  const retainedActivities = getChildren(boardCards, null).filter((card) => card.level === "activity");
  const activityStepGroups = retainedActivities.map((activity) => ({
    activity,
    steps: getChildren(boardCards, activity.id).filter((card) => card.level === "step")
  }));
  const columns: DiscoveryColumn[] = activityStepGroups.flatMap((group, groupIndex): DiscoveryColumn[] => [
    ...group.steps.map((step): DiscoveryColumn => ({
      kind: "step",
      activity: group.activity,
      step,
      groupIndex,
      groupStart: group.steps.find((card) => hierarchyVisibleIds.has(card.id))?.id === step.id
    })),
    { kind: "add-step", activity: group.activity, groupIndex, hasSteps: group.steps.some((card) => hierarchyVisibleIds.has(card.id)) }
  ]);
  columns.push({ kind: "add-activity" });
  const orderedReleases = snapshot.releases.slice().sort((left, right) => left.position - right.position);
  return { ...context, notAssignedHeight, setNotAssignedHeight, unscheduledCellHeight, setUnscheduledCellHeight, storyMapId, hierarchyVisibleIds, collapsedLaneIds, toggleLane, collapsedLaneSet, activityStepGroups, columns, orderedReleases };
}

function useDiscoveryLocations(props: DiscoveryMatrixProps) {
  const context = useDiscoveryColumns(props);
  const { state, snapshot, boardCards, externalRefsByReleaseId, setDeleteTarget, hierarchyVisibleIds, activityStepGroups, columns, orderedReleases } = context;
  const releases: ReleaseBand[] = [
    ...orderedReleases.map((release) => ({
      id: `release:${release.id}`,
      label: release.name,
      releaseId: release.id,
      release,
      externalRefs: externalRefsByReleaseId[release.id] ?? []
    })),
    { id: "release:unscheduled", label: strings.unscheduledCards, releaseId: null }
  ];
  const retainedNotAssignedRoots = getChildren(boardCards, null).filter((card) => card.level !== "activity");
  const notAssignedRoots = retainedNotAssignedRoots.filter((card) => hierarchyVisibleIds.has(card.id));
  const flattenCard = (card: Card): Card[] => [card, ...getChildren(boardCards, card.id).flatMap(flattenCard)];
  const retainedNotAssignedCards = retainedNotAssignedRoots.flatMap(flattenCard);
  const notAssignedCards = retainedNotAssignedCards.filter((card) => hierarchyVisibleIds.has(card.id));
  function handleDeleteStory(cardId: string) {
    if (state.preview) return;
    const ids = state.selectedIds.has(cardId) ? state.selectedIds : new Set([cardId]);
    setDeleteTarget(snapshot.cards.filter((card) => ids.has(card.id)));
  }
  const locations: DiscoveryLocation[] = [];
  const append = (cards: Card[], lane: number, column: number, columnEnd = column) => cards.filter((card) => hierarchyVisibleIds.has(card.id)).forEach((card, stack) => locations.push({ id: card.id, lane, column, columnEnd, stack }));
  activityStepGroups.forEach((group) => {
    const groupColumns = columns.flatMap((column, index) => column.kind !== "add-activity" && column.activity.id === group.activity.id ? [index] : []);
    append([group.activity, ...getChildren(boardCards, group.activity.id).filter((card) => card.level === "note")], 0, groupColumns[0]!, groupColumns.at(-1)!);
  });
  const steps = columns.flatMap((column) => column.kind === "step" ? [column.step] : []);
  const stepColumn = (step: Card) => columns.findIndex((column) => column.kind === "step" && column.step.id === step.id);
  steps.forEach((step) => append([step], 1, stepColumn(step)));
  return { ...context, releases, notAssignedRoots, retainedNotAssignedCards, notAssignedCards, handleDeleteStory, locations, append, steps, stepColumn };
}

function useDiscoveryMeasurements(props: DiscoveryMatrixProps) {
  const context = useDiscoveryLocations(props);
  const { state, zoom, snapshot, filtered, boardCards, toggleBulkSelection, setMoveAreaTarget, scrollRef, pinnedUnscheduled, pinnedNotAssigned, notAssignedRef, setNotAssignedHeight, setUnscheduledCellHeight, hierarchyVisibleIds, collapsedLaneIds, collapsedLaneSet, columns, releases, retainedNotAssignedCards, notAssignedCards, handleDeleteStory, locations, append, steps, stepColumn } = context;
  releases.forEach((release, index) => {
    if (collapsedLaneSet.has(release.id)) return;
    steps.forEach((step) => {
      if (hierarchyVisibleIds.has(step.id)) append(getChildren(boardCards, step.id).filter((card) => (card.level === "story" || card.level === "note") && (card.releaseId ?? null) === release.releaseId), index + 2, stepColumn(step));
    });
  });
  retainedNotAssignedCards.filter((card) => hierarchyVisibleIds.has(card.id)).forEach((card, column) => append([card], releases.length + 2, column));
  const { gridRef, navigation, prepareFocusRecovery } = useDiscoveryGrid(locations, (id) => { if (!state.preview) setMoveAreaTarget(snapshot.cards.find((card) => card.id === id) ?? null); }, handleDeleteStory, toggleBulkSelection, Boolean(state.preview));
  useLayoutEffect(() => {
    const element = notAssignedRef.current;
    if (!element) return;
    const update = () => setNotAssignedHeight(element.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, [pinnedNotAssigned, notAssignedCards.length]);
  useLayoutEffect(() => {
    if (!pinnedUnscheduled) {
      setUnscheduledCellHeight(0);
      return;
    }
    const cell = scrollRef.current?.querySelector<HTMLElement>(".discovery-unscheduled-cell:not([hidden])");
    if (!cell) {
      setUnscheduledCellHeight(0);
      return;
    }
    const update = () => setUnscheduledCellHeight(cell.getBoundingClientRect().height);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(cell);
    return () => observer.disconnect();
  }, [pinnedUnscheduled, filtered.cards, zoom, collapsedLaneIds]);
  const visibleColumns = columns.filter((column) => column.kind === "add-activity" || hierarchyVisibleIds.has(column.kind === "step" ? column.step.id : column.activity.id));
  return { ...context, gridRef, navigation, prepareFocusRecovery, visibleColumns };
}

function dropDiscoveryActivity(active: Card, overId: string, { filtered, activities, moveCard, dragVersion }: ReturnType<typeof useDiscoveryMeasurements>) {
  if (!overId.startsWith("activity:")) return;
  const targetId = overId.slice("activity:".length);
  if (targetId === active.id) return;
  const others = activities.filter((activity) => activity.id !== active.id);
  const targetIndex = others.findIndex((activity) => activity.id === targetId);
  if (targetIndex < 0) return;
  moveCard.mutate({ cardId: active.id, baseVersion: dragVersion.current!, patch: { parentId: null, position: targetIndex } });
  return;
}

function dropDiscoveryStep(active: Card, overId: string, { filtered, activities, moveCard, dragVersion }: ReturnType<typeof useDiscoveryMeasurements>) {
  if (overId === "notassigned") {
    const count = getChildren(filtered.cards, null).filter((card) => card.level === "step").length;
    moveCard.mutate({ cardId: active.id, baseVersion: dragVersion.current!, patch: { parentId: null, position: count } });
    return;
  }
  let epicId: string | null = null;
  let position: number | undefined;
  if (overId.startsWith("activity:")) {
    epicId = overId.slice("activity:".length);
  } else if (overId.startsWith("epic:")) {
    epicId = overId.slice("epic:".length);
  } else if (overId.startsWith("step:")) {
    const targetStepId = overId.slice("step:".length);
    if (targetStepId === active.id) return;
    const targetStep = filtered.cards.find((card) => card.id === targetStepId);
    epicId = targetStep?.parentId ?? null;
    if (!epicId) {
      const count = getChildren(filtered.cards, null).filter((card) => card.level === "step").length;
      moveCard.mutate({ cardId: active.id, baseVersion: dragVersion.current!, patch: { parentId: null, position: count } });
      return;
    }
    const others = getChildren(filtered.cards, epicId).filter((card) => card.level === "step" && card.id !== active.id);
    position = Math.max(0, others.findIndex((card) => card.id === targetStepId));
  } else {
    return;
  }
  if (!epicId) return;
  if (position === undefined) {
    position = getChildren(filtered.cards, epicId).filter((card) => card.level === "step" && card.id !== active.id).length;
  }
  moveCard.mutate({ cardId: active.id, baseVersion: dragVersion.current!, patch: { parentId: epicId, position } });
  return;
}

function useDiscoveryDrag(props: DiscoveryMatrixProps) {
  const model = useDiscoveryMeasurements(props);
  const { state, zoom, onSelectCard, liveDrag, sensors, dragVersion, composer, setComposer, snapshot, filtered, boardCards, activities, selectedVisibleIds, toggleBulkSelection, createCard, createRelease, updateRelease, updateCard, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, workItemProviderByCardId, releaseNameById, moveCard, openAddKey, setOpenAddKey, newReleaseName, setNewReleaseName, deleteTarget, setDeleteTarget, moveAreaTarget, setMoveAreaTarget, releaseTarget, setReleaseTarget, parkTarget, setParkTarget, scrollRef, activityRowHeight, setActivityRowHeight, pinnedUnscheduled, setPinnedUnscheduled, pinnedNotAssigned, setPinnedNotAssigned, notAssignedRef, notAssignedHeight, unscheduledCellHeight, storyMapId, hierarchyVisibleIds, toggleLane, collapsedLaneSet, activityStepGroups, columns, orderedReleases, releases, notAssignedRoots, retainedNotAssignedCards, notAssignedCards, handleDeleteStory, gridRef, navigation, prepareFocusRecovery, visibleColumns } = model;
  const columnIndices = columns.map((column) => visibleColumns.indexOf(column) + 1);
  const releaseRows = releases.map((release, index) => 3 + releases.slice(0, index).reduce((count, item) => count + (collapsedLaneSet.has(item.id) ? 1 : 2), 0));
  const notAssignedRow = 3 + releases.reduce((count, release) => count + (collapsedLaneSet.has(release.id) ? 1 : 2), 0);
  const gridTemplateColumns = visibleColumns.length === 1 ? CARD_COLUMN_WIDTH : visibleColumns.map(columnWidth).join(" ");
  useLayoutEffect(() => {
    const cell = scrollRef.current?.querySelector<HTMLElement>(".discovery-activity-cell:not([hidden])");
    if (!cell) return;
    const update = () => setActivityRowHeight(cell.offsetHeight);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(cell);
    return () => observer.disconnect();
  }, [columns.length, activities, zoom]);
  function handleDragEnd(event: DragEndEvent) {
    if (state.preview) return;
    const active = filtered.cards.find((card) => card.id === String(event.active.id));
    if (!active || !event.over) return;
    const overId = String(event.over.id);

    if (active.level === "activity") return dropDiscoveryActivity(active, overId, model);

    if (active.level === "step") return dropDiscoveryStep(active, overId, model);

    if (overId === "notassigned") {
      moveCard.mutate({ cardId: active.id, baseVersion: dragVersion.current!, patch: { parentId: null, position: notAssignedRoots.length, releaseId: null } });
      return;
    }
    const target = resolveStoryCellDropTarget(filtered.cards, overId);
    if (!target) return;
    moveCard.mutate({ cardId: active.id, baseVersion: dragVersion.current!, patch: { parentId: target.parentId, position: target.position, releaseId: target.releaseId } });
  }
  return { state, zoom, onSelectCard, liveDrag, sensors, dragVersion, composer, setComposer, snapshot, filtered, boardCards, activities, selectedVisibleIds, toggleBulkSelection, createCard, createRelease, updateRelease, updateCard, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, workItemProviderByCardId, releaseNameById, moveCard, openAddKey, setOpenAddKey, newReleaseName, setNewReleaseName, deleteTarget, setDeleteTarget, moveAreaTarget, setMoveAreaTarget, releaseTarget, setReleaseTarget, parkTarget, setParkTarget, scrollRef, activityRowHeight, pinnedUnscheduled, setPinnedUnscheduled, pinnedNotAssigned, setPinnedNotAssigned, notAssignedRef, notAssignedHeight, unscheduledCellHeight, storyMapId, hierarchyVisibleIds, toggleLane, collapsedLaneSet, activityStepGroups, columns, orderedReleases, releases, retainedNotAssignedCards, notAssignedCards, handleDeleteStory, gridRef, navigation, prepareFocusRecovery, visibleColumns, columnIndices, releaseRows, notAssignedRow, gridTemplateColumns, handleDragEnd };
}

function renderDiscoveryNotAssignedLane(model: ReturnType<typeof useDiscoveryMatrixState>) {
  const { notAssignedRef, pinnedNotAssigned, notAssignedRow, visibleColumns, setPinnedNotAssigned, notAssignedCards, selectedVisibleIds, state, snapshot, retainedNotAssignedCards, prepareFocusRecovery, storyMapId, hierarchyVisibleIds, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, workItemProviderByCardId, releaseNameById, zoom, onSelectCard, toggleBulkSelection, updateCard, handleDeleteStory } = model;
  return <div ref={notAssignedRef} className={`discovery-pinned-block${pinnedNotAssigned ? " pinned" : ""}`}>
    <div role="row" aria-rowindex={notAssignedRow}><div role="rowheader" aria-colindex={1} aria-colspan={visibleColumns.length} className="release-band-header not-assigned-header">
      <div className="lane-header-left">
        <button type="button" className={pinnedNotAssigned ? "lane-pin pinned" : "lane-pin"} aria-pressed={pinnedNotAssigned} title={pinnedNotAssigned ? strings.unpinLane : strings.pinLane} onClick={() => setPinnedNotAssigned((value) => !value)}>
          <Pin size={14} />
        </button>
        <strong>{strings.notAssigned}</strong>
      </div>
      <span>{strings.countCards(notAssignedCards.length)}</span>
    </div>
    </div><div role="row" aria-rowindex={notAssignedRow + 1}><div role="gridcell" aria-colindex={1} aria-colspan={visibleColumns.length} aria-selected={notAssignedCards.some((card) => selectedVisibleIds.has(card.id))} aria-description={strings.selectedCellCards(notAssignedCards.filter((card) => selectedVisibleIds.has(card.id)).map((card) => card.key))}>
      <NotAssignedLane
        preview={state.preview}
        personaNamesByCardId={state.personaNamesByCardId}
        estimationUnit={snapshot.storyMap.estimationUnit}
        cards={retainedNotAssignedCards}
        visibleCardIds={hierarchyVisibleIds}
        selectedVisibleIds={selectedVisibleIds}
        sourceCounts={sourceCounts}
        githubIssueByCardId={githubIssueByCardId}
        githubStatusByCardId={githubStatusByCardId}
        externalRefsByCardId={externalRefsByCardId} dependencyKeys={dependencyKeys}
        workItemProviderByCardId={workItemProviderByCardId}
        releaseNameById={releaseNameById}
        zoom={zoom}
        onSelectCard={onSelectCard}
        onBulkToggle={toggleBulkSelection}
        onUpdateCard={(cardId, patch) => updateCard.mutate({ cardId, patch })}
        onDeleteCard={handleDeleteStory}
      /></div></div>
  </div>;
}

function renderDiscoveryAddRelease(model: ReturnType<typeof useDiscoveryMatrixState>) {
  const { notAssignedRow, visibleColumns, state, openAddKey, newReleaseName, setOpenAddKey, setNewReleaseName, submitRelease } = model;
  return <div role="row" aria-rowindex={notAssignedRow + 2} className="discovery-add-release"><div role="gridcell" aria-colindex={1} aria-colspan={visibleColumns.length}>
    <AddControl
      disabled={Boolean(state.preview)}
      open={openAddKey === "release-add"}
      label={strings.newReleaseLane}
      placeholder={strings.newReleaseName}
      value={newReleaseName}
      onOpen={() => setOpenAddKey("release-add")}
      onChange={setNewReleaseName}
      onSubmit={submitRelease}
      onClose={() => setOpenAddKey(null)}
    /></div></div>;
}

function renderDiscoveryActivity(model: ReturnType<typeof useDiscoveryMatrixState>, group: ReturnType<typeof useDiscoveryMatrixState>["activityStepGroups"][number], groupIndex: number) {
  const { hierarchyVisibleIds, boardCards, selectedVisibleIds, visibleColumns, snapshot, state, prepareFocusRecovery, storyMapId, zoom, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, workItemProviderByCardId, releaseNameById, onSelectCard, toggleBulkSelection, updateCard, handleDeleteStory, setParkTarget, activities, moveActivity, createCard, setComposer } = model;
  return <DroppableCell
    hidden={!hierarchyVisibleIds.has(group.activity.id)}
    selectedKeys={[group.activity, ...getChildren(boardCards, group.activity.id).filter((card) => card.level === "note")].filter((card) => hierarchyVisibleIds.has(card.id) && selectedVisibleIds.has(card.id)).map((card) => card.key)}
    colIndex={visibleColumns.findIndex((column) => column.kind !== "add-activity" && column.activity.id === group.activity.id) + 1}
    colSpan={group.steps.filter((step) => hierarchyVisibleIds.has(step.id)).length + 1}
    id={`activity:${group.activity.id}`}
    key={group.activity.id}
    className={`discovery-activity-cell${groupIndex % 2 === 1 ? " epic-lane-alt" : ""} epic-lane-start`}
    style={{ gridColumn: `span ${group.steps.filter((step) => hierarchyVisibleIds.has(step.id)).length + 1}` }}
  >
    <DraggableCardTile
      hidden={!hierarchyVisibleIds.has(group.activity.id)}
      estimationUnit={snapshot.storyMap.estimationUnit}
      personaNames={state.personaNamesByCardId[group.activity.id]}
      previewMarker={state.preview?.markers.find((marker) => marker.entity === "card" && marker.entityId === group.activity.id)}
      card={group.activity}
      zoom={zoom}
      bulkSelected={selectedVisibleIds.has(group.activity.id)}
      sourceLinkCount={sourceCounts[group.activity.id] ?? 0}
      githubIssue={githubIssueByCardId[group.activity.id]}
      githubSyncState={githubStatusByCardId[group.activity.id]}
      externalRefs={externalRefsByCardId[group.activity.id]} dependencies={dependencyKeys[group.activity.id]}
      workItemProvider={workItemProviderByCardId[group.activity.id]}
      releaseName={group.activity.releaseId ? releaseNameById.get(group.activity.releaseId) : undefined}
      onSelect={onSelectCard}
      onBulkToggle={toggleBulkSelection}
      onUpdateCard={(cardId, patch) => updateCard.mutate({ cardId, patch })}
      onDelete={() => handleDeleteStory(group.activity.id)}
      onAddNote={state.preview ? undefined : () => { createCard.reset(); setComposer({ level: "note", parentId: group.activity.id }); }}
      onMoveToArea={() => { if (!state.preview) setParkTarget(group.activity); }}
      onMoveLeft={activities.findIndex((card) => card.id === group.activity.id) > 0 ? () => moveActivity(group.activity.id, "left") : undefined}
      onMoveRight={activities.findIndex((card) => card.id === group.activity.id) >= 0 && activities.findIndex((card) => card.id === group.activity.id) < activities.length - 1 ? () => moveActivity(group.activity.id, "right") : undefined}
    />
    {getChildren(boardCards, group.activity.id).filter((card) => card.level === "note").map((card) => <DraggableCardTile key={card.id} previewMarker={state.preview?.markers.find((marker) => marker.entity === "card" && marker.entityId === card.id)} card={card} personaNames={state.personaNamesByCardId[card.id]} hidden={!hierarchyVisibleIds.has(card.id)} zoom={zoom} estimationUnit={snapshot.storyMap.estimationUnit} bulkSelected={selectedVisibleIds.has(card.id)} sourceLinkCount={sourceCounts[card.id] ?? 0} githubIssue={githubIssueByCardId[card.id]} githubSyncState={githubStatusByCardId[card.id]} externalRefs={externalRefsByCardId[card.id]} dependencies={dependencyKeys[card.id]} workItemProvider={workItemProviderByCardId[card.id]} onDelete={() => handleDeleteStory(card.id)} releaseName={card.releaseId ? releaseNameById.get(card.releaseId) : undefined} onSelect={onSelectCard} onBulkToggle={toggleBulkSelection} onUpdateCard={(cardId, patch) => updateCard.mutate({ cardId, patch })} />)}
  </DroppableCell>;
}

function renderDiscoveryStepColumn(model: ReturnType<typeof useDiscoveryMatrixState>, column: DiscoveryColumn, index: number) {
  const { hierarchyVisibleIds, columnIndices, selectedVisibleIds, snapshot, state, prepareFocusRecovery, storyMapId, zoom, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, workItemProviderByCardId, releaseNameById, onSelectCard, toggleBulkSelection, updateCard, handleDeleteStory, createCard, setComposer, visibleColumns } = model;

  if (column.kind === "step") {
    const laneClass = `discovery-step-cell${column.groupIndex % 2 === 1 ? " epic-lane-alt" : ""}${column.groupStart ? " epic-lane-start" : ""}`;
    return (
      <DroppableCell selectedKeys={selectedVisibleIds.has(column.step.id) ? [column.step.key] : []} colIndex={columnIndices[index]!} hidden={!hierarchyVisibleIds.has(column.step.id)} id={`step:${column.step.id}`} className={laneClass} key={column.step.id}>
        <DraggableCardTile
          hidden={!hierarchyVisibleIds.has(column.step.id)}
          estimationUnit={snapshot.storyMap.estimationUnit}
          personaNames={state.personaNamesByCardId[column.step.id]}
          previewMarker={state.preview?.markers.find((marker) => marker.entity === "card" && marker.entityId === column.step.id)}
          card={column.step}
          zoom={zoom}
          bulkSelected={selectedVisibleIds.has(column.step.id)}
          sourceLinkCount={sourceCounts[column.step.id] ?? 0}
          githubIssue={githubIssueByCardId[column.step.id]}
          githubSyncState={githubStatusByCardId[column.step.id]}
          externalRefs={externalRefsByCardId[column.step.id]} dependencies={dependencyKeys[column.step.id]}
          workItemProvider={workItemProviderByCardId[column.step.id]}
          releaseName={column.step.releaseId ? releaseNameById.get(column.step.releaseId) : undefined}
          onSelect={onSelectCard}
          onBulkToggle={toggleBulkSelection}
          onUpdateCard={(cardId, patch) => updateCard.mutate({ cardId, patch })}
          onDelete={() => handleDeleteStory(column.step.id)}
          onAddNote={state.preview ? undefined : () => { createCard.reset(); setComposer({ level: "note", parentId: column.step.id }); }}
        />
      </DroppableCell>
    );
  }
  if (column.kind === "add-step") {
    const key = `step-add:${column.activity.id}`;
    return (
      <DroppableCell colIndex={columnIndices[index]!} hidden={!hierarchyVisibleIds.has(column.activity.id)} id={`epic:${column.activity.id}`} className={`discovery-step-cell discovery-add-step-cell${column.groupIndex % 2 === 1 ? " epic-lane-alt" : ""}`} key={key}>
        <button type="button" className={column.hasSteps ? "add-tile add-tile-thin" : "add-tile"} aria-label={strings.newStep(column.activity.title)} title={strings.newStep(column.activity.title)} disabled={Boolean(state.preview)} onClick={() => { createCard.reset(); setComposer({ level: "step", parentId: column.activity.id }); }}><Plus size={14} />{column.hasSteps ? null : <span>{cardLevelMeta.step.label}</span>}</button>
      </DroppableCell>
    );
  }
  return <div role="columnheader" aria-colindex={visibleColumns.length} className="discovery-step-cell discovery-add-activity-cell" key="add-activity-step-spacer" />;

}

function renderDiscoveryReleaseBand(model: ReturnType<typeof useDiscoveryMatrixState>, release: ReleaseBand, index: number) {
  const { filtered, orderedReleases, state, releaseRows, visibleColumns, columnIndices, columns, boardCards, hierarchyVisibleIds, selectedVisibleIds, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, workItemProviderByCardId, releaseNameById, snapshot, zoom, pinnedUnscheduled, setPinnedUnscheduled, collapsedLaneSet, prepareFocusRecovery, toggleLane, storyMapId, createCard, setComposer, handleDeleteStory, setMoveAreaTarget, updateRelease, setReleaseTarget, onSelectCard, toggleBulkSelection, updateCard } = model;

  const count = filtered.cards.filter((card) => card.level === "story" && (card.releaseId ?? null) === release.releaseId).length;
  const releaseId = release.releaseId;
  const releaseIndex = releaseId ? orderedReleases.findIndex((entry) => entry.id === releaseId) : -1;
  return (
    <ReleaseSection key={release.id}
      {...discoveryReleaseContent(model, release, index, count)}
      pinned={release.releaseId === null ? pinnedUnscheduled : false}
      onTogglePin={release.releaseId === null ? () => setPinnedUnscheduled((value) => !value) : undefined}
      collapsed={collapsedLaneSet.has(release.id)}
      onToggleCollapse={() => { prepareFocusRecovery(); toggleLane(storyMapId, release.id); }}
      onOpenComposer={(parentId, releaseId) => { createCard.reset(); setComposer({ level: "story", parentId, releaseId }); }}
      onDeleteStory={handleDeleteStory}
      onMoveStory={(card) => { if (!state.preview) setMoveAreaTarget(card); }}
      canMoveReleaseUp={releaseIndex > 0}
      canMoveReleaseDown={releaseIndex >= 0 && releaseIndex < orderedReleases.length - 1}
      onMoveReleaseUp={!state.preview && releaseId ? () => {
        if (releaseIndex > 0) updateRelease.mutate({ releaseId, patch: { position: releaseIndex - 1 } });
      } : undefined}
      onMoveReleaseDown={!state.preview && releaseId ? () => {
        if (releaseIndex >= 0 && releaseIndex < orderedReleases.length - 1) updateRelease.mutate({ releaseId, patch: { position: releaseIndex + 1 } });
      } : undefined}
      onRenameRelease={!state.preview && release.releaseId ? (name) => updateRelease.mutateAsync({ releaseId: release.releaseId as string, patch: { name } }) : undefined}
      onDeleteRelease={!state.preview && release.releaseId ? () => setReleaseTarget(release) : undefined}
      onSelectCard={onSelectCard}
      onBulkToggle={toggleBulkSelection}
      onUpdateCard={(cardId, patch) => updateCard.mutate({ cardId, patch })}
    />
  );

}

function discoveryReleaseContent(model: ReturnType<typeof useDiscoveryMatrixState>, release: ReleaseBand, index: number, count: number) {
  const { filtered, orderedReleases, state, releaseRows, visibleColumns, columnIndices, columns, boardCards, hierarchyVisibleIds, selectedVisibleIds, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, workItemProviderByCardId, releaseNameById, snapshot, zoom, pinnedUnscheduled, setPinnedUnscheduled, collapsedLaneSet, prepareFocusRecovery, toggleLane, storyMapId, createCard, setComposer, handleDeleteStory, setMoveAreaTarget, updateRelease, setReleaseTarget, onSelectCard, toggleBulkSelection, updateCard } = model;
  return {
    preview: state.preview,
    rowIndex: releaseRows[index]!,
    colCount: visibleColumns.length,
    columnIndices: columnIndices,
    personaNamesByCardId: state.personaNamesByCardId,
    release: release,
    columns: columns,
    cards: boardCards,
    visibleCardIds: hierarchyVisibleIds,
    storyCount: count,
    selectedVisibleIds: selectedVisibleIds,
    sourceCounts: sourceCounts,
    githubIssueByCardId: githubIssueByCardId,
    githubStatusByCardId: githubStatusByCardId,
    externalRefsByCardId: externalRefsByCardId,
    dependencyKeys: dependencyKeys,
    workItemProviderByCardId: workItemProviderByCardId,
    releaseNameById: releaseNameById,
    estimationUnit: snapshot.storyMap.estimationUnit,
    zoom: zoom,
  };
}
