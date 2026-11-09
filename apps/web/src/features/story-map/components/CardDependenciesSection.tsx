import type { Card, StoryMapSnapshot } from "@storymapper/contracts";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { storyMapStrings as strings } from "@storymapper/ui-strings";
import { api } from "@storymapper/web/app/api";
import { isConflictError } from "@storymapper/web/app/conflicts";
import { ConflictAlert } from "@storymapper/web/features/conflicts";
import { CardDependencyBadges, dependencyKeysByCard } from "@storymapper/web/components/CardDependencyBadges";

export function CardDependenciesSection(props: CardDependenciesSectionProps) {
  return renderCardDependenciesSection(useCardDependenciesSectionState(props));
}

function useCardDependenciesSectionState({ card, snapshot, disabled, onSaved, onPendingChange, invalidate }: CardDependenciesSectionProps) {
  const [selectedId, setSelectedId] = useState("");
  const prerequisiteSelect = useRef<HTMLSelectElement>(null);
  const removedButton = useRef<HTMLButtonElement | null>(null);
  const version = useRef(card.version);
  useLayoutEffect(() => { version.current = card.version; }, [card.version]);
  const edges = snapshot.cardDependencies.filter((edge) => edge.cardId === card.id);
  const cardById = new Map(snapshot.cards.map((item) => [item.id, item]));
  const candidates = snapshot.cards.filter((item) => item.id !== card.id && !edges.some((edge) => edge.prerequisiteCardId === item.id));
  const mutation = useMutation({
    mutationKey: ["card-dependencies", card.id],
    scope: { id: `card-dependencies:${card.id}` },
    meta: { ownsConflict: true },
    mutationFn: (input: { prerequisiteCardId: string; remove: boolean; baseVersion: number }) => input.remove
      ? api.unsetCardDependency(card.id, input.prerequisiteCardId, input.baseVersion)
      : api.setCardDependency(card.id, { prerequisiteCardId: input.prerequisiteCardId, baseVersion: input.baseVersion }),
    onSuccess: async (response, input) => {
      version.current = response.card.version;
      if (!input.remove) setSelectedId("");
      onSaved(response.card, input.baseVersion);
      await invalidate();
    }
  });
  const pending = disabled || mutation.isPending;
  useLayoutEffect(() => { onPendingChange(mutation.isPending); }, [mutation.isPending, onPendingChange]);
  useEffect(() => () => onPendingChange(false), [onPendingChange]);
  useLayoutEffect(() => {
    if (!mutation.isSuccess || pending) return;
    const button = removedButton.current;
    removedButton.current = null;
    if (button && (document.activeElement === button || (!button.isConnected && document.activeElement === document.body))) prerequisiteSelect.current?.focus();
  }, [mutation.isSuccess, pending]);
  return { snapshot, card, edges, cardById, disabled, pending, removedButton, mutation, version, prerequisiteSelect, selectedId, setSelectedId, candidates, invalidate };
}

function renderCardDependenciesSection({ snapshot, card, edges, cardById, disabled, pending, removedButton, mutation, version, prerequisiteSelect, selectedId, setSelectedId, candidates, invalidate }: ReturnType<typeof useCardDependenciesSectionState>) {
  return <section className="source-link-section">
    <h2>{strings.dependencies}</h2>
    <CardDependencyBadges dependencies={dependencyKeysByCard(snapshot)[card.id]} />
    {edges.length === 0 ? <p>{strings.noPrerequisites}</p> : null}
    {edges.map((edge) => <div className="source-link-row" key={edge.id}>
      <span>{cardById.get(edge.prerequisiteCardId)!.key} {cardById.get(edge.prerequisiteCardId)!.title}</span>
      <button type="button" className="secondary" aria-label={strings.removeDependency(cardById.get(edge.prerequisiteCardId)!.key)} disabled={pending} onClick={(event) => {
        removedButton.current = document.activeElement === event.currentTarget ? event.currentTarget : null;
        mutation.mutate({ prerequisiteCardId: edge.prerequisiteCardId, remove: true, baseVersion: version.current });
      }}>{strings.remove}</button>
    </div>)}
    <label>{strings.prerequisiteCard}<select ref={prerequisiteSelect} value={selectedId} disabled={pending} onChange={(event) => { mutation.reset(); setSelectedId(event.target.value); }}>
      <option value="">{strings.selectPrerequisite}</option>
      {candidates.map((candidate) => <option value={candidate.id} key={candidate.id}>{candidate.key} {candidate.title}</option>)}
    </select></label>
    <button type="button" disabled={pending || !candidates.some((item) => item.id === selectedId)} onClick={() => mutation.mutate({ prerequisiteCardId: selectedId, remove: false, baseVersion: version.current })}>{strings.addDependency}</button>
    {mutation.isPending ? <p role="status">{strings.dependencyPending}</p> : null}
    <ConflictAlert error={mutation.error} entityId={card.id} name={card.key} disabled={pending}
      onReload={(conflict) => { version.current = conflict.currentVersion; mutation.reset(); void invalidate(); }}
      onKeepMine={(conflict) => { if (mutation.variables) mutation.mutate({ ...mutation.variables, baseVersion: conflict.currentVersion }); }} />
    {mutation.error && !isConflictError(mutation.error) ? <p role="alert">{mutation.error.message}</p> : null}
  </section>;
}

interface CardDependenciesSectionProps {
  card: Card;
  snapshot: StoryMapSnapshot;
  disabled: boolean;
  onSaved: (card: Card, submittedVersion: number) => void;
  onPendingChange: (pending: boolean) => void;
  invalidate: () => Promise<void>;
}
