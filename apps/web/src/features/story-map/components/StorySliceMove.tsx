import { useSyncFieldLocks } from "@storymapper/web/features/github-sync";
import { syncConflictStrings } from "@storymapper/web/ui-strings/sync-conflicts";
import { MoveAreaDialog } from "@storymapper/web/features/story-map/components/MoveAreaDialog";
import { useState, type ReactElement } from "react";
import type { Card } from "@storymapper/contracts";
import { storyMapStrings as strings } from "@storymapper/ui-strings";
import type { StoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";

export function StorySliceMove({ card, state }: { card: Card; state: StoryMapBoardState }): ReactElement | null {
  const releaseLocked = useSyncFieldLocks(card.id).has("milestone");
  const [target, setTarget] = useState(card.releaseId ?? "");
  const [expanded, setExpanded] = useState(false);
  const [completeForm, setCompleteForm] = useState(false);
  const [baseVersion, setBaseVersion] = useState(() => state.captureMoveVersion(card.id));
  if (state.preview) return null;
  const lanes = [...state.snapshot.releases.slice().sort((a, b) => a.position - b.position || a.id.localeCompare(b.id)).map((release) => ({ id: release.id, name: release.name })), { id: "", name: strings.unscheduled }];
  const targetMissing = !lanes.some((lane) => lane.id === target);
  const current = lanes.findIndex((lane) => lane.id === (card.releaseId ?? ""));
  const pending = state.moveCard.isPending;
  function move(releaseId: string): void {
    const lane = lanes.find((candidate) => candidate.id === releaseId);
    if (!lane || releaseLocked) return;
    state.moveCard.mutate({ cardId: card.id, baseVersion, patch: { parentId: card.parentId, releaseId: releaseId || null, position: state.snapshot.cards.filter((item) => item.level === "story" && item.parentId === card.parentId && item.releaseId === (releaseId || null)).length } }, {
      onSuccess: () => {
        requestAnimationFrame(() => { if (document.activeElement === document.body) document.querySelector<HTMLElement>(`button[data-card-id="${card.id}"]`)?.focus(); });
      }
    });
  }
  return <div className="slice-move-controls form-stack">
    {releaseLocked ? <p>{syncConflictStrings.lock(syncConflictStrings.fields.milestone)}</p> : null}
    <div className="button-row"><button type="button" className="secondary" aria-expanded={expanded} aria-label={strings.moveStoryNamed(card.key)} onClick={() => { setTarget(card.releaseId ?? ""); setBaseVersion(state.captureMoveVersion(card.id)); setExpanded(!expanded); }}>{strings.moveStory}</button>
    <button type="button" className="secondary" aria-label={strings.moveCompleteForm(card.key)} onClick={() => setCompleteForm(true)}>{strings.moveCardForm}</button></div>
    {completeForm ? <MoveAreaDialog target={card} state={state} onClose={() => setCompleteForm(false)} /> : null}
    {expanded ? <>
      <div className="button-row">
        <button type="button" className="secondary icon-button" disabled={releaseLocked || pending || current <= 0} aria-label={strings.moveToPreviousSlice(card.key)} onClick={() => move(lanes[current - 1]!.id)}>{strings.previousSliceGlyph}</button>
        <button type="button" className="secondary icon-button" disabled={releaseLocked || pending || current < 0 || current === lanes.length - 1} aria-label={strings.moveToNextSlice(card.key)} onClick={() => move(lanes[current + 1]!.id)}>{strings.nextSliceGlyph}</button>
      </div>
      <form className="form-stack" aria-label={strings.moveStoryNamed(card.key)} onSubmit={(event) => { event.preventDefault(); move(target); }}>
        <label>{strings.moveTarget}<select aria-label={`${strings.moveTarget} ${card.key}`} value={target} disabled={releaseLocked || pending} onChange={(event) => setTarget(event.target.value)}>{targetMissing ? <option value={target} disabled>{strings.unavailableSlice(target)}</option> : null}{lanes.map((lane) => <option key={lane.id} value={lane.id}>{lane.name}</option>)}</select></label>
        <button type="submit" className="secondary" disabled={releaseLocked || pending || target === (card.releaseId ?? "")}>{strings.moveStory}</button>
      </form>
      {targetMissing ? <p role="alert">{strings.unavailableSlice(target)}</p> : null}
    </> : null}

  </div>;
}
