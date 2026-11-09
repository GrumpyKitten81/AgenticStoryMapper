import { useReleaseSyncFieldLocks } from "@storymapper/web/features/github-sync";
import { syncConflictStrings } from "@storymapper/web/ui-strings/sync-conflicts";
import { PreviewMarker } from "@storymapper/web/components/PreviewMarker";
import type { CardDependencyKeys } from "@storymapper/web/components/CardDependencyBadges";
import type { ChangeSetPreviewBoard, Card, ExternalRef, Release, UpdateCardRequest, WorkItemProvider } from "@storymapper/contracts";
import { useDraggable, useDroppable } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { getChildren } from "@storymapper/core";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, Pencil, Pin, Plus, Trash2 } from "lucide-react";
import type React from "react";
import { useState } from "react";
import { CardTile, SortableCardTile } from "@storymapper/web/features/story-map/components/CardTile";
import { panelStrings, storyMapStrings as strings } from "@storymapper/ui-strings";

export type DiscoveryColumn =
  | { kind: "step"; activity: Card; step: Card; groupIndex: number; groupStart: boolean }
  | { kind: "add-step"; activity: Card; groupIndex: number; hasSteps: boolean }
  | { kind: "add-activity" };
export type ReleaseBand = { id: string; label: string; releaseId: string | null; release?: Release; externalRefs?: ExternalRef[] };

type StorySortMode = "manual" | "alphabetical";
// HINT hidden feature: "manual" respects the drag/position order; flip to "alphabetical" in code until a GUI toggle exists
const STORY_SORT_MODE: StorySortMode = "manual";

function sortStories(stories: Card[], mode: StorySortMode): Card[] {
  if (mode === "alphabetical") {
    return [...stories].sort((left, right) => left.title.localeCompare(right.title));
  }
  return stories;
}

export function DraggableCardTile({ zoom, hidden = false, ...props }: React.ComponentProps<typeof CardTile> & { zoom: number; hidden?: boolean }) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({ id: props.card.id, disabled: hidden });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x / zoom}px, ${transform.y / zoom}px, 0)` : undefined,
    opacity: isDragging ? 0.55 : undefined
  };
  return (
    <div ref={setNodeRef} style={style} hidden={hidden}>
      <CardTile {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

export function DroppableCell({ id, className, style, children, hidden = false, colIndex, colSpan = 1, selectedKeys = [] }: { selectedKeys?: string[]; colIndex?: number; colSpan?: number; id: string; className: string; style?: React.CSSProperties; children: React.ReactNode; hidden?: boolean }) {
  const { setNodeRef, isOver } = useDroppable({ id, disabled: hidden });
  return (
    <div role="columnheader" aria-colindex={colIndex} aria-colspan={colSpan} aria-selected={selectedKeys.length > 0} aria-description={strings.selectedCellCards(selectedKeys)} ref={setNodeRef} className={isOver ? `${className} droppable-over` : className} style={style} hidden={hidden}>
      {children}
    </div>
  );
}

export function NotAssignedLane(props: NotAssignedLaneProps) {
  return renderNotAssignedLane(useNotAssignedLaneState(props));
}

function useNotAssignedLaneState({ preview, personaNamesByCardId, cards, visibleCardIds, selectedVisibleIds, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, workItemProviderByCardId, releaseNameById, estimationUnit, zoom, onSelectCard, onBulkToggle, onUpdateCard, onDeleteCard }: NotAssignedLaneProps) {
  const { setNodeRef, isOver } = useDroppable({ id: "notassigned" });
  return { setNodeRef, isOver, cards, visibleCardIds, estimationUnit, personaNamesByCardId, preview, zoom, selectedVisibleIds, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, workItemProviderByCardId, releaseNameById, onSelectCard, onBulkToggle, onUpdateCard, onDeleteCard };
}

function renderNotAssignedLane({ setNodeRef, isOver, cards, visibleCardIds, estimationUnit, personaNamesByCardId, preview, zoom, selectedVisibleIds, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, workItemProviderByCardId, releaseNameById, onSelectCard, onBulkToggle, onUpdateCard, onDeleteCard }: ReturnType<typeof useNotAssignedLaneState>) {
  return (
    <div ref={setNodeRef} className={isOver ? "discovery-notassigned droppable-over" : "discovery-notassigned"}>
      {!cards.some((card) => visibleCardIds.has(card.id)) ? <p className="discovery-notassigned-empty">{strings.emptyNotAssigned}</p> : null}
      {cards.map((card) => (
        <DraggableCardTile
          key={card.id}
          hidden={!visibleCardIds.has(card.id)}
          estimationUnit={estimationUnit}
          personaNames={personaNamesByCardId[card.id]}
          previewMarker={preview?.markers.find((marker) => marker.entity === "card" && marker.entityId === card.id)}
          card={card}
          zoom={zoom}
          variant="discovery"
          bulkSelected={selectedVisibleIds.has(card.id)}
          sourceLinkCount={sourceCounts[card.id] ?? 0}
          githubIssue={githubIssueByCardId[card.id]}
          githubSyncState={githubStatusByCardId[card.id]}
          externalRefs={externalRefsByCardId[card.id]} dependencies={dependencyKeys[card.id]}
          workItemProvider={workItemProviderByCardId[card.id]}
          releaseName={card.releaseId ? releaseNameById.get(card.releaseId) : undefined}
          onSelect={onSelectCard}
          onBulkToggle={onBulkToggle}
          onUpdateCard={onUpdateCard}
          onDelete={() => onDeleteCard(card.id)}
        />
      ))}
    </div>
  );
}

export function AddControl(props: AddControlProps) {
  const result = useAddControlState(props);
  if (result === null || !("onSubmit" in result)) return result;
  return renderAddControl(result);
}

function useAddControlState({
  open,
  thin = false,
  disabled = false,
  label,
  placeholder,
  value,
  onOpen,
  onChange,
  onSubmit,
  onClose
}: AddControlProps) {
  if (!open) {
    return (
      <button type="button" disabled={disabled} className={thin ? "add-tile add-tile-thin" : "add-tile"} onClick={onOpen} aria-label={placeholder} title={placeholder}>
        <Plus size={14} />
        {thin ? null : <span>{label}</span>}
      </button>
    );
  }
  return { onSubmit, disabled, placeholder, value, onChange, onClose };
}

function renderAddControl({ onSubmit, disabled, placeholder, value, onChange, onClose }: Exclude<ReturnType<typeof useAddControlState>, import("react").ReactElement | null>) {
  return (
    <form className="add-tile-form" onSubmit={(event) => {
      event.preventDefault();
      onSubmit();
    }}>
      <input
        disabled={disabled}
        className="add-tile-input"
        aria-label={placeholder}
        placeholder={placeholder}
        value={value}
        autoFocus
        onChange={(event) => onChange(event.target.value)}
        onBlur={() => {
          if (!value.trim()) onClose();
        }}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onSubmit();
          }
          if (event.key === "Escape") onClose();
        }}
      />
      <button type="submit" disabled={disabled || !value.trim()}>{strings.createCard}</button>
    </form>
  );
}

export function ReleaseSection(props: ReleaseSectionProps) {
  return renderReleaseSection(useReleaseSectionState(props));
}

function useReleaseSectionState({
  release,
  preview, rowIndex, colCount, columnIndices, personaNamesByCardId,
  columns,
  cards,
  visibleCardIds,
  storyCount,
  selectedVisibleIds,
  sourceCounts,
  githubIssueByCardId,
  githubStatusByCardId,
  externalRefsByCardId, dependencyKeys,
  workItemProviderByCardId,
  releaseNameById,
  estimationUnit,
  zoom,
  pinned = false,
  onTogglePin,
  collapsed = false,
  onToggleCollapse,
  canMoveReleaseUp,
  canMoveReleaseDown,
  onMoveReleaseUp,
  onMoveReleaseDown,
  onDeleteRelease,
  onRenameRelease,
  onOpenComposer,
  onDeleteStory,
  onMoveStory,
  onSelectCard,
  onBulkToggle,
  onUpdateCard
}: ReleaseSectionProps) {
  const [editing, setEditing] = useState(false);
  const [nameDraft, setNameDraft] = useState(release.label);
  const syncLocked = useReleaseSyncFieldLocks(release.releaseId).has("name");
  function startEdit() {
    if (syncLocked) return;
    setNameDraft(release.label);
    setEditing(true);
  }
  function submitEdit() {
    if (syncLocked) return;
    const next = nameDraft.trim();
    setEditing(false);
    if (onRenameRelease && next && next !== release.label) onRenameRelease(next).catch(() => setEditing(true));
  }
  return { rowIndex, colCount, pinned, onToggleCollapse, collapsed, onTogglePin, editing, onRenameRelease, syncLocked, nameDraft, setNameDraft, submitEdit, setEditing, release, preview, storyCount, canMoveReleaseUp, onMoveReleaseUp, canMoveReleaseDown, onMoveReleaseDown, startEdit, onDeleteRelease, columns, visibleCardIds, columnIndices, cards, personaNamesByCardId, onOpenComposer, onDeleteStory, onMoveStory, selectedVisibleIds, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, workItemProviderByCardId, releaseNameById, estimationUnit, zoom, onSelectCard, onBulkToggle, onUpdateCard };
}

function renderReleaseSection(model: ReturnType<typeof useReleaseSectionState>) {
  const { rowIndex, colCount, pinned, onToggleCollapse, collapsed, onTogglePin, editing, onRenameRelease, syncLocked, nameDraft, setNameDraft, submitEdit, setEditing, release, preview, storyCount, canMoveReleaseUp, onMoveReleaseUp, canMoveReleaseDown, onMoveReleaseDown, startEdit, onDeleteRelease, columns, visibleCardIds, columnIndices, cards, personaNamesByCardId, onOpenComposer, onDeleteStory, onMoveStory, selectedVisibleIds, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, workItemProviderByCardId, releaseNameById, estimationUnit, zoom, onSelectCard, onBulkToggle, onUpdateCard } = model;
  return (
    <>
      {renderReleaseHeader(model)}<div role="row" aria-rowindex={rowIndex + 1} hidden={collapsed} style={{ display: collapsed ? "none" : "contents" }}>
        {columns.map((column, index) => renderReleaseColumn(model, column, index))}</div>
    </>
  );
}

function DiscoveryCell(props: DiscoveryCellProps) {
  return renderDiscoveryCell(useDiscoveryCellState(props));
}

function useDiscoveryCellState({
  preview, colIndex, personaNamesByCardId,
  className,
  step,
  release,
  stories,
  visibleCardIds,
  hidden,
  onOpenAdd,
  onDeleteStory,
  onMoveStory,
  selectedVisibleIds,
  sourceCounts,
  githubIssueByCardId,
  githubStatusByCardId,
  externalRefsByCardId, dependencyKeys,
  workItemProviderByCardId,
  releaseNameById,
  estimationUnit,
  zoom,
  onSelectCard,
  onBulkToggle,
  onUpdateCard
}: DiscoveryCellProps) {
  const droppableId = `cell:${step.id}:${release.releaseId ?? "none"}`;
  const { setNodeRef, isOver } = useDroppable({ id: droppableId, disabled: hidden });
  return { stories, hidden, visibleCardIds, colIndex, selectedVisibleIds, className, isOver, setNodeRef, estimationUnit, personaNamesByCardId, preview, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, workItemProviderByCardId, releaseNameById, zoom, onSelectCard, onBulkToggle, onUpdateCard, onDeleteStory, onMoveStory, step, release, onOpenAdd };
}

function renderDiscoveryCell({ stories, hidden, visibleCardIds, colIndex, selectedVisibleIds, className, isOver, setNodeRef, estimationUnit, personaNamesByCardId, preview, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, workItemProviderByCardId, releaseNameById, zoom, onSelectCard, onBulkToggle, onUpdateCard, onDeleteStory, onMoveStory, step, release, onOpenAdd }: ReturnType<typeof useDiscoveryCellState>) {
  return (
    <SortableContext items={stories.filter((story) => !hidden && visibleCardIds.has(story.id)).map((story) => story.id)} strategy={verticalListSortingStrategy}>
      <div role="gridcell" aria-colindex={colIndex} aria-selected={stories.some((card) => visibleCardIds.has(card.id) && selectedVisibleIds.has(card.id))} aria-description={strings.selectedCellCards(stories.filter((card) => visibleCardIds.has(card.id) && selectedVisibleIds.has(card.id)).map((card) => card.key))} className={isOver ? `${className} droppable-over` : className} ref={setNodeRef} hidden={hidden}>
        <div className="story-stack">
          {stories.map((story) => (
            <SortableCardTile
              key={story.id}
              hidden={hidden || !visibleCardIds.has(story.id)}
              estimationUnit={estimationUnit}
              personaNames={personaNamesByCardId[story.id]}
              previewMarker={preview?.markers.find((marker) => marker.entity === "card" && marker.entityId === story.id)}
              card={story}
              variant="discovery"
              bulkSelected={selectedVisibleIds.has(story.id)}
              sourceLinkCount={sourceCounts[story.id] ?? 0}
              githubIssue={githubIssueByCardId[story.id]}
              githubSyncState={githubStatusByCardId[story.id]}
              externalRefs={externalRefsByCardId[story.id]} dependencies={dependencyKeys[story.id]}
              workItemProvider={workItemProviderByCardId[story.id]}
              releaseName={story.releaseId ? releaseNameById.get(story.releaseId) : undefined}
              dragScale={zoom}
              onSelect={onSelectCard}
              onBulkToggle={onBulkToggle}
              onUpdateCard={onUpdateCard}
              onDelete={() => onDeleteStory(story.id)}
              onMoveToArea={() => onMoveStory(story)}
            />
          ))}
        </div>
        <button type="button" disabled={Boolean(preview)} className="add-tile" aria-label={strings.newStory(step.title, release.label)} onClick={onOpenAdd}>{strings.cardLevels.story.label}</button>
      </div>
    </SortableContext>
  );
}

interface NotAssignedLaneProps {
  preview?: ChangeSetPreviewBoard | undefined;
  personaNamesByCardId: Record<string, string[]>;
  cards: Card[];
  visibleCardIds: Set<string>;
  selectedVisibleIds: Set<string>;
  sourceCounts: Record<string, number>;
  githubIssueByCardId: Record<string, number>;
  githubStatusByCardId: Record<string, string>;
  externalRefsByCardId: Record<string, ExternalRef[]>;
  dependencyKeys: Record<string, CardDependencyKeys>;
  workItemProviderByCardId: Record<string, WorkItemProvider>;
  releaseNameById: Map<string, string>;
  estimationUnit: string;
  zoom: number;
  onSelectCard: (cardId: string) => void;
  onBulkToggle: (cardId: string) => void;
  onUpdateCard: (cardId: string, patch: UpdateCardRequest) => void;
  onDeleteCard: (cardId: string) => void;
}

interface AddControlProps {
  open: boolean;
  thin?: boolean;
  disabled?: boolean;
  label: string;
  placeholder: string;
  value: string;
  onOpen: () => void;
  onChange: (value: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}

interface ReleaseSectionProps {
  release: ReleaseBand;
  rowIndex: number; colCount: number; columnIndices: number[];
  columns: DiscoveryColumn[];
  preview?: ChangeSetPreviewBoard | undefined;
  personaNamesByCardId: Record<string, string[]>;
  cards: Card[];
  visibleCardIds: Set<string>;
  storyCount: number;
  selectedVisibleIds: Set<string>;
  sourceCounts: Record<string, number>;
  githubIssueByCardId: Record<string, number>;
  githubStatusByCardId: Record<string, string>;
  externalRefsByCardId: Record<string, ExternalRef[]>;
  dependencyKeys: Record<string, CardDependencyKeys>;
  workItemProviderByCardId: Record<string, WorkItemProvider>;
  releaseNameById: Map<string, string>;
  estimationUnit: string;
  zoom: number;
  pinned?: boolean;
  onTogglePin?: (() => void) | undefined;
  collapsed?: boolean;
  onToggleCollapse?: (() => void) | undefined;
  canMoveReleaseUp?: boolean;
  canMoveReleaseDown?: boolean;
  onMoveReleaseUp?: (() => void) | undefined;
  onMoveReleaseDown?: (() => void) | undefined;
  onDeleteRelease?: (() => void) | undefined;
  onRenameRelease?: ((name: string) => Promise<unknown>) | undefined;
  onOpenComposer: (parentId: string, releaseId: string | null) => void;
  onDeleteStory: (cardId: string) => void;
  onMoveStory: (card: Card) => void;
  onSelectCard: (cardId: string) => void;
  onBulkToggle: (cardId: string) => void;
  onUpdateCard: (cardId: string, patch: UpdateCardRequest) => void;
}

function renderReleaseHeading(model: ReturnType<typeof useReleaseSectionState>) {
  const { onToggleCollapse, collapsed, onTogglePin, pinned, editing, onRenameRelease, syncLocked, nameDraft, setNameDraft, submitEdit, setEditing, release, preview } = model;
  return <div className="lane-header-left">
    {onToggleCollapse ? (
      <button type="button" className="lane-collapse" aria-pressed={collapsed} aria-expanded={!collapsed} title={collapsed ? strings.expandLane : strings.collapseLane} onClick={onToggleCollapse}>
        {collapsed ? <ChevronRight size={14} /> : <ChevronDown size={14} />}
      </button>
    ) : null}
    {onTogglePin ? (
      <button type="button" className={pinned ? "lane-pin pinned" : "lane-pin"} aria-pressed={pinned} title={pinned ? strings.unpinLane : strings.pinLane} onClick={onTogglePin}>
        <Pin size={14} />
      </button>
    ) : null}
    {editing && onRenameRelease ? (
      <input
        className="lane-rename-input"
        disabled={syncLocked}
        autoFocus
        value={nameDraft}
        onChange={(event) => setNameDraft(event.target.value)}
        onBlur={submitEdit}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            submitEdit();
          }
          if (event.key === "Escape") {
            setEditing(false);
          }
        }}
        aria-label={strings.releaseLaneName}
      />
    ) : (
      <strong>{release.label}</strong>
    )}
    <PreviewMarker marker={preview?.markers.find((marker) => marker.entity === "release" && marker.entityId === release.releaseId)} />
    {syncLocked ? <small>{syncConflictStrings.lock(syncConflictStrings.releaseFields.name)}</small> : null}
    {release.externalRefs?.map((ref) => <span className="external-ref-badge" key={ref.id}>{panelStrings.externalRef(ref.system, ref.externalId)}</span>)}
  </div>;
}

function renderReleaseHeader(model: ReturnType<typeof useReleaseSectionState>) {
  const { rowIndex, colCount, pinned, storyCount, onRenameRelease, release, canMoveReleaseUp, onMoveReleaseUp, canMoveReleaseDown, onMoveReleaseDown, editing, syncLocked, startEdit, onDeleteRelease } = model;
  return <div role="row" aria-rowindex={rowIndex} style={{ display: "contents" }}><div role="rowheader" aria-colindex={1} aria-colspan={colCount} className={`release-band-header${pinned ? " discovery-lane-pinned" : ""}`}>
    {renderReleaseHeading(model)}
    <div className="lane-header-right">
      <span>{strings.countStories(storyCount)}</span>
      {onRenameRelease ? (
        <button type="button" className="lane-edit" title={strings.moveReleaseLaneUp} aria-label={strings.moveReleaseUp(release.label)} disabled={!canMoveReleaseUp} onClick={onMoveReleaseUp}>
          <ArrowUp size={14} />
        </button>
      ) : null}
      {onRenameRelease ? (
        <button type="button" className="lane-edit" title={strings.moveReleaseLaneDown} aria-label={strings.moveReleaseDown(release.label)} disabled={!canMoveReleaseDown} onClick={onMoveReleaseDown}>
          <ArrowDown size={14} />
        </button>
      ) : null}
      {onRenameRelease && !editing ? (
        <button type="button" className="lane-edit" disabled={syncLocked} title={syncLocked ? syncConflictStrings.lock(syncConflictStrings.releaseFields.name) : strings.renameReleaseLane} aria-label={strings.renameRelease(release.label)} onClick={startEdit}>
          <Pencil size={14} />
        </button>
      ) : null}
      {onDeleteRelease ? (
        <button type="button" className="lane-delete danger" title={strings.deleteReleaseLane} aria-label={strings.deleteRelease(release.label)} onClick={onDeleteRelease}>
          <Trash2 size={14} />
        </button>
      ) : null}
    </div>
  </div>
  </div>;
}

function renderReleaseColumn(model: ReturnType<typeof useReleaseSectionState>, column: DiscoveryColumn, index: number) {
  const { pinned, collapsed, visibleCardIds, release, columnIndices, cards, preview, personaNamesByCardId, onOpenComposer, onDeleteStory, onMoveStory, selectedVisibleIds, sourceCounts, githubIssueByCardId, githubStatusByCardId, externalRefsByCardId, dependencyKeys, workItemProviderByCardId, releaseNameById, estimationUnit, zoom, onSelectCard, onBulkToggle, onUpdateCard } = model;

  const pinnedClass = pinned ? " discovery-lane-pinned" : "";
  const collapsedClass = collapsed ? " discovery-lane-collapsed" : "";
  if (column.kind === "add-step") {
    return <div hidden={!visibleCardIds.has(column.activity.id)} className={`discovery-cell discovery-add-step-cell${column.groupIndex % 2 === 1 ? " epic-lane-alt" : ""}${pinnedClass}${collapsedClass}`} key={`${release.id}:add-step:${column.activity.id}`} role="gridcell" aria-colindex={columnIndices[index]} />;
  }
  if (column.kind === "add-activity") {
    return <div className={`discovery-cell discovery-add-activity-cell${pinnedClass}${collapsedClass}`} key={`${release.id}:add-activity`} role="gridcell" aria-colindex={columnIndices[index]} />;
  }
  const laneClass = `discovery-cell${column.groupIndex % 2 === 1 ? " epic-lane-alt" : ""}${column.groupStart ? " epic-lane-start" : ""}${pinned ? " discovery-lane-pinned pinned" : ""}${release.releaseId === null ? " discovery-unscheduled-cell" : ""}${collapsedClass}`;
  const stories = sortStories(getChildren(cards, column.step.id).filter((card) => (card.level === "story" || card.level === "note") && (card.releaseId ?? null) === release.releaseId), STORY_SORT_MODE);
  return (
    <DiscoveryCell
      key={`${release.id}:${column.step.id}`}
      preview={preview}
      colIndex={columnIndices[index]!}
      personaNamesByCardId={personaNamesByCardId}
      className={laneClass}
      step={column.step}
      release={release}
      stories={stories}
      visibleCardIds={visibleCardIds}
      hidden={!visibleCardIds.has(column.step.id) || collapsed}
      onOpenAdd={() => onOpenComposer(column.step.id, release.releaseId)}
      onDeleteStory={onDeleteStory}
      onMoveStory={onMoveStory}
      selectedVisibleIds={selectedVisibleIds}
      sourceCounts={sourceCounts}
      githubIssueByCardId={githubIssueByCardId}
      githubStatusByCardId={githubStatusByCardId}
      externalRefsByCardId={externalRefsByCardId} dependencyKeys={dependencyKeys}
      workItemProviderByCardId={workItemProviderByCardId}
      releaseNameById={releaseNameById}
      estimationUnit={estimationUnit}
      zoom={zoom}
      onSelectCard={onSelectCard}
      onBulkToggle={onBulkToggle}
      onUpdateCard={onUpdateCard}
    />
  );

}

interface DiscoveryCellProps {
  preview?: ChangeSetPreviewBoard | undefined;
  personaNamesByCardId: Record<string, string[]>;
  colIndex: number;
  className: string;
  step: Card;
  release: ReleaseBand;
  stories: Card[];
  visibleCardIds: Set<string>;
  hidden: boolean;
  onOpenAdd: () => void;
  onDeleteStory: (cardId: string) => void;
  onMoveStory: (card: Card) => void;
  selectedVisibleIds: Set<string>;
  sourceCounts: Record<string, number>;
  githubIssueByCardId: Record<string, number>;
  githubStatusByCardId: Record<string, string>;
  externalRefsByCardId: Record<string, ExternalRef[]>;
  dependencyKeys: Record<string, CardDependencyKeys>;
  workItemProviderByCardId: Record<string, WorkItemProvider>;
  releaseNameById: Map<string, string>;
  estimationUnit: string;
  zoom: number;
  onSelectCard: (cardId: string) => void;
  onBulkToggle: (cardId: string) => void;
  onUpdateCard: (cardId: string, patch: UpdateCardRequest) => void;
}
