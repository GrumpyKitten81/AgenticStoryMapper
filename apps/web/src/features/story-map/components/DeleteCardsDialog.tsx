import { useEffect, useRef, useState } from "react";
import type { Card, DeleteCardsCommand } from "@storymapper/contracts";
import { selectedDeletionPlacement, visibleCards } from "@storymapper/core";
import { isConflictError } from "@storymapper/web/app/conflicts";
import { api } from "@storymapper/web/app/api";
import { Dialog } from "@storymapper/web/components/Dialog";
import type { StoryMapBoardState } from "@storymapper/web/features/story-map/useStoryMapBoardState";
import { storyMapStrings as strings } from "@storymapper/ui-strings";

export function DeleteCardsDialog(props: DeleteCardsDialogProps) {
  return renderDeleteCardsDialog(useDeleteCardsDialogState(props));
}

function useDeleteCardsDialogState(props: DeleteCardsDialogProps) {
  const context = useDeleteCardsSelection(props);
  const { cards, state, onClose, openingSnapshot, external, baseline, strategy, busy, selected } = context;
  const children = state.snapshot.cards.filter((card) => {
    let parent = card.parentId;
    const visited = new Set<string>();
    while (parent && !visited.has(parent)) {
      if (selected.has(parent)) return !selected.has(card.id);
      visited.add(parent); parent = state.snapshot.cards.find((item) => item.id === parent)?.parentId ?? null;
    }
    return false;
  });
  const reassignOption = (value: "reassign-left" | "reassign-right", label: (titles: string) => string) => {
    const placement = selectedDeletionPlacement(state.snapshot.cards, cards.map((card) => card.id), value);
    return placement.error || !placement.recipients.length ? [] : [{ value, label: label(placement.recipients.map((id) => state.snapshot.cards.find((card) => card.id === id)!.title).join(", ")) }];
  };
  const options = [
    ...reassignOption("reassign-left", strings.reassignLeft),
    ...reassignOption("reassign-right", strings.reassignRight),
    { value: "unassign" as const, label: strings.unassignDescendants }
  ];
  const pending = state.deleteCards.isPending;
  const eligibleIds = new Set(visibleCards(state.snapshot.cards).map((card) => card.id));
  const targetsAvailable = state.snapshot.storyMap.id === openingSnapshot.storyMap.id && cards.every((card) => eligibleIds.has(card.id));
  const available = targetsAvailable && cards.length > 0 && (!children.length || strategy !== null) && options.some((option) => option.value === (strategy ?? "unassign"));
  function confirm() {
    if (busy.current || !available || external.loading || external.error) return;
    busy.current = true;
    state.setLifecycleNotice("");
    state.deleteCards.mutate({ ...baseline, affectedCards: [...baseline.affectedCards, ...external.cards.map((card) => ({ id: card.id, baseVersion: card.version }))], strategy: strategy ?? "unassign" }, {
      onSuccess: () => { state.setLifecycleNotice(strings.deleteCardsDone(cards.length)); onClose(); },
      onSettled: () => { busy.current = false; }
    });
  }
  return { ...context, targetsAvailable, children, pending, options, available, confirm };
}

function renderDeleteCardsDialog({ cards, onClose, busy, targetsAvailable, external, children, pending, options, strategy, setStrategy, state, conflict, openingSnapshot, available, confirm }: ReturnType<typeof useDeleteCardsDialogState>) {
  return <Dialog title={strings.deleteCardsTitle(cards.length)} description={strings.deleteCardsQuestion(cards.length)} alert cardId={cards[0]?.id} onClose={() => { if (!busy.current) onClose(); }}>
    {!targetsAvailable ? <p role="alert">{strings.deleteTargetsUnavailable}</p> : null}
    {external.loading ? <p role="status">{strings.deleteCheckingRelatedCards}</p> : null}
    {external.error ? <p role="alert">{external.error}</p> : null}
    {external.cards.length ? <div><p>{strings.deleteRelatedCards(external.cards.length)}</p><ul>{external.cards.map((card) => <li key={card.id}>{card.key} {card.title}</li>)}</ul></div> : null}
    <ul>{cards.map((card) => <li key={card.id}>{card.key} {card.title}</li>)}</ul>
    <p>{strings.deleteAffectedChildren(children.length)}</p>
    {children.length ? <ul>{children.map((card) => <li key={card.id}>{card.key} {card.title}</li>)}</ul> : null}
    {children.length ? <fieldset className="form-stack" disabled={pending}><legend>{strings.childrenStrategy}</legend>{options.map((option) => <label key={option.value} className="radio-row"><input type="radio" name="delete-set-strategy" checked={strategy === option.value} onChange={() => setStrategy(option.value)} />{option.label}</label>)}</fieldset> : <p>{strings.noChildren}</p>}
    {state.deleteCards.error ? <div role="alert" ref={conflict} tabIndex={-1}>
      <p>{state.deleteCards.error.message}</p>
      {isConflictError(state.deleteCards.error) ? <ul>{state.deleteCards.error.conflicts.map((entry, index) => {
        const card = [...openingSnapshot.cards, ...external.cards].find((card) => card.id === entry.id);
        const name = card ? `${card.key} ${card.title}` : entry.id;
        return <li key={`${entry.id}:${index}`}>{entry.currentVersion === undefined ? strings.deleteConflictReason(name, entry.message) : strings.deleteConflictVersion(name, entry.baseVersion, entry.currentVersion)}</li>;
      })}</ul> : null}
    </div> : null}
    <div className="button-row">
      <button type="button" className="secondary" data-dialog-cancel disabled={pending} onClick={onClose}>{strings.cancel}</button>
      <button type="button" className="danger" disabled={pending || !available || external.loading || Boolean(external.error)} onClick={confirm}>{strings.deletePermanent}</button>
    </div>
  </Dialog>;
}

function useDeleteCardsSelection({ cards, state, onClose }: DeleteCardsDialogProps) {
  const [openingSnapshot] = useState(state.snapshot);
  const [external, setExternal] = useState<{ loading: boolean; cards: Card[]; error: string }>({ loading: true, cards: [], error: "" });
  const [baseline] = useState(() => ({ storyMapId: state.snapshot.storyMap.id, cards: cards.map((card) => ({ id: card.id, baseVersion: state.captureMoveVersion(card.id) })), affectedCards: state.snapshot.cards.map((card) => ({ id: card.id, baseVersion: state.captureMoveVersion(card.id) })) }));
  useEffect(() => {
    state.deleteCards.reset();
    let mounted = true;
    api.captureDeleteAffectedCards(openingSnapshot, baseline.cards.map((card) => card.id)).then((affected) => {
      if (mounted) setExternal({ loading: false, cards: affected, error: "" });
    }, (failure: unknown) => {
      if (!(failure instanceof Error)) throw failure;
      if (mounted) setExternal({ loading: false, cards: [], error: failure.message });
    });
    return () => { mounted = false; };
  }, [openingSnapshot, baseline]);
  const [strategy, setStrategy] = useState<DeleteCardsCommand["strategy"] | null>(null);
  const busy = useRef(false);
  const conflict = useRef<HTMLDivElement>(null);
  useEffect(() => { if (state.deleteCards.error) conflict.current?.focus(); }, [state.deleteCards.error]);
  const selected = new Set(cards.map((card) => card.id));
  return { cards, state, onClose, openingSnapshot, external, baseline, strategy, setStrategy, busy, conflict, selected };
}

interface DeleteCardsDialogProps { cards: Card[]; state: StoryMapBoardState; onClose: () => void }
