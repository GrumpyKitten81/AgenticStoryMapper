import { buildReleaseSummaryReport } from "@storymapper/core";
import type { Card, ExternalRef, Release, ChangeSetPreviewBoard } from "@storymapper/contracts";
import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { panelStrings } from "@storymapper/ui-strings";
import { useReleaseSummary } from "@storymapper/web/app/api";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { ReleaseEditor } from "@storymapper/web/features/releases/ReleaseEditor";
import { ReleaseNotes } from "@storymapper/web/features/releases/ReleaseNotes";
import { ReleaseSummary } from "@storymapper/web/features/releases/ReleaseSummary";

interface ReleasePanelProps {
  releases: Release[];
  cards: Card[];
  storyMapId?: string | undefined;
  externalRefs: ExternalRef[];
  estimationUnit?: string | undefined;
  preview?: boolean;
  previewReady?: boolean;
  previewMarkers?: ChangeSetPreviewBoard["markers"] | undefined;
  canonicalReleases?: Release[];
  matchingCardIds?: ReadonlySet<string> | undefined;
  sourceLinkedCardIds?: string[];
  githubLinkedCardIds?: string[];
}

export function ReleasePanel(props: ReleasePanelProps) {
  const revision = useLiveInteractionStore((state) => state.restoreRevision);
  return <ScopedReleasePanel key={`${props.storyMapId}:${revision}`} {...props} />;
}

function ScopedReleasePanel({ releases, cards, storyMapId, externalRefs, estimationUnit, preview = false, previewReady = false, previewMarkers = [], canonicalReleases = releases, matchingCardIds, sourceLinkedCardIds = [], githubLinkedCardIds = [] }: ReleasePanelProps) {
  const restorePending = useLiveInteractionStore((state) => state.restorePending);
  const [scope, setScope] = useState<string>("all");
  const [showAllChosen, setShowAll] = useState(false);
  const [editing, setEditing] = useState<string | null>(null);
  const showAll = showAllChosen || preview;
  const visibleReleases = releases.filter((release) => showAll || !release.released);
  const effectiveScope = scope === "all" || scope === "unscheduled" || visibleReleases.some((release) => release.id === scope) ? scope : "all";
  if (scope !== effectiveScope) setScope(effectiveScope);
  const releaseSummary = useReleaseSummary(preview || matchingCardIds ? undefined : storyMapId, effectiveScope === "all" ? undefined : effectiveScope, showAll);
  const projectedSummary = useMemo(() => (preview ? previewReady : matchingCardIds) ? buildReleaseSummaryReport({
    storyMapId: storyMapId ?? "", cards: cards.filter((card) => (!matchingCardIds || matchingCardIds.has(card.id)) && !previewMarkers.some((marker) => marker.entity === "card" && marker.kind === "removed" && marker.entityId === card.id && card.level === "story")), releases, sourceLinkedCardIds, githubLinkedCardIds, includeReleased: showAll,
    ...(effectiveScope === "unscheduled" ? { releaseId: null } : effectiveScope === "all" ? {} : { releaseId: effectiveScope })
  }) : undefined, [preview, previewReady, storyMapId, cards, releases, effectiveScope, showAll, previewMarkers, matchingCardIds, sourceLinkedCardIds, githubLinkedCardIds]);
  const summary = preview || matchingCardIds ? projectedSummary : releaseSummary.data;
  const selected = releases.find((release) => release.id === effectiveScope && release.storyMapId === storyMapId);
  const editedRelease = canonicalReleases.find((release) => release.id === editing && release.storyMapId === storyMapId);
  return (
    <section className="panel release-tracking-panel form-stack">
      <div className="panel-heading-row"><h2>{panelStrings.releaseTracking}</h2></div>
      <button type="button" disabled={!storyMapId || preview || restorePending} onClick={() => setEditing("new")}><Plus size={16} />{panelStrings.newRelease}</button>
      {restorePending ? <p role="status">{panelStrings.releaseRestorePending}</p> : null}
      <label className="checkbox-row"><input type="checkbox" checked={showAll} disabled={preview} onChange={(event) => setShowAll(event.target.checked)} />{panelStrings.showAllReleases}</label>
      <label>{panelStrings.scope}<select value={effectiveScope} onChange={(event) => setScope(event.target.value)}>
        <option value="all">{showAll ? panelStrings.allReleases : panelStrings.openReleases}</option>
        <option value="unscheduled">{panelStrings.unscheduled}</option>
        {visibleReleases.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}
      </select></label>
      {selected && !preview ? <ReleaseNotes key={`${storyMapId}:${effectiveScope}`} storyMapId={storyMapId!} releaseId={selected.id} /> : null}
      <div className="release-external-refs form-stack">
        {visibleReleases.map((release) => <div className="button-row" key={release.id}>
          <strong>{release.name}</strong>
          <span>{release.goal}</span>
          {release.startDate ? <span>{panelStrings.releaseDateValue(panelStrings.releaseStartDate, release.startDate)}</span> : null}
          {release.releaseDate ? <span>{panelStrings.releaseDateValue(panelStrings.releaseDate, release.releaseDate)}</span> : null}
          {release.released ? <span>{panelStrings.released}</span> : null}
          {externalRefs.filter((ref) => ref.entityType === "release" && ref.entityId === release.id).map((ref) => <span className="external-ref-badge" key={ref.id}>{panelStrings.externalRef(ref.system, ref.externalId)}</span>)}
          <button type="button" className="secondary" disabled={preview || !storyMapId || restorePending} onClick={() => setEditing(release.id)}>{panelStrings.editRelease(release.name)}</button>
        </div>)}
        {!visibleReleases.length ? <p>{panelStrings.noReleasesYet}</p> : null}
      </div>
      {!preview && releaseSummary.isFetching && summary ? <p role="status">{panelStrings.releaseSummaryRefreshing}</p> : null}
      {!preview && releaseSummary.error ? <div><p role="alert">{panelStrings.releaseSummaryUnavailable} {releaseSummary.error.message}</p><button type="button" className="secondary" disabled={releaseSummary.isFetching} onClick={() => { void releaseSummary.refetch(); }}>{panelStrings.retryReleaseSummary}</button></div>
        : summary ? <ReleaseSummary summary={summary} estimationUnit={estimationUnit} showRisks={!preview} />
        : storyMapId ? <p role="status">{panelStrings.releaseSummaryLoading}</p> : null}
      {storyMapId && editing && !restorePending && (editing === "new" || editedRelease) ? <ReleaseEditor key={editing} storyMapId={storyMapId} release={editedRelease} suspended={preview} onClose={() => setEditing(null)} /> : null}
    </section>
  );
}
