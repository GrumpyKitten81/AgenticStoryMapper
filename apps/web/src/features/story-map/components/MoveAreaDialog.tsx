import { useSyncFieldLocks } from "@storymapper/web/features/github-sync";
import { syncConflictStrings } from "@storymapper/web/ui-strings/sync-conflicts";
import { useRef, useState } from "react";
import type { Card } from "@storymapper/contracts";
import { validateCardHierarchy, visibleCards } from "@storymapper/core";
import { storyMapStrings as strings } from "@storymapper/ui-strings";
import { Dialog } from "@storymapper/web/components/Dialog";
import { cardLevelMeta } from "@storymapper/web/features/story-map/card-taxonomy";
import type { StoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";

export function MoveAreaDialog(props: MoveAreaDialogProps) {
  const result = useMoveAreaDialogState(props);
  if (result === null || !("target" in result)) return result;
  return renderMoveAreaDialog(result);
}

function useMoveAreaDialogState({ target, state, onClose }: MoveAreaDialogProps) {
  const releaseLocked = useSyncFieldLocks(target.id).has("milestone");
  const [baseVersion] = useState(() => state.captureMoveVersion(target.id));
  const [parentId, setParentId] = useState(target.parentId ?? "");
  const [releaseId, setReleaseId] = useState(target.releaseId ?? "");
  const [position, setPosition] = useState(() => target.level === "story" ? target.position : state.snapshot.cards
    .filter((card) => card.parentId === target.parentId && card.level === target.level)
    .sort((left, right) => left.position - right.position || left.createdAt.localeCompare(right.createdAt))
    .findIndex((card) => card.id === target.id));
  const [error, setError] = useState("");
  const busy = useRef(false);
  const pending = state.moveCard.isPending;
  if (state.preview) return null;
  const parents = visibleCards(state.snapshot.cards).filter((card) => card.id !== target.id && !validateCardHierarchy([{ ...card, parentId: null }, { ...target, parentId: card.id }]).some((issue) => issue.cardId === target.id));
  const parentMissing = Boolean(parentId) && !parents.some((card) => card.id === parentId);
  const releaseMissing = Boolean(releaseId) && !state.snapshot.releases.some((release) => release.id === releaseId);
  const siblingCount = state.snapshot.cards.filter((card) => card.id !== target.id && card.parentId === (parentId || null) && (target.level === "story" || card.level === target.level)).length;
  const positions = Array.from({ length: siblingCount + 1 }, (_, index) => index);
  const positionMissing = position > siblingCount;
  const close = () => { if (!busy.current) onClose(); };
  function confirm() {
    if (busy.current || parentMissing || releaseMissing || positionMissing || releaseLocked && releaseId !== (target.releaseId ?? "")) return;
    busy.current = true;
    state.moveCard.mutate({ cardId: target.id, baseVersion, patch: { parentId: parentId || null, position, ...(releaseLocked ? {} : { releaseId: releaseId || null }) } }, {
      onSuccess: () => { busy.current = false; onClose(); },
      onError: (failure: Error) => { busy.current = false; setError(failure.message); state.moveCard.reset(); }
    });
  }
  return { target, onClose, close, confirm, parentId, pending, setParentId, setPosition, parentMissing, parents, position, positionMissing, positions, releaseId, releaseLocked, setReleaseId, releaseMissing, state, error };
}

function renderMoveAreaDialog({ target, onClose, close, confirm, parentId, pending, setParentId, setPosition, parentMissing, parents, position, positionMissing, positions, releaseId, releaseLocked, setReleaseId, releaseMissing, state, error }: Exclude<ReturnType<typeof useMoveAreaDialogState>, import("react").ReactElement | null>) {
  return <Dialog title={strings.moveCardForm} description={strings.moveStoryQuestion(target.title)} cardId={target.id} onClose={close}>
    <form className="form-stack" onSubmit={(event) => { event.preventDefault(); confirm(); }}>
      <label>{strings.moveParent}<select aria-label={strings.moveParent} value={parentId} disabled={pending} onChange={(event) => { setParentId(event.target.value); setPosition(0); }}>
        <option value="">{strings.moveRoot}</option>
        {parentMissing ? <option value={parentId} disabled>{strings.moveUnavailableParent}</option> : null}
        {parents.map((card) => <option key={card.id} value={card.id}>{strings.moveParentOption(card.key, cardLevelMeta[card.level].label, card.title)}</option>)}
      </select></label>
      <label>{strings.movePosition}<select aria-label={strings.movePosition} value={position} disabled={pending} onChange={(event) => setPosition(Number(event.target.value))}>
        {positionMissing ? <option value={position} disabled>{strings.moveCapturedPosition(position)}</option> : null}
        {positions.map((value) => <option key={value} value={value}>{strings.movePositionOption(value)}</option>)}
      </select></label>
      <label>{strings.release}<select aria-label={strings.release} value={releaseId} disabled={pending || releaseLocked} onChange={(event) => setReleaseId(event.target.value)}>
        <option value="">{strings.unscheduled}</option>
        {releaseMissing ? <option value={releaseId} disabled>{strings.moveUnavailableRelease}</option> : null}
        {state.snapshot.releases.map((release) => <option key={release.id} value={release.id}>{release.name}</option>)}
      </select></label>
      {releaseLocked ? <p>{syncConflictStrings.lock(syncConflictStrings.fields.milestone)}</p> : null}
      {parentMissing || releaseMissing ? <p role="alert">{parentMissing ? strings.moveUnavailableParent : strings.moveUnavailableRelease}</p> : null}
      {positionMissing ? <p role="alert">{strings.moveUnavailablePosition}</p> : null}
      {error ? <p role="alert">{error}</p> : null}
      {pending ? <p role="status">{strings.lifecycleWorking}</p> : null}
      <div className="button-row"><button type="button" className="secondary" data-dialog-cancel disabled={pending} onClick={close}>{strings.cancel}</button>
      <button type="submit" disabled={pending || parentMissing || releaseMissing || positionMissing}>{strings.moveCardForm}</button></div>
    </form>
  </Dialog>;
}

interface MoveAreaDialogProps { target: Card; state: StoryMapBoardState; onClose: () => void }
