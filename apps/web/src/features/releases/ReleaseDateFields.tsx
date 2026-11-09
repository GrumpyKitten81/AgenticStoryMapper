import { useReleaseSyncFieldLocks } from "@storymapper/web/features/github-sync";
import { syncConflictStrings } from "@storymapper/web/ui-strings/sync-conflicts";
import { releaseSchema, type Release, type UpdateReleaseRequest } from "@storymapper/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { panelStrings } from "@storymapper/ui-strings";
import { api } from "@storymapper/web/app/api";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { conflictFor, isConflictError } from "@storymapper/web/app/conflicts";
import { ConflictAlert } from "@storymapper/web/features/conflicts";
import { mergeSavedDraft } from "@storymapper/web/features/conflicts";
import { invalidateReleaseViews } from "@storymapper/web/features/releases/release-utils";

type Dates = Pick<Release, "startDate" | "releaseDate">;

const datesOf = ({ startDate, releaseDate }: Release): Dates => ({ startDate, releaseDate });

export function ReleaseDateFields({ release, storyMapId }: { release: Release; storyMapId?: string | undefined }) {
  const revision = useLiveInteractionStore((state) => state.restoreRevision);
  const restorePending = useLiveInteractionStore((state) => state.restorePending);
  return <ScopedReleaseDateFields key={`${release.id}:${revision}:${restorePending}`} release={release} storyMapId={storyMapId} />;
}

function ScopedReleaseDateFields(props: { release: Release; storyMapId?: string | undefined }) {
  return renderScopedReleaseDateFields(useScopedReleaseDateFieldsState(props));
}

function useScopedReleaseDateFieldsState({ release, storyMapId }: { release: Release; storyMapId?: string | undefined }) {
  const queryClient = useQueryClient();
  const syncLocks = useReleaseSyncFieldLocks(release.id);
  const restorePending = useLiveInteractionStore((state) => state.restorePending);
  const [dates, setDates] = useState(datesOf(release));
  const datesRef = useRef(dates);
  datesRef.current = dates;
  const baseline = useRef(datesOf(release));
  const baseVersion = useRef(release.version);
  const admitted = useRef(false);
  useEffect(() => {
    const dirty = JSON.stringify(datesRef.current) !== JSON.stringify(baseline.current);
    if (dirty || admitted.current || release.version < baseVersion.current) return;
    baseline.current = datesOf(release);
    baseVersion.current = Math.max(baseVersion.current, release.version);
    setDates(datesOf(release));
  }, [release]);
  const update = useMutation({
    scope: { id: `release:${release.id}` },
    meta: { ownsConflict: true },
    mutationFn: (input: { dates: Dates; baseline: Dates; patch: UpdateReleaseRequest }) => api.updateRelease(release.id, input.patch, baseVersion.current),
    onSuccess: (saved, submitted) => {
      baseVersion.current = saved.version;
      baseline.current = datesOf(saved);
      setDates((value) => mergeSavedDraft(value, submitted.dates, submitted.baseline, datesOf(saved), submitted.patch));
      invalidateReleaseViews(queryClient, storyMapId);
    },
    onError: () => { void invalidateReleaseViews(queryClient, storyMapId); },
    onSettled: () => { admitted.current = false; }
  });
  const change = (patch: Partial<Dates>) => {
    if (admitted.current || Boolean(conflictFor(update.error, release.id)) || restorePending || Object.keys(patch).some((field) => syncLocks.has(field as keyof Dates))) return;
    admitted.current = true;
    const next = { ...datesRef.current, ...patch };
    setDates(next);
    update.mutate({ dates: next, baseline: { ...baseline.current }, patch: editableDates(next) });
  };

  const editableDates = (value: Dates): UpdateReleaseRequest => Object.fromEntries(Object.entries(value).filter(([field]) => !syncLocks.has(field as keyof Dates)));
  return { restorePending, update, dates, baseline, release, baseVersion, setDates, queryClient, storyMapId, admitted, datesRef, editableDates, syncLocks, change };
}

function renderScopedReleaseDateFields({ restorePending, update, dates, baseline, release, baseVersion, setDates, queryClient, storyMapId, admitted, datesRef, editableDates, syncLocks, change }: ReturnType<typeof useScopedReleaseDateFieldsState>) {
  return (
    <>
      {!restorePending && (update.isPending || JSON.stringify(dates) !== JSON.stringify(baseline.current)) ? <span hidden data-live-suspended-draft /> : null}
      {restorePending ? <p role="status">{panelStrings.releaseRestorePending}</p> : null}
      <ConflictAlert
        error={update.error}
        entityId={release.id}
        includeDependentSync
        name={release.name}
        disabled={update.isPending || restorePending}
        onReload={(conflict) => {
          const current = releaseSchema.parse(conflict.current);
          baseline.current = datesOf(current);
          baseVersion.current = conflict.currentVersion;
          setDates(datesOf(current));
          update.reset();
          invalidateReleaseViews(queryClient, storyMapId);
        }}
        onKeepMine={(conflict) => {
          if (admitted.current || restorePending) return;
          admitted.current = true;
          baseVersion.current = conflict.currentVersion;
          update.reset();
          update.mutate({ dates: datesRef.current, baseline: { ...baseline.current }, patch: editableDates(datesRef.current) });
        }}
      />
      {update.error && !isConflictError(update.error) ? <p role="alert">{update.error.message}</p> : null}
      {[...syncLocks].map((field) => <p key={field}>{syncConflictStrings.lock(syncConflictStrings.releaseFields[field])}</p>)}
      <div className="release-date-fields">
        <input type="date" disabled={syncLocks.has("startDate") || update.isPending || Boolean(conflictFor(update.error, release.id)) || restorePending} value={dates.startDate ?? ""} aria-label={panelStrings.startDateLabel(release.name)} onChange={(event) => change({ startDate: event.target.value || null })} />
        <input type="date" disabled={syncLocks.has("releaseDate") || update.isPending || Boolean(conflictFor(update.error, release.id)) || restorePending} value={dates.releaseDate ?? ""} aria-label={panelStrings.releaseDateLabel(release.name)} onChange={(event) => change({ releaseDate: event.target.value || null })} />
      </div>
    </>
  );
}
