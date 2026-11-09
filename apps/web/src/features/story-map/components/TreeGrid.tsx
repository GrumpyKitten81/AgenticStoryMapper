import { CardReviewBadge } from "@storymapper/web/features/card-review";
import { useIsFilterContext } from "@storymapper/web/features/story-map/filter-context";
import { ChangedMarker } from "@storymapper/web/features/what-changed";
import { CardDependencyBadges, type CardDependencyKeys } from "@storymapper/web/components/CardDependencyBadges";
import type { ChangeSetPreviewMarker, Card, StoryMapSnapshot } from "@storymapper/contracts";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useLayoutEffect, useMemo, useRef } from "react";
import { cardLevelMeta } from "@storymapper/web/features/story-map/card-taxonomy";
import { cardTooltip } from "@storymapper/web/features/story-map/card-tooltip";
import { useTreeCollapseStore } from "@storymapper/web/app/stores/tree-collapse-store";
import { useTreeColumnsStore } from "@storymapper/web/app/stores/tree-columns-store";
import { TREE_COLUMNS, type WorkItemRef } from "@storymapper/web/features/story-map/components/tree-columns";
import { PreviewMarker } from "@storymapper/web/components/PreviewMarker";
import type { StoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

interface TreeGridProps {
  state: StoryMapBoardState;
  onSelectCard: (cardId: string) => void;
}

function buildWorkItemRefs(snapshot: StoryMapSnapshot): Map<string, WorkItemRef> {
  const refs = new Map<string, WorkItemRef>();
  for (const link of snapshot.githubLinks) {
    if (link.cardId && link.issueNumber) refs.set(link.cardId, { provider: "github", ticket: strings.ticketNumber(link.issueNumber), url: link.url });
  }
  return refs;
}

function buildChildrenByParent(cards: Card[]): Map<string | null, Card[]> {
  const byParent = new Map<string | null, Card[]>();
  for (const card of cards) {
    const key = card.parentId;
    const siblings = byParent.get(key);
    if (siblings) siblings.push(card);
    else byParent.set(key, [card]);
  }
  for (const siblings of byParent.values()) siblings.sort((left, right) => left.position - right.position);
  return byParent;
}

export function TreeGrid(props: TreeGridProps) {
  const result = useTreeGridState(props);
  if (result === null || !("treeRef" in result)) return result;
  return renderTreeGrid(result);
}

function useTreeGridState({ state, onSelectCard }: TreeGridProps) {
  const treeRef = useRef<HTMLDivElement>(null);
  const focusedId = useRef<string | null>(null);
  const storyMapId = state.snapshot.storyMap.id;
  const collapsedIds = useTreeCollapseStore((store) => store.collapsedByMap[storyMapId]);
  const toggleNode = useTreeCollapseStore((store) => store.toggleNode);
  const collapsedSet = useMemo(() => new Set(collapsedIds ?? []), [collapsedIds]);
  const childrenByParent = useMemo(() => buildChildrenByParent(state.filtered.cards), [state.filtered.cards]);
  const workItemRefs = useMemo(() => buildWorkItemRefs(state.snapshot), [state.snapshot]);
  const hidden = useTreeColumnsStore((store) => store.hidden);
  const columns = useMemo(() => TREE_COLUMNS.filter((column) => !hidden.includes(column.id)), [hidden]);
  const showChanged = !hidden.includes("changed");
  const roots = childrenByParent.get(null) ?? [];

  const rows: TreeRow[] = [];
  const collect = (card: Card, depth: number) => {
    const children = childrenByParent.get(card.id) ?? [];
    rows.push({ card, depth, hasChildren: children.length > 0 });
    if (children.length === 0 || collapsedSet.has(card.id)) return;
    for (const child of children) collect(child, depth + 1);
  };
  for (const root of roots) collect(root, 0);

  useLayoutEffect(() => {
    const id = focusedId.current;
    if (!id || rows.some((row) => row.card.id === id)) return;
    const active = document.activeElement;
    if (active !== document.body && !treeRef.current?.contains(active)) return;
    const cards = new Map(state.filtered.cards.map((card) => [card.id, card]));
    let parentId = cards.get(id)?.parentId;
    while (parentId && !rows.some((row) => row.card.id === parentId)) parentId = cards.get(parentId)?.parentId;
    const target = parentId ?? rows[0]?.card.id;
    if (target) treeRef.current?.querySelector<HTMLButtonElement>(`button[data-card-id="${target}"]`)?.focus();
    else treeRef.current?.focus();
  });

  if (roots.length === 0) {
    return <div className="empty-state">{strings.emptyFilteredCards}</div>;
  }
  return { treeRef, focusedId, state, rows, collapsedSet, workItemRefs, toggleNode, storyMapId, onSelectCard, columns, showChanged };
}

function renderTreeGrid({ treeRef, focusedId, state, rows, collapsedSet, workItemRefs, toggleNode, storyMapId, onSelectCard, columns, showChanged }: Exclude<ReturnType<typeof useTreeGridState>, import("react").ReactElement | null>) {
  return (
    <div className="tree-view" data-story-map-export-target="tree" ref={treeRef} tabIndex={-1} onFocusCapture={(event) => {
      focusedId.current = (event.target as HTMLElement).closest<HTMLElement>("[data-live-card-id]")?.dataset.liveCardId ?? null;
    }} onBlurCapture={(event) => { if (event.relatedTarget && !event.currentTarget.contains(event.relatedTarget as Node)) focusedId.current = null; }}>
      <div className="tree-header">
        <span className="tree-cell-title">{strings.title}</span>
        {columns.map((column) => <span key={column.id} className={`tree-cell tree-cell-${column.id}`}>{column.header(state.snapshot.storyMap.estimationUnit)}</span>)}
      </div>
      <div className="tree-body">
        {rows.map((row) => (
          <TreeRowItem
            key={row.card.id}
            row={row}
            columns={columns}
            showChanged={showChanged}
            estimationUnit={state.snapshot.storyMap.estimationUnit}
            dependencies={state.dependencyKeys[row.card.id]}
            collapsed={collapsedSet.has(row.card.id)}
            releaseName={row.card.releaseId ? state.releaseNameById.get(row.card.releaseId) : undefined}
            workItem={workItemRefs.get(row.card.id)}
            onToggle={() => toggleNode(storyMapId, row.card.id)}
            marker={state.preview?.markers.find((marker) => marker.entity === "card" && marker.entityId === row.card.id)}
            onSelect={() => { if (!state.preview) onSelectCard(row.card.id); }}
          />
        ))}
      </div>
    </div>
  );
}

interface TreeRow {
  card: Card;
  depth: number;
  hasChildren: boolean;
}

function TreeRowItem(props: {
  row: TreeRow;
  columns: typeof TREE_COLUMNS;
  showChanged: boolean;
  estimationUnit: string;
  dependencies: CardDependencyKeys | undefined;
  marker: ChangeSetPreviewMarker | undefined;
  collapsed: boolean;
  releaseName: string | undefined;
  workItem: WorkItemRef | undefined;
  onToggle: () => void;
  onSelect: () => void;
}) {
  return renderTreeRowItem(useTreeRowItemState(props));
}

function useTreeRowItemState({
  row,
  columns,
  showChanged,
  estimationUnit,
  dependencies,
  marker,
  collapsed,
  releaseName,
  workItem,
  onToggle,
  onSelect
}: {
  row: TreeRow;
  columns: typeof TREE_COLUMNS;
  showChanged: boolean;
  estimationUnit: string;
  dependencies: CardDependencyKeys | undefined;
  marker: ChangeSetPreviewMarker | undefined;
  collapsed: boolean;
  releaseName: string | undefined;
  workItem: WorkItemRef | undefined;
  onToggle: () => void;
  onSelect: () => void;
}) {
  const { card, depth, hasChildren } = row;
  return { contextOnly: useIsFilterContext(card.id), card, marker, depth, hasChildren, collapsed, onToggle, onSelect, dependencies, columns, showChanged, cellContext: { card, estimationUnit, releaseName, workItem } };
}

function renderTreeRowItem({ contextOnly, card, marker, depth, hasChildren, collapsed, onToggle, onSelect, dependencies, columns, showChanged, cellContext }: ReturnType<typeof useTreeRowItemState>) {
  return (
    <div className={`tree-row ${contextOnly ? "filter-context" : ""} tree-row-${card.level} ${marker?.kind === "removed" ? "preview-removed" : ""}`} data-live-card-id={card.id}>
      <span className="tree-cell-title" style={{ paddingLeft: `${depth * 20}px` }}>
        {hasChildren ? (
          <button type="button" className="tree-toggle" aria-label={collapsed ? strings.expandCard(card.title) : strings.collapseCard(card.title)} aria-expanded={!collapsed} onClick={onToggle}>
            {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          </button>
        ) : (
          <span className="tree-toggle-spacer" />
        )}
        <span className={`tree-level-badge tree-level-${card.level}`}>{cardLevelMeta[card.level].label}</span>
        <button type="button" className="tree-title-button" data-card-id={card.id} onClick={onSelect} title={cardTooltip(card)}>{card.title}</button><CardReviewBadge cardId={card.id} /><PreviewMarker marker={marker} />{showChanged ? <ChangedMarker cardId={card.id} /> : null}<CardDependencyBadges dependencies={dependencies} />
      </span>
      {columns.map((column) => <span key={column.id} className={`tree-cell tree-cell-${column.id}`} title={column.title?.(cellContext)}>{column.cell(cellContext)}</span>)}
    </div>
  );
}
