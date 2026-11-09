import { useEffect, useRef, useState } from "react";
import { useIsMutating, useMutation, useQueryClient } from "@tanstack/react-query";
import type { RestorePoint } from "@storymapper/contracts";
import { restorePointStrings as strings } from "@storymapper/ui-strings";
import { api, RestoreRejectedError, useRestorePoints } from "@storymapper/web/app/api";
import { formatLocalDateTime } from "@storymapper/web/app/format-date-time";
import { useAnnouncementStore } from "@storymapper/web/app/stores/announcement-store";
import { Dialog } from "@storymapper/web/components/Dialog";
import { clearRestoreAttempt, prepareRestoreAttempt, reloadRestoredApp, RESTORE_PROJECT_KEY, RestoreAttemptStorageError, saveRestoreResult } from "@storymapper/web/features/restore-points/restore-result";
import { RestorePointDetails } from "@storymapper/web/features/restore-points/RestorePointDetails";
import { formatRestorePointSize, restorePointCause, restorePointLabel, restorePointPresentation as presentation } from "@storymapper/web/features/restore-points/restore-point-presentation";

const CREATE_RESTORE_POINT_KEY = ["create-restore-point"] as const;

export function RestorePointsPanel(props: RestorePointsPanelProps) {
  return renderRestorePointsPanel(useRestorePointsPanelState(props));
}

function useRestorePointsPanelState(props: RestorePointsPanelProps) {
  const context = useRestorePointMutation(props);
  const { projectId, points, queryClient, announce, creating, restoreOpener, selected, restorePending, restore } = context;
  const create = useMutation({
    mutationKey: CREATE_RESTORE_POINT_KEY,
    mutationFn: () => api.createRestorePoint(projectId),
    onSuccess: () => announce(strings.created, "status"),
    onError: (error) => announce(strings.createFailed(error.message), "alert"),
    onSettled: async () => {
      try {
        await queryClient.invalidateQueries({ queryKey: ["restore-points"] });
      } finally {
        creating.current = false;
      }
    }
  });
  function createPoint() {
    if (creating.current || queryClient.isMutating({ mutationKey: CREATE_RESTORE_POINT_KEY })) return;
    creating.current = true;
    create.mutate();
  }
  useEffect(() => {
    if (points.error) announce(strings.listFailed(points.error.message), "alert");
  }, [points.error, announce]);
  useEffect(() => {
    if (!restorePending && restore.isError && !selected) restoreOpener.current?.focus();
  }, [restorePending, restore.isError, selected]);
  return { ...context, createPoint };
}

function renderRestorePointsPanel({ requestedFileName, points, pending, restorePending, createPoint, rows, restoreOpener, setSelected, selected, restoring, confirmRestore }: ReturnType<typeof useRestorePointsPanelState>) {
  return (
    <section className="panel" aria-labelledby="restore-points-heading">
      <h2 id="restore-points-heading">{strings.title}</h2>
      <p>{strings.scope}</p>
      {requestedFileName ? <RequestedRestorePoint fileName={requestedFileName} points={points.data?.restorePoints} /> : null}
      <button type="button" disabled={pending || restorePending} onClick={createPoint}>
        {pending ? strings.creating : strings.create}
      </button>
      {points.isPending ? <p>{strings.loading}</p> : null}
      {points.data?.restorePoints.length === 0 ? <p>{strings.empty}</p> : null}
      <ul className="restore-point-list" aria-label={strings.list}>
        {(points.data?.restorePoints ?? []).map((point) => <RestorePointRow key={point.fileName} rowRef={(row) => { if (row) rows.current.set(point.fileName, row); else rows.current.delete(point.fileName); }} point={point} disabled={pending || restorePending} onRestore={(opener) => { restoreOpener.current = opener; setSelected(point); }} />)}
      </ul>
      {selected && !restorePending ? <Dialog
        title={strings.confirmTitle}
        description={strings.confirmDescription}
        alert
        onClose={() => { if (!restoring.current) setSelected(undefined); }}
      >
        <p>{restorePointLabel(selected)}</p>
        <RestorePointDetails point={selected} />
        <div className="button-row">
          <button type="button" className="secondary" data-dialog-cancel onClick={() => setSelected(undefined)}>{strings.cancel}</button>
          <button type="button" className="danger" onClick={confirmRestore}>{strings.confirmRestore}</button>
        </div>
      </Dialog> : null}
    </section>
  );
}

function RestorePointRow({ point, disabled, onRestore, rowRef }: { rowRef: (row: HTMLLIElement | null) => void; point: RestorePoint; disabled: boolean; onRestore: (opener: HTMLButtonElement) => void }) {
  return (
    <li ref={rowRef} tabIndex={0} data-restore-point={point.fileName}>
      <div className="restore-point-summary">
        <strong>{restorePointCause(point.class)}</strong>
        <dl>
          <dt>{presentation.createdLocal}</dt><dd><time dateTime={point.createdAt}>{formatLocalDateTime(point.createdAt)}</time></dd>
          <dt>{presentation.size}</dt><dd>{formatRestorePointSize(point.sizeBytes)}</dd>
        </dl>
        <RestorePointDetails point={point} />
      </div>
      <button type="button" className="secondary" disabled={disabled} aria-label={presentation.restoreLabel(point)} onClick={(event) => onRestore(event.currentTarget)}>{strings.restore}</button>
    </li>
  );
}

function RequestedRestorePoint({ fileName, points }: { fileName: string; points: RestorePoint[] | undefined }) {
  const selected = points?.some((point) => point.fileName === fileName);
  return <div className="restore-point-selection">
    <p role={points && !selected ? "alert" : "status"}>{points ? selected ? presentation.requestedPoint : presentation.requestedUnavailable : presentation.requestedLoading}</p>
    <details>
      <summary>{presentation.technicalDetails}</summary>
      <dl><dt>{presentation.fileName}</dt><dd>{fileName}</dd></dl>
    </details>
  </div>;
}

function useRestorePointsSelection({ projectId, requestedFileName }: RestorePointsPanelProps) {
  const points = useRestorePoints(projectId);
  const rows = useRef(new Map<string, HTMLLIElement>());
  const focusedPoint = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!requestedFileName || focusedPoint.current === requestedFileName) return;
    const row = rows.current.get(requestedFileName);
    if (row) { row.focus(); focusedPoint.current = requestedFileName; }
  }, [requestedFileName, points.data]);
  const queryClient = useQueryClient();
  const announce = useAnnouncementStore((state) => state.announce);
  const creating = useRef(false);
  const restoring = useRef(false);
  const restoreOpener = useRef<HTMLButtonElement | null>(null);
  const [selected, setSelected] = useState<RestorePoint>();
  const [reloading, setReloading] = useState(false);
  const pending = useIsMutating({ mutationKey: CREATE_RESTORE_POINT_KEY }) > 0;
  const restorePending = useIsMutating({ mutationKey: RESTORE_PROJECT_KEY }) > 0 || reloading;
  return { projectId, requestedFileName, points, rows, queryClient, announce, creating, restoring, restoreOpener, selected, setSelected, setReloading, pending, restorePending };
}

interface RestorePointsPanelProps { projectId: string; requestedFileName?: string | undefined }

function useRestorePointMutation(props: RestorePointsPanelProps) {
  const context = useRestorePointsSelection(props);
  const { projectId, queryClient, announce, restoring, selected, setSelected, setReloading } = context;
  const restore = useMutation({
    mutationKey: RESTORE_PROJECT_KEY,
    mutationFn: async (point: RestorePoint) => {
      await prepareRestoreAttempt(projectId, point.fileName);
      return api.restoreProject(projectId, point.fileName);
    },
    onSuccess: (result) => {
      setReloading(true);
      try { saveRestoreResult(result); }
      catch (error) {
        if (!(error instanceof DOMException)) throw error;
        announce(strings.resultStorageFailed(error.message), "alert");
      } finally { reloadRestoredApp(); }
    },
    onError: (error) => {
      if (!(error instanceof RestoreRejectedError || error instanceof RestoreAttemptStorageError)) {
        setReloading(true);
        announce(strings.unknownResponse(error.message), "alert");
        reloadRestoredApp();
        return;
      }
      try { clearRestoreAttempt(); }
      catch (storageError) {
        if (!(storageError instanceof DOMException)) throw storageError;
        announce(strings.savedDataIssue(storageError.message), "alert");
      }
      restoring.current = false;
      setSelected(undefined);
      announce(error instanceof RestoreAttemptStorageError ? strings.attemptStorageFailed(error.message) : strings.restoreFailed(error.message), "alert");
    }
  });
  function confirmRestore() {
    if (!selected || restoring.current || queryClient.isMutating({ mutationKey: RESTORE_PROJECT_KEY })) return;
    restoring.current = true;
    restore.mutate(selected);
  }
  return { ...context, restore, confirmRestore };
}
