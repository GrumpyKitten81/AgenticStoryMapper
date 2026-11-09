import { kanbanStatusColumns } from "@storymapper/web/features/releases/kanban-status-columns";
import { cardStatusIdentity, localStatusOptions } from "@storymapper/web/features/story-map";
import { useSyncConflicts, useSyncFieldLockHint } from "@storymapper/web/features/github-sync";
import { syncConflictStrings } from "@storymapper/web/ui-strings/sync-conflicts";
import { SyncConflictNotice } from "@storymapper/web/features/github-sync";
import { isConflictError } from "@storymapper/web/app/conflicts";
import { includePreviewGhosts } from "@storymapper/web/features/story-map";
import { buildReleaseSummaryReport, visibleCards } from "@storymapper/core";
import { ReleaseSummary } from "@storymapper/web/features/releases/ReleaseSummary";
import { PreviewMarker } from "@storymapper/web/components/PreviewMarker";
import { ChangedMarker } from "@storymapper/web/features/what-changed";
import type { Card, Release, WorkflowStatus, ChangeSetPreviewBoard } from "@storymapper/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, Circle, CircleDot, Eye } from "lucide-react";
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { conflictStrings, panelStrings, storyMapStrings } from "@storymapper/ui-strings";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { api } from "@storymapper/web/app/api";
import { useLatestVersions } from "@storymapper/web/features/conflicts";
import { invalidateReleaseViews } from "@storymapper/web/features/releases/release-utils";
import { CardDependencyBadges, type CardDependencyKeys } from "@storymapper/web/components/CardDependencyBadges";

interface KanbanChange { cardId: string; status?: string; releaseId?: string | null }

interface ReleaseKanbanProps {
  matchingCardIds?: ReadonlySet<string> | undefined;
  githubStatusCatalogs?: import("@storymapper/contracts").StoryMapSnapshot["githubStatusCatalogs"];
  remoteWorkItemLinks?: import("@storymapper/contracts").RemoteWorkItemLink[] | undefined;
  estimationUnit: string;
  sourceLinkedCardIds?: string[];
  githubLinkedCardIds?: string[];
  preview?: ChangeSetPreviewBoard | undefined;
  releases: Release[];
  cards: Card[];
  canonicalCards?: Card[] | undefined;
  dependencyKeys: Record<string, CardDependencyKeys>;
  workflowStatuses: WorkflowStatus[];
  storyMapId?: string;
  onSelectCard?: (cardId: string) => void;
}

export function ReleaseKanban(props: ReleaseKanbanProps) {
  return renderReleaseKanban(useReleaseKanbanState(props));
}

function useReleaseKanbanState(props: ReleaseKanbanProps) {
  const context = useReleaseKanbanScope(props);
  const { sourceLinkedCardIds, githubLinkedCardIds, preview, releases, cards, workflowStatuses, storyMapId, queryClient, fieldLocked, showAll, effectiveScope, scopedCards, deliveryCards } = context;
  const summary = buildReleaseSummaryReport({ storyMapId: storyMapId ?? "", cards: deliveryCards, releases, sourceLinkedCardIds, githubLinkedCardIds, includeReleased: showAll, ...(effectiveScope === "unscheduled" ? { releaseId: null } : effectiveScope === "all" ? {} : { releaseId: effectiveScope }) });
  const storyCards = scopedCards.filter((card) => card.level === "story");
  const statuses = useMemo(() => localStatusOptions({ cards: props.canonicalCards ?? cards, workflowStatuses: [...workflowStatuses].sort((left, right) => left.position - right.position) }), [workflowStatuses, props.canonicalCards, cards]);
  const columns = kanbanStatusColumns(storyCards, workflowStatuses, props.remoteWorkItemLinks ?? [], props.githubStatusCatalogs);
  const latest = useLatestVersions();
  const cardsRef = useRef(cards);
  cardsRef.current = cards;
  const updateCard = useMutation({
    scope: { id: `kanban:${storyMapId}` },
    mutationFn: (input: KanbanChange & { epoch: string | undefined }) => {
      if (input.epoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending) throw new Error(conflictStrings.changed(cardsRef.current.find((card) => card.id === input.cardId)?.key ?? input.cardId));
      if (preview) throw new Error(panelStrings.readOnlyTracking);
      return api.updateCard(input.cardId, {
        status: input.status,
        releaseId: input.releaseId
      }, latest.resolve(input.cardId, cardsRef.current.find((card) => card.id === input.cardId)!.version));
    },
    onSuccess: (saved, input) => {
      if (input.epoch !== useLiveInteractionStore.getState().epoch) return;
      latest.record(saved.id, saved.version);
      return invalidateReleaseViews(queryClient, storyMapId);
    }
  });

  const changeCard = (input: KanbanChange) => { if (input.status !== undefined && fieldLocked(input.cardId, "status") || input.releaseId !== undefined && fieldLocked(input.cardId, "milestone")) return; updateCard.mutate({ ...input, epoch: useLiveInteractionStore.getState().epoch }); };
  return { ...context, summary, updateCard, columns, storyCards, changeCard, statuses };
}

function renderReleaseKanban(model: ReturnType<typeof useReleaseKanbanState>) {
  const { container, focused, showAll, preview, setShowAll, scopeControl, effectiveScope, setScope, visibleReleases, releases, summary, estimationUnit, updateCard, columns, storyCards, dependencyKeys, fieldLocked, changeCard, statuses, onSelectCard } = model;
  return (
    <div ref={container} className="release-kanban-page" data-story-map-export-target="tracking"
      onFocusCapture={(event) => { focused.current = event.target.closest('[data-live-card-id]') ? event.target : null; }}
      onBlurCapture={(event) => { if (event.target.isConnected) focused.current = null; }}>

      <label className="checkbox-row"><input type="checkbox" checked={showAll} disabled={Boolean(preview)} onChange={(event) => setShowAll(event.target.checked)} />{panelStrings.showAllReleases}</label>
      {renderReleaseStories(model)}
      {preview?.markers.filter((marker) => marker.entity === "release").map((marker) => <div key={marker.entityId} className={marker.kind === "removed" ? "preview-removed" : undefined}>{releases.find((release) => release.id === marker.entityId)?.name}<PreviewMarker marker={marker} /></div>)}
      <ReleaseSummary summary={summary} estimationUnit={estimationUnit} />
      {updateCard.error ? <p role="alert">{updateCard.error.message}</p> : null}
      {isConflictError(updateCard.error) ? updateCard.error.conflicts.filter((entry) => entry.reason === "sync").map((entry, index) => <div role="alert" key={index}><SyncConflictNotice current={entry.current} /></div>) : null}
      <div className="release-kanban">
        {columns.map((status) => renderKanbanStatusColumn(model, status))}
      </div>
    </div>
  );
}

function statusIcon(status: string | undefined) {
  if (status === "done") return <CheckCircle2 size={15} />;
  if (status === "active") return <CircleDot size={15} />;
  return <Circle size={15} />;
}

function renderReleaseStories(model: ReturnType<typeof useReleaseKanbanState>) {
  const { scopeControl, effectiveScope, setScope, showAll, visibleReleases } = model;
  return <label className="release-kanban-scope">
    {panelStrings.scope}<select ref={scopeControl} value={effectiveScope} onChange={(event) => setScope(event.target.value)}>
      <option value="all">{showAll ? panelStrings.allReleases : panelStrings.openReleases}</option>
      <option value="unscheduled">{panelStrings.unscheduled}</option>
      {visibleReleases.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}
    </select>
  </label>;
}

function useReleaseKanbanScope({ canonicalCards, githubStatusCatalogs, remoteWorkItemLinks = [], matchingCardIds, sourceLinkedCardIds = [], githubLinkedCardIds = [], preview, estimationUnit, releases, cards, dependencyKeys, workflowStatuses, storyMapId, onSelectCard }: ReleaseKanbanProps) {
  const queryClient = useQueryClient();
  const syncConflicts = useSyncConflicts();
  const fieldLockHint = useSyncFieldLockHint(remoteWorkItemLinks);
  const fieldLocked = (cardId: string, field: "status" | "milestone") => field === "status" && remoteWorkItemLinks.some((link) => link.cardId === cardId) || syncConflicts.some((conflict) => conflict.cardId === cardId && conflict.field === field);
  const container = useRef<HTMLDivElement>(null);
  const scopeControl = useRef<HTMLSelectElement>(null);
  const focused = useRef<HTMLElement | null>(null);
  useLayoutEffect(() => {
    const previous = focused.current;
    if (!previous || previous.isConnected || document.activeElement !== document.body) return;
    const label = previous.getAttribute("aria-label");
    const replacement = [...(container.current?.querySelectorAll<HTMLElement>('[aria-label]') ?? [])].find((element) => element.getAttribute("aria-label") === label);
    const cardId = previous.closest<HTMLElement>('[data-live-card-id]')?.dataset.liveCardId;
    const survivingCard = [...(container.current?.querySelectorAll<HTMLElement>('[data-live-card-id]') ?? [])].find((element) => element.dataset.liveCardId === cardId);
    (replacement ?? survivingCard?.querySelector<HTMLElement>('select, button') ?? scopeControl.current)?.focus();
  });
  const [scope, setScope] = useState<string>("all");
  const [showAllChosen, setShowAll] = useState(false);
  const showAll = showAllChosen || Boolean(preview);
  const visibleReleases = releases.filter((release) => showAll || !release.released);
  const effectiveScope = scope === "all" || scope === "unscheduled" || visibleReleases.some((release) => release.id === scope) ? scope : "all";
  if (scope !== effectiveScope) setScope(effectiveScope);
  const eligibleCards = useMemo(() => preview ? includePreviewGhosts(cards, preview) : visibleCards(cards), [cards, preview]);
  const scopedCards = useMemo(() => {
    if (effectiveScope === "all") return eligibleCards.filter((card) => !card.releaseId || visibleReleases.some((release) => release.id === card.releaseId));
    if (effectiveScope === "unscheduled") return eligibleCards.filter((card) => card.releaseId === null);
    return eligibleCards.filter((card) => card.releaseId === effectiveScope);
  }, [eligibleCards, effectiveScope, releases, showAll, preview]);
  const scopedIds = new Set(scopedCards.map((card) => card.id));
  const removedIds = new Set(preview?.markers.filter((marker) => marker.entity === "card" && marker.kind === "removed").map((marker) => marker.entityId));
  const deliveryCards = visibleCards(canonicalCards ?? cards).filter((card) => (!matchingCardIds || matchingCardIds.has(card.id)) && !removedIds.has(card.id) && (effectiveScope === "all" ? showAll || !card.releaseId || visibleReleases.some((release) => release.id === card.releaseId) : effectiveScope === "unscheduled" ? card.releaseId === null : card.releaseId === effectiveScope));
  return { githubStatusCatalogs, remoteWorkItemLinks, matchingCardIds, sourceLinkedCardIds, githubLinkedCardIds, preview, estimationUnit, releases, cards, dependencyKeys, workflowStatuses, storyMapId, onSelectCard, queryClient, fieldLocked, fieldLockHint, container, scopeControl, focused, setScope, setShowAll, showAll, visibleReleases, effectiveScope, scopedCards, deliveryCards };
}

function cardStatusChoices(current: string, statuses: readonly string[], definitions: readonly WorkflowStatus[]): readonly string[] {
  return definitions.some((status) => status.name === current) && statuses.includes(current) ? statuses : [current, ...statuses.filter((name) => name !== current)];
}

function renderKanbanStatusColumn(model: ReturnType<typeof useReleaseKanbanState>, status: ReturnType<typeof useReleaseKanbanState>["columns"][number]) {
  const { matchingCardIds, storyCards, preview, estimationUnit, dependencyKeys, fieldLocked, changeCard, statuses, releases, onSelectCard } = model;

  const cardsForStatus = storyCards.filter((card) => cardStatusIdentity(card, model.remoteWorkItemLinks, model.workflowStatuses) === status.id);
  return (
    <section className="release-kanban-column" key={status.id}>
      <div className="release-kanban-heading">
        {statusIcon(status.group)}
        <strong>{status.label}</strong>
        <span>{cardsForStatus.filter((card) => !matchingCardIds || matchingCardIds.has(card.id)).length}</span>
      </div>
      {cardsForStatus.map((card) => (
        <article className={`release-kanban-card${preview?.markers.some((marker) => marker.entity === "card" && marker.entityId === card.id && marker.kind === "removed") ? " preview-removed" : ""}${matchingCardIds && !matchingCardIds.has(card.id) ? " filter-context" : ""}`} key={card.id} data-live-card-id={card.id}>
          <div>
            <strong>{card.key}</strong>
            <span>{card.estimate !== undefined && card.estimate !== null ? storyMapStrings.estimateWithUnit(card.estimate, estimationUnit) : panelStrings.noEstimate}</span>
          </div>
          <PreviewMarker marker={preview?.markers.find((marker) => marker.entity === "card" && marker.entityId === card.id)} /><ChangedMarker cardId={card.id} /><p>{card.title}</p>
          <div className="card-badges"><CardDependencyBadges dependencies={dependencyKeys[card.id]} /></div>
          {fieldLocked(card.id, "status") ? <p id={`sync-status-lock-${card.id}`}>{model.fieldLockHint(card.id, "status")}</p> : null}
          {fieldLocked(card.id, "milestone") ? <p id={`sync-release-lock-${card.id}`}>{syncConflictStrings.lock(syncConflictStrings.fields.milestone)}</p> : null}
          <div className="release-card-actions button-row">
            <select disabled={Boolean(preview) || fieldLocked(card.id, "status")} title={model.fieldLockHint(card.id, "status")} aria-describedby={fieldLocked(card.id, "status") ? `sync-status-lock-${card.id}` : undefined} aria-label={panelStrings.cardStatus(card.key)} value={card.status} onChange={(event) => changeCard({ cardId: card.id, status: event.target.value })}>
              {cardStatusChoices(card.status, statuses, model.workflowStatuses).map((name) => <option key={name} value={name}>{name}</option>)}
            </select>
            <select disabled={Boolean(preview) || fieldLocked(card.id, "milestone")} title={fieldLocked(card.id, "milestone") ? syncConflictStrings.lock(syncConflictStrings.fields.milestone) : undefined} aria-describedby={fieldLocked(card.id, "milestone") ? `sync-release-lock-${card.id}` : undefined} aria-label={panelStrings.cardRelease(card.key)} value={card.releaseId ?? ""} onChange={(event) => changeCard({ cardId: card.id, releaseId: event.target.value || null })}>
              <option value="">{panelStrings.unscheduled}</option>
              {releases.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}
            </select>
            <button type="button" className="secondary icon-button" disabled={Boolean(preview)} aria-label={panelStrings.openNamedCard(card.key)} title={panelStrings.openCardDetail} onClick={() => { if (!preview) onSelectCard?.(card.id); }}>
              <Eye size={15} />
            </button>
            {card.releaseId ? (
              <button type="button" className="secondary" disabled={Boolean(preview) || fieldLocked(card.id, "milestone")} onClick={() => changeCard({ cardId: card.id, releaseId: null })}>{panelStrings.unscope}</button>
            ) : null}
          </div>
        </article>
      ))}
      {cardsForStatus.length === 0 ? <p className="kanban-empty">{panelStrings.noCards}</p> : null}
    </section>
  );

}
