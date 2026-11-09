import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { epicContextSchema, type EpicContext, type StoryMap } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { Dialog } from "@storymapper/web/components/Dialog";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { mapConceptStrings as strings } from "@storymapper/web/ui-strings/map-concepts";

export function EpicContextPanel({ map, disabled, actionOnly = false }: { map: StoryMap; disabled: boolean; actionOnly?: boolean }) {
  const [editing, setEditing] = useState(false);
  const context = map.epicContext;
  return <>
    {context && !actionOnly ? <details className="source-chunk" aria-label={strings.context}>
      <summary>{strings.fieldValue(strings.context, context.title)}</summary>
      <div className="button-row"><button type="button" className="secondary" disabled={disabled} onClick={() => setEditing(true)}>{strings.editContext}</button></div>
      <p>{context.goal}</p>
      {context.githubIssueUrl ? <p><a href={context.githubIssueUrl} target="_blank" rel="noreferrer">{context.githubIssueUrl}</a></p> : null}
    </details> : null}
    {editing ? <EpicContextEditor map={map} disabled={disabled} onClose={() => setEditing(false)} /> : null}
    {actionOnly ? <button type="button" className="secondary" disabled={disabled} onClick={() => setEditing(true)}>{context ? strings.editContext : strings.addContext}</button> : null}
  </>;
}

function EpicContextEditor({ map, disabled, onClose }: { map: StoryMap; disabled: boolean; onClose: () => void }) {
  const client = useQueryClient();
  const [baseVersion] = useState(map.version);
  const [reviewedEpoch] = useState(useLiveInteractionStore.getState().epoch);
  const epoch = useLiveInteractionStore((state) => state.epoch);
  const [title, setTitle] = useState(map.epicContext?.title ?? "");
  const [goal, setGoal] = useState(map.epicContext?.goal ?? "");
  const [url, setUrl] = useState(map.epicContext?.githubIssueUrl ?? "");
  const restorePending = useLiveInteractionStore((state) => state.restorePending);
  const parsed = epicContextSchema.safeParse({ title, goal, ...(url ? { githubIssueUrl: url } : {}) });
  const save = useMutation({ mutationFn: (epicContext: EpicContext | null) => {
    if (reviewedEpoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending) throw new Error(strings.restoredDraft);
    return api.updateStoryMap(map.id, { epicContext }, baseVersion);
  }, onSuccess: async () => {
    if (reviewedEpoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending) return;
    await Promise.all([client.invalidateQueries({ queryKey: ["story-map", map.id] }), client.invalidateQueries({ queryKey: ["story-maps"] }), client.invalidateQueries({ queryKey: ["activity"] })]);
    if (reviewedEpoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending) return;
    onClose();
  } });
  const restored = reviewedEpoch !== epoch;
  const pending = save.isPending || disabled || restorePending || restored;
  return <Dialog title={strings.editContext} onClose={() => { if (!save.isPending) onClose(); }}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); if (!pending && parsed.success) save.mutate(parsed.data); }}>
      <p>{strings.localOnly}</p>
      <label>{strings.title}<input required disabled={pending} value={title} onChange={(event) => setTitle(event.target.value)} /></label>
      <label>{strings.goal}<textarea required disabled={pending} value={goal} onChange={(event) => setGoal(event.target.value)} /></label>
      <label>{strings.reference}<input type="url" disabled={pending} value={url} onChange={(event) => setUrl(event.target.value)} /></label>
      {!parsed.success ? <p role="status">{parsed.error.issues[0]?.message}</p> : null}
      {save.error || restored ? <p role="alert">{restored ? strings.restoredDraft : save.error?.message} <button type="button" className="secondary" onClick={() => { void client.invalidateQueries({ queryKey: ["story-map", map.id] }); onClose(); }}>{strings.reload}</button></p> : null}
      <div className="button-row"><button type="submit" disabled={pending || !parsed.success}>{strings.save}</button>{map.epicContext ? <button type="button" className="secondary" disabled={pending} onClick={() => save.mutate(null)}>{strings.remove}</button> : null}<button type="button" className="secondary" disabled={save.isPending} onClick={onClose}>{strings.cancel}</button></div>
    </form>
  </Dialog>;
}
