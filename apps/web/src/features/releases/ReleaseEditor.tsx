import { useReleaseSyncFieldLocks } from "@storymapper/web/features/github-sync";
import { syncConflictStrings } from "@storymapper/web/ui-strings/sync-conflicts";
import { releaseSchema, updateReleaseRequestSchema, type Release } from "@storymapper/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";
import { panelStrings as strings } from "@storymapper/ui-strings";
import { api } from "@storymapper/web/app/api";
import { conflictFor, isConflictError } from "@storymapper/web/app/conflicts";
import { useAnnouncementStore } from "@storymapper/web/app/stores/announcement-store";
import { Dialog } from "@storymapper/web/components/Dialog";
import { ConflictAlert } from "@storymapper/web/features/conflicts";
import { mergeSavedDraft } from "@storymapper/web/features/conflicts";
import { invalidateReleaseViews } from "@storymapper/web/features/releases/release-utils";

type ReleaseDraft = Pick<Release, "name" | "goal" | "startDate" | "releaseDate" | "released">;
const fieldsOf = ({ name, goal, startDate, releaseDate, released }: Release): ReleaseDraft => ({ name, goal, startDate, releaseDate, released });
const emptyDraft: ReleaseDraft = { name: "", goal: "", startDate: null, releaseDate: null, released: false };

export function ReleaseEditor(props: ReleaseEditorProps) {
  const result = useReleaseEditorState(props);
  if (result === null || !("release" in result)) return result;
  return renderReleaseEditor(result);
}

function useReleaseEditorState(props: ReleaseEditorProps) {
  const context = useReleaseDraft(props);
  const { release, storyMapId, suspended, onClose, queryClient, syncLocks, draft, setDraft, setValidation, setConfirmDiscard, baseline, baseVersion, admitted, dirty, editableDirty } = context;
  const save = useMutation({
    scope: { id: `release:${release?.id ?? storyMapId}` },
    meta: { ownsConflict: true },
    mutationFn: (input: { fields: ReleaseDraft; draft: ReleaseDraft; baseline: ReleaseDraft; patch: Partial<ReleaseDraft> }) => release
      ? api.updateRelease(release.id, input.patch, baseVersion.current!)
      : api.createRelease({ storyMapId, ...input.fields }),
    onSuccess: (saved, submitted) => {
      baseVersion.current = saved.version;
      baseline.current = fieldsOf(saved);
      setDraft((value) => mergeSavedDraft(value, submitted.draft, submitted.baseline, fieldsOf(saved), submitted.patch));
      useAnnouncementStore.getState().announce(strings.releaseSaved, "status");
      void invalidateReleaseViews(queryClient, storyMapId);
      if (!release) onClose();
    },
    onError: () => { void invalidateReleaseViews(queryClient, storyMapId); },
    onSettled: () => { admitted.current = false; }
  });
  function submit() {
    if (admitted.current || suspended || !editableDirty) return;
    const fields = { ...draft, name: draft.name.trim() };
    const patch = Object.fromEntries(Object.entries(fields).filter(([field]) => !syncLocks.has(field as keyof ReleaseDraft))) as Partial<ReleaseDraft>;
    const parsed = updateReleaseRequestSchema.safeParse(patch);
    if (!parsed.success) { setValidation(parsed.error.issues.map((issue) => issue.message).join(" ")); return; }
    setValidation("");
    admitted.current = true;
    save.mutate({ fields, draft: { ...draft }, baseline: { ...baseline.current }, patch });
  }
  function close() {
    if (admitted.current) return;
    if (dirty) setConfirmDiscard(true);
    else onClose();
  }
  if (suspended) return dirty || save.isPending ? <span hidden data-live-suspended-draft /> : null;
  return { ...context, close, save, submit };
}

function renderReleaseEditor({ release, onClose, close, save, submit, baseline, baseVersion, setDraft, queryClient, storyMapId, validation, syncLocks, draft, editableDirty, confirmDiscard, setConfirmDiscard }: Exclude<ReturnType<typeof useReleaseEditorState>, import("react").ReactElement | null>) {
  return <Dialog title={release ? strings.editRelease(release.name) : strings.newRelease} onClose={close} dismissible={!save.isPending}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); submit(); }}>
      {release ? <ConflictAlert error={save.error} entityId={release.id} includeDependentSync name={release.name} disabled={save.isPending}
        onReload={(conflict) => {
          const current = releaseSchema.parse(conflict.current);
          baseline.current = fieldsOf(current);
          baseVersion.current = conflict.currentVersion;
          setDraft(fieldsOf(current));
          save.reset();
          void invalidateReleaseViews(queryClient, storyMapId);
        }}
        onKeepMine={(conflict) => { baseVersion.current = conflict.currentVersion; save.reset(); submit(); }} /> : null}
      {validation ? <p role="alert">{validation}</p> : null}
      {save.error && !isConflictError(save.error) ? <p role="alert">{save.error.message}</p> : null}
      {[...syncLocks].map((field) => <p key={field}>{syncConflictStrings.lock(syncConflictStrings.releaseFields[field])}</p>)}
      <fieldset className="form-stack" disabled={save.isPending}>
        <label>{strings.releaseName}<input disabled={syncLocks.has("name")} aria-label={strings.releaseName} value={draft.name} required onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
        <label>{strings.releaseGoal}<textarea disabled={syncLocks.has("goal")} aria-label={strings.releaseGoal} value={draft.goal} onChange={(event) => setDraft({ ...draft, goal: event.target.value })} /></label>
        <label>{strings.releaseStartDate}<input disabled={syncLocks.has("startDate")} aria-label={strings.releaseStartDate} type="date" value={draft.startDate ?? ""} onChange={(event) => setDraft({ ...draft, startDate: event.target.value || null })} /></label>
        <label>{strings.releaseDate}<input disabled={syncLocks.has("releaseDate")} aria-label={strings.releaseDate} type="date" value={draft.releaseDate ?? ""} onChange={(event) => setDraft({ ...draft, releaseDate: event.target.value || null })} /></label>
        <label className="checkbox-row"><input disabled={syncLocks.has("released")} type="checkbox" checked={draft.released} onChange={(event) => setDraft({ ...draft, released: event.target.checked })} />{strings.released}</label>
      </fieldset>
      {save.isPending ? <p role="status">{strings.releaseSaving}</p> : null}
      <div className="button-row">
        <button type="submit" disabled={save.isPending || !editableDirty || Boolean(release && conflictFor(save.error, release.id))}>{strings.save}</button>
        <button type="button" className="secondary" disabled={save.isPending} onClick={close}>{strings.cancel}</button>
      </div>
    </form>
    {confirmDiscard ? <Dialog title={strings.discardReleaseDraft} alert onClose={() => setConfirmDiscard(false)}>
      <div className="button-row">
        <button type="button" className="secondary" data-dialog-cancel onClick={() => setConfirmDiscard(false)}>{strings.cancel}</button>
        <button type="button" className="danger" onClick={onClose}>{strings.discard}</button>
      </div>
    </Dialog> : null}
  </Dialog>;
}

function useReleaseDraft({ release, storyMapId, suspended = false, onClose }: ReleaseEditorProps) {
  const queryClient = useQueryClient();
  const syncLocks = useReleaseSyncFieldLocks(release?.id);
  const [draft, setDraft] = useState<ReleaseDraft>(() => release ? fieldsOf(release) : emptyDraft);
  const [validation, setValidation] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const baseline = useRef(draft);
  const baseVersion = useRef(release?.version);
  const admitted = useRef(false);
  const dirty = JSON.stringify(draft) !== JSON.stringify(baseline.current);
  const editableDirty = Object.entries(draft).some(([field, value]) => !syncLocks.has(field as keyof ReleaseDraft) && value !== baseline.current[field as keyof ReleaseDraft]);
  const dirtyRef = useRef(dirty);
  dirtyRef.current = dirty;
  useEffect(() => {
    if (!release || dirtyRef.current || admitted.current || release.version < (baseVersion.current ?? 0)) return;
    baseline.current = fieldsOf(release);
    baseVersion.current = release.version;
    setDraft(fieldsOf(release));
  }, [release]);
  return { release, storyMapId, suspended, onClose, queryClient, syncLocks, draft, setDraft, validation, setValidation, confirmDiscard, setConfirmDiscard, baseline, baseVersion, admitted, dirty, editableDirty };
}

interface ReleaseEditorProps { release?: Release | undefined; storyMapId: string; suspended?: boolean; onClose: () => void }
