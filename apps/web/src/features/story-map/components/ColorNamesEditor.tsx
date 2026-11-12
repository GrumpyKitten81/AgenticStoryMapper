import { useEffect, useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { colorCategoryNamesSchema, type ColorCategoryNames, type StoryMap } from "@storymapper/contracts";
import { api } from "@storymapper/web/app/api";
import { useAnnouncementStore } from "@storymapper/web/app/stores/announcement-store";
import { useLiveInteractionStore } from "@storymapper/web/app/live/live-interaction-store";
import { CARD_COLORS } from "@storymapper/web/features/story-map/card-visual-options";
import { colorNameStrings as strings } from "@storymapper/web/ui-strings/color-names";

export function ColorNamesEditor(props: { map: StoryMap; titleId: string; onClose: () => void }) {
  const model = useColorNamesEditor(props);
  const { draft, setDraft, pending, parsed, changed, restored, save, reload } = model;
  return <form className="form-stack" onSubmit={(event) => { event.preventDefault(); if (!pending && parsed.success && changed) save.mutate(parsed.data); }}>
    <h2 id={props.titleId}>{strings.title}</h2><p>{strings.hint}</p>
    <div className="color-names-fields">{CARD_COLORS.map(({ label, value }) => <div className="color-name-row" key={value}>
      <label><span><span className="color-name-swatch" style={{ background: value }} aria-hidden="true" />{label}</span>
        <input required maxLength={60} disabled={pending} value={draft[value] ?? label} onChange={(event) => setDraft((current) => ({ ...current, [value]: event.target.value }))} />
      </label>
      <button type="button" className="secondary" aria-label={strings.resetName(label)} disabled={pending || draft[value] === undefined} onClick={() => setDraft((current) => {
        const { [value]: _, ...remaining } = current; return remaining;
      })}>{strings.reset}</button>
    </div>)}</div>
    {!parsed.success ? <p role="status">{strings.invalid}</p> : null}
    {save.error || restored ? <p role="alert">{restored ? strings.restored : save.error?.message} <button type="button" className="secondary" disabled={save.isPending} onClick={reload}>{strings.reload}</button></p> : null}
    <div className="button-row"><button type="submit" disabled={pending || !parsed.success || !changed}>{strings.save}</button><button type="button" className="secondary" disabled={save.isPending} onClick={props.onClose}>{strings.cancel}</button></div>
  </form>;
}

function useColorNamesEditor({ map, onClose }: { map: StoryMap; onClose: () => void }) {
  const client = useQueryClient();
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const [draft, setDraft] = useState<ColorCategoryNames>(map.colorCategoryNames ?? {});
  const [baseVersion] = useState(map.version);
  const [reviewedEpoch] = useState(useLiveInteractionStore.getState().epoch);
  const epoch = useLiveInteractionStore((state) => state.epoch);
  const restorePending = useLiveInteractionStore((state) => state.restorePending);
  const parsed = colorCategoryNamesSchema.safeParse(Object.fromEntries(Object.entries(draft).filter(([key, name]) => CARD_COLORS.find((color) => color.value === key)?.label !== name.trim())));
  const changed = parsed.success && CARD_COLORS.some(({ value }) => parsed.data[value] !== map.colorCategoryNames?.[value]);
  const restored = reviewedEpoch !== epoch;
  const save = useMutation({ mutationFn: (colorCategoryNames: ColorCategoryNames) => {
    const live = useLiveInteractionStore.getState();
    if (reviewedEpoch !== live.epoch || live.restorePending) throw new Error(strings.restored);
    return api.updateStoryMap(map.id, { colorCategoryNames }, baseVersion);
  }, onSuccess: async () => {
    if (reviewedEpoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending) return;
    await Promise.all([client.invalidateQueries({ queryKey: ["story-map", map.id] }), client.invalidateQueries({ queryKey: ["story-maps"] }), client.invalidateQueries({ queryKey: ["activity"] })]);
    if (reviewedEpoch !== useLiveInteractionStore.getState().epoch || useLiveInteractionStore.getState().restorePending) return;
    useAnnouncementStore.getState().announceFeedback(strings.saved);
    if (mounted.current) onClose();
  } });
  async function reload() { await client.invalidateQueries({ queryKey: ["story-map", map.id] }); if (mounted.current) onClose(); }
  return { draft, setDraft, parsed, changed, restored, save, reload, pending: save.isPending || restorePending || restored };
}
