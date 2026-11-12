import { BulkCardTypeField } from "@storymapper/web/features/card-review";
import { githubStatusStrings as statusStrings } from "@storymapper/web/ui-strings/github-status";
import { statusFilterOptions } from "@storymapper/web/features/story-map/status-filters";
import { SyncConflictNotice } from "@storymapper/web/features/github-sync";
import { useManagedAnnotationSyncLocks, useSyncFieldLockHint, useSyncFieldLocksForCards } from "@storymapper/web/features/github-sync";
import { syncConflictStrings } from "@storymapper/web/ui-strings/sync-conflicts";
import type { Card, SyncConflict } from "@storymapper/contracts";
import { Dialog } from "@storymapper/web/components/Dialog";
import { GitHubSyncPanel } from "@storymapper/web/features/github-sync";
import { DeleteCardsDialog } from "@storymapper/web/features/story-map/components/DeleteCardsDialog";
import { isConflictError } from "@storymapper/web/app/conflicts";
import { encodeFilterValue } from "@storymapper/web/features/story-map/useStoryMapBoardState";
import { CARD_COLORS, CARD_PRIORITY_OPTIONS } from "@storymapper/web/features/story-map/card-visual-options";
import { visibleCards } from "@storymapper/core";
import { LifecycleInventory } from "@storymapper/web/features/story-map/components/LifecycleInventory";
import { SlidersHorizontal } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { cardLevelMeta } from "@storymapper/web/features/story-map/card-taxonomy";
import type { StoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";
import type { BoardFilters } from "@storymapper/web/features/story-map/board-filters";
import { storyMapStrings as strings } from "@storymapper/ui-strings";
import { useDiscoveryLaneCollapseStore } from "@storymapper/web/app/stores/discovery-lane-collapse-store";
import { discoveryDisplayedCardIds } from "@storymapper/web/features/story-map/components/discovery-visibility";
import { isPersonasEnabled } from "@storymapper/web/app/feature-flags";

interface BoardToolbarProps {
  state: StoryMapBoardState;
  displayedCardIds?: Set<string>;
  searchVisible?: boolean;
}

export function DiscoveryBoardToolbar({ state, searchVisible }: { state: StoryMapBoardState; searchVisible: boolean }) {
  const collapsedLaneIds = useDiscoveryLaneCollapseStore((store) => store.collapsedByMap[state.snapshot.storyMap.id]);
  const displayedCardIds = discoveryDisplayedCardIds(state.boardCards, state.filtered.visibleCardIds, collapsedLaneIds ?? []);
  return <BoardToolbar state={state} displayedCardIds={displayedCardIds} searchVisible={searchVisible} />;
}

export function BoardToolbar(props: BoardToolbarProps) {
  return renderBoardToolbar(useBoardToolbarState(props));
}

function useBoardToolbarState({ state, displayedCardIds = state.filtered.visibleCardIds, searchVisible = true }: BoardToolbarProps) {
  const { snapshot, filters, setFilters, clearFilters, statusOptions, bulkPatch, setBulkPatch, selectedIds, setBulkSelectedIds, runBulkUpdate, filtered } = state;
  const syncLocks = useSyncFieldLocksForCards(selectedIds);
  const lockHint = useSyncFieldLockHint();
  const fieldLockHint = (field: SyncConflict["field"]) => lockHint(selectedIds, field);
  const annotationLocks = useManagedAnnotationSyncLocks(selectedIds);
  const lockedPatch = Boolean(syncLocks.has("status") && bulkPatch.status || syncLocks.has("milestone") && bulkPatch.releaseId || (annotationLocks.has(bulkPatch.addAnnotationId) || annotationLocks.has(bulkPatch.removeAnnotationId)));
  const selectedVisibleCount = [...selectedIds].filter((id) => displayedCardIds.has(id)).length;
  const [deleteIds, setDeleteIds] = useState<{ mapId: string; cards: Card[] } | null>(null);
  const [githubIds, setGithubIds] = useState<{ mapId: string; ids: string[] } | null>(null);
  const toolbar = useRef<HTMLDivElement>(null);
  const submittedControl = useRef<HTMLButtonElement | null>(null);
  useLayoutEffect(() => {
    if (submittedControl.current && !submittedControl.current.isConnected) {
      if (document.activeElement === document.body) toolbar.current?.querySelector<HTMLInputElement>(".board-search-row input")?.focus();
      submittedControl.current = null;
    }
  });
  useLayoutEffect(() => {
    const control = submittedControl.current;
    if (!state.bulkUpdateCards.isPending && control?.isConnected && document.activeElement === document.body) control.focus();
  }, [state.bulkUpdateCards.isPending]);
  const preview = Boolean(state.preview);
  useEffect(() => { setDeleteIds(null); setGithubIds(null); }, [snapshot.storyMap.id, preview]);
  const pending = state.bulkUpdateCards.isPending || state.deleteCards.isPending;
  const selectedCards = snapshot.cards.filter((card) => selectedIds.has(card.id));
  const colors = [...new Set([...CARD_COLORS.map((category) => category.value), ...snapshot.cards.map((card) => card.color).filter((color): color is string => Boolean(color))])];
  const [inventory, setInventory] = useState<"parked" | "archived" | null>(null);
  const [filtersOpen, setFiltersOpen] = useState(false);
  return { searchVisible, toolbar, filters, setFilters, filtered, snapshot, filtersOpen, setFiltersOpen, clearFilters, setInventory, state, inventory, statusOptions, colors, selectedIds, pending, selectedVisibleCount, selectedCards, syncLocks, fieldLockHint, bulkPatch, setBulkPatch, annotationLocks, lockedPatch, submittedControl, runBulkUpdate, setDeleteIds, setGithubIds, setBulkSelectedIds, deleteIds, githubIds };
}

function renderBoardToolbar(model: ReturnType<typeof useBoardToolbarState>) {
  const { toolbar, filters, setFilters, filtered, snapshot, filtersOpen, setFiltersOpen, clearFilters, setInventory, state, inventory, statusOptions, colors, selectedIds, pending, selectedVisibleCount, selectedCards, syncLocks, bulkPatch, setBulkPatch, annotationLocks, lockedPatch, submittedControl, runBulkUpdate, setDeleteIds, setGithubIds, setBulkSelectedIds, deleteIds, githubIds } = model;
  return (
    <div ref={toolbar} className="board-toolbar board-toolbar-expanded">
      {model.searchVisible ? renderBoardFilterControls(model) : null}
      {inventory ? <LifecycleInventory kind={inventory} snapshot={snapshot} onClose={() => setInventory(null)} onNotice={state.setLifecycleNotice} /> : null}
      {model.searchVisible && filtersOpen ? (
        renderBoardFilters(model)
      ) : null}
      {selectedIds.size > 0 && !state.preview ? (
        <section className="bulk-action-bar" aria-label={strings.bulkActions}>
          <BulkCardTypeField value={bulkPatch.cardType} onChange={(cardType) => setBulkPatch((current) => ({ ...current, cardType }))} disabled={pending || model.selectedCards.some((card) => card.level === "note")} />
          {renderBulkPatchFields(model)}
          {[...syncLocks].map((field) => <p key={field}>{model.fieldLockHint(field)}</p>)}
          {state.bulkValidationError ? <p role="alert">{state.bulkValidationError}</p> : null}
          {state.bulkError ? <div role="alert"><p>{state.bulkError.message}</p>{isConflictError(state.bulkError) ? <ul>{state.bulkError.conflicts.map((entry, index) => <li key={`${entry.id}:${index}`}>{entry.reason === "sync" ? <SyncConflictNotice current={entry.current} /> : entry.currentVersion === undefined ? strings.deleteConflictReason(snapshot.cards.find((card) => card.id === entry.id)?.title ?? entry.id, entry.message) : strings.deleteConflictVersion(snapshot.cards.find((card) => card.id === entry.id)?.title ?? entry.id, entry.baseVersion, entry.currentVersion)}</li>)}</ul> : null}</div> : null}
        </section>
      ) : null}
      {deleteIds?.mapId === snapshot.storyMap.id && !state.preview ? <DeleteCardsDialog cards={deleteIds.cards} state={state} onClose={() => setDeleteIds(null)} /> : null}
      {githubIds?.mapId === snapshot.storyMap.id && !state.preview ? <Dialog title={strings.selectedGitHubDryRun} onClose={() => setGithubIds(null)}><GitHubSyncPanel projectId={snapshot.storyMap.projectId} storyMapId={snapshot.storyMap.id} storyMapName={snapshot.storyMap.name} storyMapVersion={snapshot.storyMap.version} defaultConnectionId={snapshot.storyMap.defaultConnectionId} cards={snapshot.cards} releases={snapshot.releases} links={snapshot.githubLinks} selectedCardIds={githubIds.ids} /></Dialog> : null}
    </div>
  );
}

function renderBoardFilterControls(model: ReturnType<typeof useBoardToolbarState>) {
  const { filters, setFilters, filtered, snapshot, filtersOpen, setFiltersOpen, clearFilters, setInventory } = model;
  return <div className="board-search-row">
    <input
      aria-label={strings.searchCards}
      placeholder={strings.searchPlaceholder}
      value={filters.search}
      onChange={(event) => setFilters((value) => ({ ...value, search: event.target.value }))}
    />
    <span role="status">{strings.searchMatches(filtered.matchingCardIds.size, visibleCards(snapshot.cards).length)}</span>
    <button type="button" className={filtersOpen ? "" : "secondary"} aria-pressed={filtersOpen} onClick={() => setFiltersOpen((open) => !open)}><SlidersHorizontal size={16} />{" "}{strings.filters}</button>
    <button type="button" className="secondary" onClick={clearFilters}>{strings.clear}</button>
    <button type="button" className="secondary" onClick={() => setInventory("parked")}>{strings.parked}</button>
    <button type="button" className="secondary" onClick={() => setInventory("archived")}>{strings.archivedList}</button>
  </div>;
}

function renderGitHubFilter(model: ReturnType<typeof useBoardToolbarState>) {
  const { filters, setFilters } = model;
  return <select aria-label={strings.anyGitHub} value={filters.github} onChange={(event) => setFilters((value) => ({ ...value, github: event.target.value as BoardFilters["github"] }))}>
    <option value="all">{strings.anyGitHub}</option>
    <option value="linked">{strings.hasGitHub}</option>
    <option value="unlinked">{strings.noGitHub}</option>
    <option value="synced">{strings.synced}</option>
    <option value="unsynced">{strings.unsynced}</option>
    <option value="conflict">{strings.conflict}</option>
    <option value="stale">{strings.stale}</option>
    <option value="remote_deleted">{strings.remoteDeleted}</option>
    <option value="local_deleted">{strings.localDeleted}</option>
  </select>;
}

function renderLevelFilter(model: ReturnType<typeof useBoardToolbarState>) {
  const { filters, setFilters } = model;
  return <select aria-label={strings.allLevels} value={filters.level} onChange={(event) => setFilters((value) => ({ ...value, level: event.target.value as BoardFilters["level"] }))}>
    <option value="all">{strings.allLevels}</option>
    <option value="activity">{cardLevelMeta.activity.pluralLabel}</option>
    <option value="step">{cardLevelMeta.step.pluralLabel}</option>
    <option value="story">{cardLevelMeta.story.pluralLabel}</option>
    <option value="note">{cardLevelMeta.note.pluralLabel}</option>
  </select>;
}

function renderReleaseFilter(model: ReturnType<typeof useBoardToolbarState>) {
  const { filters, setFilters, snapshot } = model;
  return <select aria-label={strings.allReleases} value={filters.release} onChange={(event) => setFilters((value) => ({ ...value, release: event.target.value }))}>
    <option value="all">{strings.allReleases}</option>
    <option value="unscheduled">{strings.unscheduled}</option>
    {snapshot.releases.map((release) => <option key={release.id} value={encodeFilterValue(release.id)}>{release.name}</option>)}
  </select>;
}

function renderBoardFilters(model: ReturnType<typeof useBoardToolbarState>) {
  const { state, filters, setFilters, statusOptions, snapshot, colors } = model;
  return <div className="form-stack">
    {renderStatusFilters(model)}
    <div className="board-filter-row">
    {renderLevelFilter(model)}
    <select aria-label={strings.allPriorities} value={filters.priority} onChange={(event) => setFilters((value) => ({ ...value, priority: event.target.value as BoardFilters["priority"] }))}>
      <option value="all">{strings.allPriorities}</option>
      {CARD_PRIORITY_OPTIONS.map((priority) => <option value={priority} key={priority}>{strings.priorityValue(priority)}</option>)}
    </select>
    {renderReleaseFilter(model)}
    <select aria-label={strings.anySource} value={filters.source} onChange={(event) => setFilters((value) => ({ ...value, source: event.target.value as BoardFilters["source"] }))}>
      <option value="all">{strings.anySource}</option>
      <option value="linked">{strings.hasSource}</option>
      <option value="unlinked">{strings.noSource}</option>
    </select>
    {renderGitHubFilter(model)}
    <select aria-label={strings.anyEstimate} value={filters.estimate} onChange={(event) => setFilters((value) => ({ ...value, estimate: event.target.value as BoardFilters["estimate"] }))}>
      <option value="all">{strings.anyEstimate}</option>
      <option value="estimated">{strings.estimated}</option>
      <option value="unestimated">{strings.unestimated}</option>
    </select>
    {isPersonasEnabled ? <select aria-label={strings.anyPersona} value={filters.persona} onChange={(event) => setFilters((value) => ({ ...value, persona: event.target.value }))}>
      <option value="all">{strings.anyPersona}</option>
      <option value="none">{strings.noPersona}</option>
      {snapshot.personas.map((persona) => <option key={persona.id} value={encodeFilterValue(persona.id)}>{persona.name}</option>)}
    </select> : null}
    <select aria-label={strings.anyAnnotation} value={filters.annotation} onChange={(event) => setFilters((value) => ({ ...value, annotation: event.target.value }))}>
      <option value="all">{strings.anyAnnotation}</option>
      <option value="none">{strings.noAnnotation}</option>
      {snapshot.annotations.map((annotation) => <option key={annotation.id} value={encodeFilterValue(annotation.id)}>{annotation.name}</option>)}
    </select>
    <select aria-label={strings.colorCategory} value={filters.color} onChange={(event) => setFilters((value) => ({ ...value, color: event.target.value }))}>
      <option value="all">{strings.allColors}</option>
      {colors.map((color) => <option key={color} value={encodeFilterValue(color)}>{CARD_COLORS.find((category) => category.value === color)?.label ?? color}</option>)}
    </select>
    </div>
  </div>;
}

function renderStatusFilters({ filters, setFilters, snapshot }: ReturnType<typeof useBoardToolbarState>) {
  return <fieldset className="form-stack"><legend>{strings.allStatuses}</legend>
    <div className="button-row">
      <label>{statusStrings.selectionMode}<select aria-label={statusStrings.selectionMode} value={filters.statusMode} onChange={(event) => setFilters((value) => ({ ...value, statusMode: event.target.value as "include" | "exclude" }))}><option value="include">{statusStrings.include}</option><option value="exclude">{statusStrings.exclude}</option></select></label>
      <button type="button" className="secondary" onClick={() => setFilters((value) => ({ ...value, statuses: [] }))}>{statusStrings.clearStatuses}</button>
      <label className="checkbox-row"><input aria-label={statusStrings.hideCompleted} type="checkbox" checked={filters.hideCompleted} onChange={(event) => setFilters((value) => ({ ...value, hideCompleted: event.target.checked }))} />{statusStrings.hideCompleted}</label>
    </div>
    <p>{statusStrings.multiSelectHint}</p>
    <select multiple aria-label={strings.allStatuses} value={filters.statuses} onChange={(event) => { const statuses = Array.from(event.target.selectedOptions, (option) => option.value); setFilters((value) => ({ ...value, statuses })); }}>
      {statusFilterOptions(snapshot).map((status) => <option key={status.id} value={status.id}>{status.name}</option>)}
    </select>
  </fieldset>;
}

function renderBulkPatchFields(model: ReturnType<typeof useBoardToolbarState>) {
  const { pending, selectedIds, selectedVisibleCount, selectedCards, syncLocks, bulkPatch, setBulkPatch, statusOptions, snapshot, colors, annotationLocks, lockedPatch, submittedControl, runBulkUpdate, setDeleteIds, setGithubIds, setBulkSelectedIds } = model;
  return <fieldset disabled={pending} style={{ display: "contents" }}>
    <strong role="status">{strings.selectionSummary(selectedIds.size, selectedVisibleCount, selectedIds.size - selectedVisibleCount)}</strong>
    <details><summary>{strings.selectedTargets}</summary><ul>{selectedCards.map((card) => <li key={card.id}>{card.key} {card.title}</li>)}</ul></details>
    <select aria-label={strings.status} disabled={syncLocks.has("status") && !bulkPatch.status} title={model.fieldLockHint("status")} value={bulkPatch.status} onChange={(event) => { if (syncLocks.has("status") && event.target.value) return; setBulkPatch((value) => ({ ...value, status: event.target.value })); }}>
      <option value="">{strings.status}</option>
      {statusOptions.map((status) => <option key={status} value={status}>{status}</option>)}
    </select>
    <select aria-label={strings.release} disabled={syncLocks.has("milestone") && !bulkPatch.releaseId} title={syncLocks.has("milestone") ? syncConflictStrings.lock(syncConflictStrings.fields.milestone) : undefined} value={bulkPatch.releaseId} onChange={(event) => { if (syncLocks.has("milestone") && event.target.value) return; setBulkPatch((value) => ({ ...value, releaseId: event.target.value })); }}>
      <option value="">{strings.release}</option>
      <option value="__none">{strings.unscheduled}</option>
      {snapshot.releases.map((release) => <option key={release.id} value={encodeFilterValue(release.id)}>{release.name}</option>)}
    </select>
    <input inputMode="decimal" aria-label={strings.estimateLabel(snapshot.storyMap.estimationUnit)} placeholder={strings.estimateLabel(snapshot.storyMap.estimationUnit)} value={bulkPatch.estimate} onChange={(event) => setBulkPatch((value) => ({ ...value, estimate: event.target.value }))} />
    <select aria-label={strings.colorCategory} value={bulkPatch.color} onChange={(event) => setBulkPatch((value) => ({ ...value, color: event.target.value }))}>
      <option value="">{strings.colorCategory}</option>
      {colors.map((color) => <option key={color} value={color}>{CARD_COLORS.find((category) => category.value === color)?.label ?? color}</option>)}
    </select>
    {isPersonasEnabled ? <select aria-label={strings.addPersona} value={bulkPatch.addPersonaId} onChange={(event) => setBulkPatch((value) => ({ ...value, addPersonaId: event.target.value }))}>
      <option value="">{strings.addPersona}</option>
      {snapshot.personas.map((persona) => <option key={persona.id} value={persona.id}>{persona.name}</option>)}
    </select> : null}
    {isPersonasEnabled ? <select aria-label={strings.removePersona} value={bulkPatch.removePersonaId} onChange={(event) => setBulkPatch((value) => ({ ...value, removePersonaId: event.target.value }))}>
      <option value="">{strings.removePersona}</option>
      {snapshot.personas.map((persona) => <option key={persona.id} value={persona.id}>{persona.name}</option>)}
    </select> : null}
    <select aria-label={strings.addAnnotation} title={syncLocks.has("labels") ? syncConflictStrings.lock(syncConflictStrings.fields.labels) : undefined} value={bulkPatch.addAnnotationId} onChange={(event) => { if (annotationLocks.has(event.target.value)) return; setBulkPatch((value) => ({ ...value, addAnnotationId: event.target.value })); }}>
      <option value="">{strings.addAnnotation}</option>
      {snapshot.annotations.map((annotation) => <option key={annotation.id} value={annotation.id} disabled={annotationLocks.has(annotation.id)}>{annotation.name}</option>)}
    </select>
    <select aria-label={strings.removeAnnotation} title={syncLocks.has("labels") ? syncConflictStrings.lock(syncConflictStrings.fields.labels) : undefined} value={bulkPatch.removeAnnotationId} onChange={(event) => { if (annotationLocks.has(event.target.value)) return; setBulkPatch((value) => ({ ...value, removeAnnotationId: event.target.value })); }}>
      <option value="">{strings.removeAnnotation}</option>
      {snapshot.annotations.map((annotation) => <option key={annotation.id} value={annotation.id} disabled={annotationLocks.has(annotation.id)}>{annotation.name}</option>)}
    </select>
    <button type="button" disabled={lockedPatch} onClick={(event) => { if (lockedPatch) return; submittedControl.current = event.currentTarget; runBulkUpdate("patch"); }}>{strings.apply}</button>
    <button type="button" className="secondary" onClick={(event) => { submittedControl.current = event.currentTarget; runBulkUpdate("archive"); }}>{strings.archive}</button>
    <button type="button" className="danger" onClick={(event) => { event.currentTarget.focus(); setDeleteIds({ mapId: snapshot.storyMap.id, cards: selectedCards }); }}>{strings.deleteSelection}</button>
    <button type="button" className="secondary" onClick={(event) => { event.currentTarget.focus(); setGithubIds({ mapId: snapshot.storyMap.id, ids: [...selectedIds] }); }}>{strings.selectedGitHubDryRun}</button>
    <button type="button" className="secondary" onClick={() => setBulkSelectedIds(new Set())}>{strings.clearSelection}</button>
  </fieldset>;
}
