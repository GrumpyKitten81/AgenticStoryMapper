import { useMemo, useState } from "react";
import type { Card } from "@storymapper/contracts";
import { closestCenter, DndContext, type DragEndEvent, useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { MoveAreaDialog } from "@storymapper/web/features/story-map/components/MoveAreaDialog";
import { cardLevelMeta } from "@storymapper/web/features/story-map/card-taxonomy";
import { CardTile, SortableCardTile } from "@storymapper/web/features/story-map/components/CardTile";
import type { StoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";
import { storyMapStrings as strings } from "@storymapper/ui-strings";
import { usePointerMoveDrag } from "@storymapper/web/features/story-map/components/usePointerMoveDrag";
import { FilterAncestorCards } from "@storymapper/web/features/story-map/components/FilterAncestors";

interface BacklogListProps {
  state: StoryMapBoardState;
  onSelectCard: (cardId: string) => void;
}

type GroupMode = "step" | "release" | "status";
type BacklogGroup = { label: string; cards: Card[]; stepId: string | undefined };

export function BacklogList(props: BacklogListProps) {
  return renderBacklogList(useBacklogListState(props));
}

function useBacklogListState({ state, onSelectCard }: BacklogListProps) {
  const liveDrag = usePointerMoveDrag(state);
  const [groupMode, setGroupMode] = useState<GroupMode>("step");
  const stories = state.filtered.cards.filter((card) => card.level === "story");
  const groups: BacklogGroup[] = useMemo(() => {
    if (groupMode === "release") {
      const releaseName = (releaseId: string | null) => releaseId ? state.releaseNameById.get(releaseId) ?? strings.unknownRelease : strings.unscheduled;
      return groupBy(stories, (story) => releaseName(story.releaseId));
    }
    if (groupMode === "status") return groupBy(stories, (story) => story.status);
    const cardById = new Map(state.filtered.cards.map((card) => [card.id, card]));
    const groupedByStep = new Map<string, BacklogGroup>();
    for (const story of stories) {
      const step = story.parentId ? cardById.get(story.parentId) : undefined;
      const key = step?.id ?? "no-step";
      const existing = groupedByStep.get(key);
      if (existing) {
        existing.cards.push(story);
      } else {
        groupedByStep.set(key, { label: step?.title ?? strings.noStep, cards: [story], stepId: step?.id });
      }
    }
    return [...groupedByStep.values()];
  }, [groupMode, state.filtered.cards, stories]);

  function handleDragEnd(event: DragEndEvent) {
    if (state.preview || groupMode !== "step") return;
    const activeCard = stories.find((card) => card.id === String(event.active.id));
    if (!activeCard || !event.over) return;
    const target = resolveBacklogDropTarget(stories, groups, String(event.over.id));
    if (!target) return;
    state.moveCard.mutate({ cardId: activeCard.id, baseVersion: liveDrag.baseVersion(), patch: { parentId: target.parentId, position: target.position } });
  }
  return { liveDrag, handleDragEnd, stories, groupMode, setGroupMode, groups, state, onSelectCard };
}

function renderBacklogList({ liveDrag, handleDragEnd, stories, groupMode, setGroupMode, groups, state, onSelectCard }: ReturnType<typeof useBacklogListState>) {
  return (
    <DndContext sensors={liveDrag.sensors} collisionDetection={closestCenter} onDragStart={liveDrag.start} onDragCancel={liveDrag.end} onDragEnd={(event) => { liveDrag.end(); handleDragEnd(event); }}>
      <section className="backlog-list" data-story-map-export-target="backlog">
        <div className="backlog-list-toolbar">
          <span>{strings.countStories(stories.length)}</span>
          <label>{strings.groupBy}<select value={groupMode} onChange={(event) => setGroupMode(event.target.value as GroupMode)}>
            <option value="step">{cardLevelMeta.step.label}</option>
            <option value="release">{strings.release}</option>
            <option value="status">{strings.status}</option>
          </select>
          </label>
        </div>
        <FilterAncestorCards ancestors={state.filtered.cards.filter((card) => !state.filtered.matchingCardIds.has(card.id) && (groupMode !== "step" || !groups.some((group) => group.stepId === card.id)))} onSelectCard={onSelectCard} />
        {groups.map((group) => (
          <BacklogGroupSection
            key={group.stepId ?? group.label}
            group={group}
            draggable={!state.preview && groupMode === "step" && Boolean(group.stepId)}
            state={state}
            onSelectCard={onSelectCard}
          />
        ))}
        {stories.length === 0 ? <div className="empty-state">{strings.emptyFilteredStories}</div> : null}
      </section>
    </DndContext>
  );
}

function BacklogGroupSection({
  group,
  draggable,
  state,
  onSelectCard
}: {
  group: BacklogGroup;
  draggable: boolean;
  state: StoryMapBoardState;
  onSelectCard: (cardId: string) => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `backlog-step:${group.stepId ?? "none"}`, disabled: !draggable });
  const Tile = draggable ? SortableCardTile : CardTile;
  const [moveTarget, setMoveTarget] = useState<Card | null>(null);

  return (
    <section className="backlog-group">
      {moveTarget ? <MoveAreaDialog target={moveTarget} state={state} onClose={() => setMoveTarget(null)} /> : null}
      <div className={`backlog-group-heading${group.stepId && !state.filtered.matchingCardIds.has(group.stepId) ? " filter-context" : ""}`}>
        <strong>{group.label}</strong>
        <span>{group.cards.length}</span>
      </div>
      <SortableContext items={draggable ? group.cards.map((card) => card.id) : []} strategy={verticalListSortingStrategy}>
        <div className={isOver ? "backlog-card-list droppable-over" : "backlog-card-list"} ref={draggable ? setNodeRef : undefined}>
          {group.cards.map((story) => (
            <Tile
              key={story.id}
              card={story}
              estimationUnit={state.snapshot.storyMap.estimationUnit}
              variant="backlog"
              bulkSelected={state.selectedVisibleIds.has(story.id)}
              sourceLinkCount={state.sourceCounts[story.id] ?? 0}
              githubIssue={state.githubIssueByCardId[story.id]}
              githubSyncState={state.githubStatusByCardId[story.id]}
              externalRefs={state.externalRefsByCardId[story.id]} dependencies={state.dependencyKeys[story.id]}
              releaseName={story.releaseId ? state.releaseNameById.get(story.releaseId) : undefined}
              previewMarker={state.preview?.markers.find((marker) => marker.entity === "card" && marker.entityId === story.id)}
              readOnly={Boolean(state.preview)}
              onMove={state.preview ? undefined : () => setMoveTarget(story)}
              onSelect={onSelectCard}
              onBulkToggle={state.toggleBulkSelection}
            />
          ))}
        </div>
      </SortableContext>
    </section>
  );
}

function resolveBacklogDropTarget(stories: Card[], groups: BacklogGroup[], overId: string): { parentId: string; position: number } | null {
  if (overId.startsWith("backlog-step:")) {
    const stepId = overId.slice("backlog-step:".length);
    if (stepId === "none") return null;
    const group = groups.find((candidate) => candidate.stepId === stepId);
    return { parentId: stepId, position: group?.cards.length ?? 0 };
  }
  const overCard = stories.find((card) => card.id === overId);
  if (!overCard?.parentId) return null;
  const group = groups.find((candidate) => candidate.stepId === overCard.parentId);
  const position = group ? Math.max(0, group.cards.findIndex((card) => card.id === overCard.id)) : 0;
  return { parentId: overCard.parentId, position };
}

function groupBy<T extends Card>(items: T[], getLabel: (item: T) => string): BacklogGroup[] {
  const groups = new Map<string, BacklogGroup>();
  for (const item of items) {
    const label = getLabel(item);
    const existing = groups.get(label);
    if (existing) {
      existing.cards.push(item);
    } else {
      groups.set(label, { label, cards: [item], stepId: undefined });
    }
  }
  return [...groups.values()];
}
