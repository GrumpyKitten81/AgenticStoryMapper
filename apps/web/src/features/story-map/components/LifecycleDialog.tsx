import { isConflictError } from "@storymapper/web/app/conflicts";
import { SyncConflictNotice } from "@storymapper/web/features/github-sync";
import type { Card, DeleteCardRequest, StoryMapSnapshot } from "@storymapper/contracts";
import { visibleCards } from "@storymapper/core";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { Dialog } from "@storymapper/web/components/Dialog";
import { api } from "@storymapper/web/app/api";
import { invalidateCardReports } from "@storymapper/web/features/story-map/card-query-invalidation";
import { storyMapStrings as strings } from "@storymapper/ui-strings";
import { localStatusOptions } from "@storymapper/web/features/story-map/status-filters";

export type LifecycleAction = "park" | "archive" | "delete" | "unpark" | "restore";

interface LifecycleDialogProps {
  card: Card;
  snapshot: StoryMapSnapshot;
  action: LifecycleAction;
  onClose: () => void;
  onComplete?: () => void;
  onNotice?: (message: string) => void;
}

export function LifecycleDialog({ card, snapshot, action, onClose, onComplete, onNotice }: LifecycleDialogProps) {
  const linked = snapshot.remoteWorkItemLinks.some((link) => link.cardId === card.id);
  const [strategy, setStrategy] = useState<DeleteCardRequest["strategy"]>("unassign");
  const [status, setStatus] = useState("");
  const busy = useRef(false);
  const completeIntent = useRef(onComplete);
  const queryClient = useQueryClient();
  const label = actionLabel(action);
  const mutation = useMutation({
    mutationKey: ["card-owned-write", card.id],
    mutationFn: () => performAction(card.id, card.version, action, strategy, linked ? undefined : status),
    onSuccess: async () => {
      await Promise.all([queryClient.invalidateQueries({ queryKey: ["story-map", snapshot.storyMap.id] }), invalidateCardReports(queryClient)]);
      onNotice?.(strings.lifecycleDone(label, card.title));
      completeIntent.current?.();
      onClose();
    },
    onSettled: () => { busy.current = false; }
  });
  const withStrategy = action === "park" || action === "delete";
  const hasChildren = snapshot.cards.some((item) => item.parentId === card.id);
  const strategyOptions = childStrategyOptions(card, snapshot.cards);
  const strategyAvailable = !hasChildren || strategyOptions.some((option) => option.value === strategy);
  const statuses = localStatusOptions(snapshot);
  const description = action === "archive" ? strings.archiveQuestion(card.title) : action === "delete" ? strings.permanentDeleteQuestion(card.title) : action === "park" ? strings.parkActivityQuestion(card.title) : action === "restore" ? strings.archivedListDescription : strings.parkedListDescription;

  return (
    <Dialog title={`${label} ${card.title}`} description={description} alert cardId={card.id} onClose={() => { if (!busy.current) onClose(); }}>
      {withStrategy ? <ChildStrategy cardId={card.id} options={strategyOptions} hasChildren={hasChildren} value={strategy} onChange={setStrategy} disabled={mutation.isPending} /> : null}
      {action === "restore" && !linked ? <label>{strings.restoreStatus}<select value={status} disabled={mutation.isPending} onChange={(event) => setStatus(event.target.value)}><option value="">{strings.chooseRestoreStatus}</option>{statuses.map((name) => <option key={name} value={name}>{name}</option>)}</select></label> : null}
      {mutation.error ? <p role="alert">{mutation.error.message}</p> : null}
      {isConflictError(mutation.error) ? mutation.error.conflicts.filter((entry) => entry.reason === "sync").map((entry, index) => <div key={index} role="alert"><SyncConflictNotice current={entry.current} /></div>) : null}
      {mutation.isPending ? <p role="status">{strings.lifecycleWorking}</p> : null}
      <div className="discovery-dialog-actions button-row">
        <button type="button" className="secondary" data-dialog-cancel disabled={mutation.isPending} onClick={onClose}>{strings.cancel}</button>
        <button type="button" className={action === "delete" ? "danger" : "secondary"} disabled={mutation.isPending || (withStrategy && !strategyAvailable) || (action === "restore" && !linked && !status)} onClick={() => { if (busy.current || (withStrategy && !strategyAvailable)) return; busy.current = true; mutation.mutate(); }}>{label}</button>
      </div>
    </Dialog>
  );
}

interface StrategyOption { value: DeleteCardRequest["strategy"]; label: string }

function childStrategyOptions(card: Card, cards: Card[]): StrategyOption[] {
  const visibleIds = new Set(visibleCards(cards).map((item) => item.id));
  const siblings = cards.filter((item) => (item.id === card.id || visibleIds.has(item.id)) && item.parentId === card.parentId && item.level === card.level).sort((left, right) => left.position - right.position || left.createdAt.localeCompare(right.createdAt));
  const index = siblings.findIndex((item) => item.id === card.id);
  const left = siblings[index - 1];
  const right = siblings[index + 1];
  return [
    ...(left ? [{ value: "reassign-left" as const, label: strings.reassignLeft(left.title) }] : []),
    ...(right ? [{ value: "reassign-right" as const, label: strings.reassignRight(right.title) }] : []),
    { value: "unassign", label: strings.unassignDescendants }
  ];
}

function ChildStrategy({ cardId, options, hasChildren, value, onChange, disabled }: { cardId: string; options: StrategyOption[]; hasChildren: boolean; value: DeleteCardRequest["strategy"]; onChange: (value: DeleteCardRequest["strategy"]) => void; disabled: boolean }) {
  if (!hasChildren) return <p>{strings.noChildren}</p>;
  return <fieldset className="form-stack" disabled={disabled}><legend>{strings.childrenStrategy}</legend>{options.map((option) => <label key={option.value} className="lifecycle-strategy radio-row"><input type="radio" name={`children-${cardId}`} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} />{option.label}</label>)}</fieldset>;
}

function actionLabel(action: LifecycleAction): string {
  return { park: strings.park, archive: strings.archive, delete: strings.deletePermanent, unpark: strings.unpark, restore: strings.restore }[action];
}

function performAction(cardId: string, baseVersion: number, action: LifecycleAction, strategy: DeleteCardRequest["strategy"], status: string | undefined): Promise<unknown> {
  if (action === "park") return api.parkCard(cardId, { childStrategy: strategy }, baseVersion);
  if (action === "archive") return api.archiveCard(cardId, baseVersion);
  if (action === "delete") return api.deleteCard(cardId, { strategy }, baseVersion);
  if (action === "unpark") return api.unparkCard(cardId, baseVersion);
  return api.updateCard(cardId, { archived: false, ...(status === undefined ? {} : { status }) }, baseVersion);
}
