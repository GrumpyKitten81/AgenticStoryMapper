import { useCardColors } from "@storymapper/web/features/story-map/color-names-context";
import { CardReviewBadge } from "@storymapper/web/features/card-review";
import { useIsFilterContext } from "@storymapper/web/features/story-map/filter-context";
import { useSyncFieldLockHint, useSyncFieldLocks } from "@storymapper/web/features/github-sync";
import { PlanningNumberField } from "@storymapper/web/features/story-map/components/PlanningNumberField";
import { ChangedMarker, useCardChangeDescription } from "@storymapper/web/features/what-changed";
import { CardDependencyBadges, type CardDependencyKeys } from "@storymapper/web/components/CardDependencyBadges";
import type { ChangeSetPreviewMarker, Card, CardLevel, ExternalRef, UpdateCardRequest, WorkItemProvider } from "@storymapper/contracts";
import type React from "react";
import { useLayoutEffect, useRef } from "react";
import { useDiscoveryNavigation } from "@storymapper/web/features/story-map/components/discovery-navigation";
import { CardChoice } from "@storymapper/web/features/story-map/components/CardChoice";
import { useSortable } from "@dnd-kit/sortable";
import { ArrowDown, ChevronLeft, ChevronRight, Circle, Github, GripVertical, History, StickyNote, Trash2 } from "lucide-react";
import { cardLevelMeta } from "@storymapper/web/features/story-map/card-taxonomy";
import { cardTooltip } from "@storymapper/web/features/story-map/card-tooltip";
import { githubSyncStateHint } from "@storymapper/web/features/github-sync";
import { CARD_PRIORITY_OPTIONS, DEFAULT_CARD_COLOR } from "@storymapper/web/features/story-map/card-visual-options";
import { panelStrings, storyMapStrings as strings } from "@storymapper/ui-strings";
import { isPersonasEnabled } from "@storymapper/web/app/feature-flags";

import { PreviewMarker } from "@storymapper/web/components/PreviewMarker";

interface CardTileProps {
  estimationUnit: string;
  personaNames?: string[] | undefined;
  previewMarker?: ChangeSetPreviewMarker | undefined;
  readOnly?: boolean;
  updatePending?: boolean | undefined;
  card: Card;
  tone?: CardLevel;
  variant?: "discovery" | "planning" | "backlog";
  selected?: boolean;
  bulkSelected: boolean;
  sourceLinkCount: number;
  githubIssue: number | undefined;
  githubSyncState?: string | undefined;
  workItemProvider?: WorkItemProvider | undefined;
  releaseName: string | undefined;
  dependencies?: CardDependencyKeys | undefined;
  externalRefs?: ExternalRef[] | undefined;
  onSelect: (cardId: string) => void;
  onBulkToggle: (cardId: string) => void;
  onUpdateCard?: (cardId: string, patch: UpdateCardRequest, baseVersion?: number) => void | Promise<unknown>;
  onDelete?: (cardId: string) => void;
  onAddNote?: (() => void) | undefined;
  onMove?: (() => void) | undefined;
  onMoveToArea?: (() => void) | undefined;
  onMoveLeft?: (() => void) | undefined;
  onMoveRight?: (() => void) | undefined;
  dragHandleProps?: React.HTMLAttributes<HTMLButtonElement>;
}

interface SortableCardTileProps extends CardTileProps {
  hidden?: boolean;
  dragScale?: number;
}

export function CardTile(props: CardTileProps) {
  return renderCardTile(useCardTileState(props));
}

function useCardTileState(props: CardTileProps) {
  const context = useCardTilePresentation(props);
  return { ...context, contextOnly: useIsFilterContext(props.card.id) };
}

function renderCardTile(model: ReturnType<typeof useCardTileState>) {
  const { article, navigation, tone, selected, bulkSelected, previewMarker, card, readOnly, stateDescription, active, onSelect, descriptionPreview, variant, personaNames, dependencies, estimationUnit, releaseName, sourceLinkCount, externalRefs, githubIssue, githubSyncState, lockHints, onBulkToggle, onMove, onMoveLeft, onMoveRight, onMoveToArea, onDelete, dragHandleProps, workItemProvider, cardColor, onUpdateCard, updatePending } = model;
  return (
    <article
      ref={article}
      onKeyDownCapture={(event) => {
        if (navigation && event.key === "Escape" && event.target !== article.current?.querySelector('[data-card-id]')) {
          const primary = article.current?.querySelector<HTMLButtonElement>('[data-card-id]');
          if (event.target instanceof HTMLElement && event.target.closest('[data-live-popover]')) queueMicrotask(() => primary?.focus());
          else { event.preventDefault(); event.stopPropagation(); primary?.focus(); }
        }
      }}
      className={`card-tile ${model.contextOnly ? "filter-context" : ""} ${tone} ${selected ? "selected" : ""} ${bulkSelected ? "bulk-selected" : ""} ${previewMarker?.kind === "removed" ? "preview-removed" : ""}`}
      data-live-card-id={card.id}
      data-export-card-description={card.description}
      data-export-card-key={card.key}
      data-export-card-title={card.title}
    >
      <button type="button" className="card-content-button" disabled={readOnly && !navigation} aria-disabled={readOnly || undefined} data-card-id={card.id} aria-label={`${card.key} ${cardLevelMeta[card.level].label} ${card.title}`} aria-description={stateDescription} aria-pressed={navigation ? bulkSelected : undefined} tabIndex={navigation ? (active ? 0 : -1) : undefined} onFocus={() => navigation?.activate(card.id)} onBlur={(event) => { if (!event.relatedTarget && event.currentTarget.isConnected) navigation?.release(card.id); }} onKeyDown={(event) => navigation?.keyDown(card.id, event)} onClick={() => { if (!readOnly) onSelect(card.id); }}>
        <strong className="card-title" title={cardTooltip(card)}>{card.title}</strong>
        {descriptionPreview && variant === "backlog" ? <p>{descriptionPreview}</p> : null}
        <div className="card-badges">
          {personaNames.length ? <span>{strings.assignedPersonas(personaNames)}</span> : null}
          <CardDependencyBadges dependencies={dependencies} />
          {card.estimate !== undefined && card.estimate !== null ? <span>{strings.estimateWithUnit(card.estimate, estimationUnit)}</span> : null}
          {releaseName && variant !== "discovery" ? <span>{releaseName}</span> : null}
          {sourceLinkCount > 0 ? <span>{strings.countSources(sourceLinkCount)}</span> : null}
          {variant === "discovery" ? null : externalRefs.map((ref) => <span className="external-ref-badge" key={ref.id}>{panelStrings.externalRef(ref.system, ref.externalId)}</span>)}
          {githubIssue && variant !== "discovery" ? <span title={strings.githubIssueHint(githubIssue, githubSyncStateHint(githubSyncState))}>{strings.issueMark}{githubIssue}</span> : null}
          {variant === "backlog" ? <span><History size={12} />{" "}{strings.history}</span> : null}
        </div>
      </button>
      {lockHints.map((hint) => <small key={hint}>{hint}</small>)}
      <PreviewMarker marker={previewMarker} />{renderCardActions(model)}
      {variant === "discovery" ? (
        renderCardVisualControls(model)
      ) : null}
      {variant === "planning" ? (

        <div className="planning-card-fields">
          <CardChoice name={strings.priorityControl(card.priority || strings.emptyValue)} value={card.priority ?? ""} options={[{ value: "", label: strings.emptyValue }, ...CARD_PRIORITY_OPTIONS.map((value) => ({ value, label: value }))]} disabled={readOnly || !onUpdateCard} onChange={(priority) => onUpdateCard?.(card.id, { priority })} />
          <PlanningNumberField cardId={card.id} field="businessValue" name={strings.businessValue} value={card.businessValue} version={card.version} disabled={readOnly || updatePending || !onUpdateCard} onCommit={(value, baseVersion) => onUpdateCard?.(card.id, { businessValue: value }, baseVersion)} />
          <PlanningNumberField cardId={card.id} field="effort" name={strings.effort} value={card.effort} version={card.version} disabled={readOnly || updatePending || !onUpdateCard} onCommit={(value, baseVersion) => onUpdateCard?.(card.id, { effort: value }, baseVersion)} />
        </div>
      ) : null}
    </article>
  );
}

export function SortableCardTile({ dragScale = 1, hidden = false, ...props }: SortableCardTileProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: props.card.id, disabled: hidden });
  const style: React.CSSProperties = {
    transform: transform ? `translate3d(${transform.x / dragScale}px, ${transform.y / dragScale}px, 0) scaleX(${transform.scaleX}) scaleY(${transform.scaleY})` : undefined,
    transition,
    opacity: isDragging ? 0.55 : undefined
  };

  return (
    <div ref={setNodeRef} style={style} hidden={hidden}>
      <CardTile {...props} dragHandleProps={{ ...attributes, ...listeners }} />
    </div>
  );
}

function useCardTilePresentation({
  card,
  personaNames: assignedPersonaNames = [],
  estimationUnit,
  previewMarker,
  readOnly: explicitReadOnly = false,
  updatePending = false,
  tone = card.level,
  variant = "discovery",
  selected = false,
  bulkSelected,
  sourceLinkCount,
  githubIssue,
  githubSyncState,
  workItemProvider,
  releaseName,
  externalRefs = [],
  dependencies,
  onSelect,
  onBulkToggle,
  onUpdateCard,
  onDelete,
  onAddNote,
  onMove,
  onMoveToArea,
  onMoveLeft,
  onMoveRight,
  dragHandleProps
}: CardTileProps) {
  const personaNames = isPersonasEnabled ? assignedPersonaNames : [];
  const navigation = useDiscoveryNavigation();
  const syncLocks = useSyncFieldLocks(card.id);
  const fieldLockHint = useSyncFieldLockHint();
  const lockHints = [...syncLocks].flatMap((field) => fieldLockHint(card.id, field) ?? []);
  const readOnly = explicitReadOnly || Boolean(navigation?.readOnly);
  const changeDescription = useCardChangeDescription(card.id);
  const stateDescription = describeCardState(card, changeDescription, lockHints, personaNames, dependencies, githubSyncState);
  const article = useRef<HTMLElement>(null);
  const active = navigation?.activeId === card.id;
  useLayoutEffect(() => {
    if (!navigation) return;
    for (const control of article.current?.querySelectorAll<HTMLElement>('button:not([data-card-id]), input, select, textarea') ?? []) {
      if (control.getAttribute("role") !== "option") control.tabIndex = active ? 0 : -1;
    }
  });
  const colors = useCardColors();
  const cardColor = colors.find((entry) => entry.value === (card.color ?? DEFAULT_CARD_COLOR));
  const descriptionPreview = card.description.length > 120 ? `${card.description.slice(0, 120)}...` : card.description;
  return { card, personaNames, estimationUnit, previewMarker, updatePending, tone, variant, selected, bulkSelected, sourceLinkCount, githubIssue, githubSyncState, workItemProvider, releaseName, externalRefs, dependencies, onSelect, onBulkToggle, onUpdateCard, onDelete, onAddNote, onMove, onMoveToArea, onMoveLeft, onMoveRight, dragHandleProps, navigation, lockHints, readOnly, stateDescription, article, active, colors, cardColor, descriptionPreview };
}

function renderCardActions(model: ReturnType<typeof useCardTileState>) {
  const { card, readOnly, bulkSelected, onBulkToggle, onMove, onMoveLeft, onMoveRight, onMoveToArea, onDelete, onAddNote, dragHandleProps, variant } = model;
  return <div className="card-selection-row">
    <div className="card-id-group">
      <label className="card-checkbox">
        <input type="checkbox" aria-label={strings.selectCard(card.key, card.title)} disabled={readOnly} checked={bulkSelected} onChange={() => onBulkToggle(card.id)} />
        <span>{card.key}</span>
      </label>
      <CardReviewBadge cardId={card.id} /><ChangedMarker cardId={card.id} />
      {card.assignee ? <span className="card-assignee" title={strings.assigneeHint(card.assignee)}>{card.assignee}</span> : null}
    </div>
    <div className="card-level-status">
      {variant === "discovery" ? null : <><span className="card-level-badge">{cardLevelMeta[card.level].label}</span><span>{card.status}</span></>}
      {onMove ? <button type="button" className="card-move" aria-label={strings.moveStoryNamed(card.key)} disabled={readOnly} onClick={onMove}><ChevronRight size={14} /></button> : null}
      {onMoveLeft ? (
        <button type="button" className="card-move" disabled={readOnly} aria-label={strings.moveLeft(card.title)} onClick={onMoveLeft}>
          <ChevronLeft size={14} />
        </button>
      ) : null}
      {onMoveRight ? (
        <button type="button" className="card-move" disabled={readOnly} aria-label={strings.moveRight(card.title)} onClick={onMoveRight}>
          <ChevronRight size={14} />
        </button>
      ) : null}
      {onMoveToArea && (card.level === "story" || card.level === "activity") ? (
        <button type="button" className="card-move" disabled={readOnly} aria-label={card.level === "activity" ? strings.parkCard(card.title) : strings.moveToArea(card.title)} title={card.level === "activity" ? strings.parkInNotAssigned : strings.moveToUnscheduledOrNotAssigned} onClick={onMoveToArea}>
          <ArrowDown size={14} />
        </button>
      ) : null}
      {onAddNote ? <button type="button" className="card-move" disabled={readOnly} aria-label={strings.addNote(card.title)} onClick={onAddNote}><StickyNote size={14} /></button> : null}
      {onDelete ? (
        <button type="button" className="card-delete danger" disabled={readOnly} aria-label={strings.deleteCard(card.title)} onClick={() => onDelete(card.id)}>
          <Trash2 size={13} />
        </button>
      ) : null}
      {dragHandleProps && variant !== "discovery" ? (
        <button type="button" className="drag-handle" disabled={readOnly} aria-label={strings.dragCard(card.title)} {...dragHandleProps}>
          <GripVertical size={14} />
        </button>
      ) : null}
    </div>
  </div>;
}

function renderCardVisualControls(model: ReturnType<typeof useCardTileState>) {
  const { workItemProvider, githubIssue, githubSyncState, card, colors, cardColor, readOnly, onUpdateCard, dragHandleProps } = model;
  return <div className="card-visual-row">
    <div className="card-visual-left">
      <span className="card-provider-icon" title={workItemProvider === "github" ? strings.githubHint(githubIssue, githubSyncStateHint(githubSyncState)) : strings.notLinked}>
        {workItemProvider === "github" ? <Github size={12} /> : <Circle size={12} />}
      </span>
      <span className="card-ticket-number" title={githubIssue ? strings.ticketHint(githubIssue) : strings.noTicketLinked}>{githubIssue ? strings.ticketNumber(githubIssue) : strings.issueMark}</span>
      <CardChoice name={strings.colorControl(cardColor?.label ?? card.color ?? DEFAULT_CARD_COLOR)} value={card.color ?? DEFAULT_CARD_COLOR} options={colors.map(({ label, value }) => ({ label, value, swatch: value }))} disabled={readOnly || !onUpdateCard} className="card-color-choice" onChange={(color) => onUpdateCard?.(card.id, { color })} />
      <CardChoice name={strings.priorityControl(card.priority || strings.emptyValue)} value={card.priority ?? ""} options={[{ value: "", label: strings.emptyValue }, ...CARD_PRIORITY_OPTIONS.map((value) => ({ value, label: value }))]} disabled={readOnly || !onUpdateCard} className={card.priority ? "card-priority-badge has-priority" : "card-priority-badge"} onChange={(priority) => onUpdateCard?.(card.id, { priority })} />
    </div>
    {dragHandleProps ? (
      <button type="button" className="drag-handle" disabled={readOnly} aria-label={strings.dragCard(card.title)} {...dragHandleProps}>
        <GripVertical size={14} />
      </button>
    ) : null}
  </div>;
}

function describeCardState(card: Card, changeDescription: string, lockHints: string[], personaNames: string[], dependencies: CardDependencyKeys | undefined, githubSyncState: string | undefined): string {
  return [card.status, changeDescription, ...lockHints,
  personaNames.length ? strings.assignedPersonas(personaNames) : "",
  dependencies?.prerequisites.length ? strings.dependsOnKeys(dependencies.prerequisites) : "",
  dependencies?.dependents.length ? strings.requiredByKeys(dependencies.dependents) : "",
  githubSyncState === "conflict" ? githubSyncStateHint(githubSyncState) : ""
  ].filter(Boolean).join(". ");
}
