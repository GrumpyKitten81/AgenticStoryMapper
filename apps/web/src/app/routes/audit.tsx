import { useEffect, useState, type FormEvent } from "react";
import { useParams, useSearch } from "@tanstack/react-router";
import { activityQuerySchema, type ActorType } from "@storymapper/contracts";
import { auditStrings as strings, restorePointStrings } from "@storymapper/ui-strings";
import { ChangeSetHistoryReview } from "@storymapper/web/features/changesets/ChangeSetHistoryReview";
import { useActivity, useChangeSets } from "@storymapper/web/app/api";
import { useActiveStoryMapStore } from "@storymapper/web/app/stores/active-story-map-store";
import { RestorePointsPanel } from "@storymapper/web/features/restore-points/RestorePointsPanel";
import { PrivacyExportPanel } from "@storymapper/web/features/privacy/PrivacyExportPanel";
import { activityHistoryCopy as copy } from "@storymapper/web/ui-strings/activity-history";
import { ActivityEntry } from "@storymapper/web/features/activity/ActivityEntry";
import { ReportsPanel } from "@storymapper/web/features/reports/ReportsPanel";

export function AuditRoute() {
  const { projectId } = useParams({ strict: false }) as { projectId: string };
  const { restorePoint } = useSearch({ strict: false }) as { restorePoint?: string };
  const storyMapId = useActiveStoryMapStore((state) => state.activeStoryMapId);
  const [view, setView] = useState<"activity" | "restore-points">(restorePoint ? "restore-points" : "activity");
  useEffect(() => { if (restorePoint) setView("restore-points"); }, [restorePoint]);

  return (
    <section>
      <nav className="activity-tabs" aria-label={restorePointStrings.tabs}>
        <button type="button" className="secondary" aria-pressed={view === "activity"} onClick={() => setView("activity")}>{restorePointStrings.activityLog}</button>
        <button type="button" className="secondary" aria-pressed={view === "restore-points"} onClick={() => setView("restore-points")}>{restorePointStrings.title}</button>
      </nav>
      {view === "restore-points" ? <RestorePointsPanel key={projectId} projectId={projectId} requestedFileName={restorePoint} /> : <ActivityPanels projectId={projectId} storyMapId={storyMapId} />}
    </section>
  );
}

function ActivityPanels({ projectId, storyMapId }: { projectId: string; storyMapId: string | undefined }) {
  const [actorType, setActorType] = useState<ActorType | undefined>();
  const [toolName, setToolName] = useState("");
  const [invalidToolName, setInvalidToolName] = useState(false);
  const [filters, setFilters] = useState<{ actorType?: ActorType; toolName?: string; view: "changes" | "all" }>({ view: "changes" });
  const activity = useActivity(projectId, filters);
  const changeSets = useChangeSets(projectId);
  const events = activity.data?.pages.flatMap((page) => page.activityEvents) ?? [];
  const applyFilters = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const next = { view: filters.view, ...(actorType ? { actorType } : {}), ...(toolName.trim() ? { toolName: toolName.trim() } : {}) };
    const parsed = activityQuerySchema.safeParse(next);
    setInvalidToolName(!parsed.success);
    if (parsed.success) setFilters(next);
  };
  return (
    <section className="audit-grid">
      <section className="panel audit-panel">
        <h2>{restorePointStrings.activityLog}</h2>
        <form className="form-stack" onSubmit={applyFilters}>
          <label>{copy.show}<select aria-label={copy.viewLabel} value={filters.view} onChange={(event) => setFilters((current) => ({ ...current, view: event.target.value as "changes" | "all" }))}><option value="changes">{copy.changes}</option><option value="all">{copy.all}</option></select></label>
          <label>{strings.actorType}<select aria-label={strings.actorType} value={actorType ?? ""} onChange={(event) => setActorType(event.target.value ? event.target.value as ActorType : undefined)}>
            <option value="">{strings.allActors}</option>
            {Object.entries(strings.actors).map(([type, label]) => <option key={type} value={type}>{label}</option>)}
          </select></label>
          <label>{strings.toolName}<input value={toolName} aria-invalid={invalidToolName} aria-describedby={invalidToolName ? "audit-tool-filter-error" : undefined} onChange={(event) => setToolName(event.target.value)} /></label>
          {invalidToolName ? <p role="alert" id="audit-tool-filter-error">{strings.invalidToolName}</p> : null}
          <button type="submit" className="secondary">{strings.applyFilters}</button>
        </form>
        <p role="status">{activity.isFetching ? strings.loading : ""}</p>
        <div aria-busy={activity.isFetching}>
          {activity.isError ? <div role="alert"><p>{strings.error(activity.error.message)}</p><button type="button" className="secondary" disabled={activity.isFetching} onClick={() => { if (activity.isFetchNextPageError) void activity.fetchNextPage(); else void activity.refetch(); }}>{strings.retry}</button></div> : null}
          {!activity.isPending && !activity.isError && events.length === 0 ? <p>{strings.empty}</p> : null}
          <ol className="activity-event-list" aria-label={strings.events}>{events.map((event) => <ActivityEntry key={event.id} event={event} />)}</ol>
          {activity.hasNextPage && !activity.isFetchNextPageError ? <button type="button" className="secondary" disabled={activity.isFetching} onClick={() => void activity.fetchNextPage()}>{strings.loadMore}</button> : null}
        </div>
      </section>
      <section className="panel form-stack"><h2>{copy.history}</h2>{(changeSets.data?.changeSets ?? []).map((changeSet) => <ChangeSetHistoryReview key={changeSet.id} id={changeSet.id} title={changeSet.title} />)}</section>
      <PrivacyExportPanel projectId={projectId} storyMapId={storyMapId} />
      <ReportsPanel projectId={projectId} storyMapId={storyMapId} />
    </section>
  );
}
