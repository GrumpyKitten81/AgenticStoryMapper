import { storyMapSchema, updateStoryMapRequestSchema, type StoryMap } from "@storymapper/contracts";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { KeyRound } from "lucide-react";
import { appStrings as strings } from "@storymapper/ui-strings";
import { api } from "@storymapper/web/app/api";
import { isConflictError } from "@storymapper/web/app/conflicts";
import { Dialog } from "@storymapper/web/components/Dialog";
import { ConflictAlert } from "@storymapper/web/features/conflicts/ConflictAlert";

interface PrefixDraft {
  map: StoryMap;
  prefix: string;
  baseVersion: number;
}

export function CardKeyPrefixEditor({ storyMap, readOnly = false }: { storyMap: StoryMap | undefined; readOnly?: boolean }) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<PrefixDraft>();
  const pending = useRef(false);
  const save = useMutation({
    meta: { ownsConflict: true },
    mutationFn: (input: PrefixDraft) => api.updateStoryMap(input.map.id, { cardKeyPrefix: input.prefix.trim() }, input.baseVersion),
    onSuccess: (_saved, input) => {
      client.invalidateQueries({ queryKey: ["story-map", input.map.id] });
      client.invalidateQueries({ queryKey: ["card-reviews", input.map.projectId] });
      client.invalidateQueries({ queryKey: ["story-maps", input.map.projectId] });
      setDraft(undefined);
    },
    onSettled: () => { pending.current = false; }
  });
  function submit(input: PrefixDraft) {
    if (readOnly || pending.current || !updateStoryMapRequestSchema.safeParse({ cardKeyPrefix: input.prefix }).success) return;
    pending.current = true;
    save.mutate(input);
  }
  const valid = draft && updateStoryMapRequestSchema.safeParse({ cardKeyPrefix: draft.prefix }).success;
  return <>
    {storyMap ? <button type="button" className="secondary icon-button topbar-title-edit" aria-label={strings.editCardKeyPrefix} title={strings.editCardKeyPrefix} disabled={readOnly} onClick={() => {
      save.reset();
      setDraft({ map: storyMap, prefix: storyMap.cardKeyPrefix, baseVersion: storyMap.version });
    }}><KeyRound size={16} /></button> : null}
    {draft ? <Dialog title={strings.editCardKeyPrefix} description={strings.cardKeyPrefixDescription(draft.map.name)} dismissible={!save.isPending} onClose={() => { if (!pending.current) setDraft(undefined); }}>
      <form aria-busy={save.isPending} onSubmit={(event) => { event.preventDefault(); if (!isConflictError(save.error)) submit(draft); }}>
        <label>{strings.cardKeyPrefix}<input value={draft.prefix} disabled={readOnly || save.isPending} onChange={(event) => setDraft({ ...draft, prefix: event.target.value })} /></label>
        <ConflictAlert error={save.error} entityId={draft.map.id} name={draft.map.name} disabled={readOnly || save.isPending}
          onReload={(conflict) => {
            const current = storyMapSchema.parse(conflict.current);
            setDraft({ map: current, prefix: current.cardKeyPrefix, baseVersion: conflict.currentVersion });
            save.reset();
          }}
          onKeepMine={(conflict) => {
            const next = { ...draft, baseVersion: conflict.currentVersion };
            setDraft(next);
            save.reset();
            submit(next);
          }} />
        {save.error && !isConflictError(save.error) ? <p role="alert">{save.error.message}</p> : null}
        <button type="button" className="secondary" disabled={save.isPending} onClick={() => setDraft(undefined)}>{strings.close}</button>
        <button type="submit" disabled={readOnly || save.isPending || !valid || isConflictError(save.error)}>{strings.saveCardKeyPrefix}</button>
      </form>
    </Dialog> : null}
  </>;
}
