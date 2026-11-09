import type { ReactElement } from "react";
import type { Card } from "@storymapper/contracts";
import { storyMapStrings as strings } from "@storymapper/ui-strings";
import type { GraphModel } from "@storymapper/web/features/story-map/graph/graph-model";
import { SliceDependencyCues } from "@storymapper/web/features/story-map/components/SliceDependencyCues";

export function GraphRelationships({ model, selected, open, readOnly }: { model: GraphModel; selected: Card | undefined; open: () => void; readOnly: boolean }): ReactElement {
  const names = (cards: Card[]) => cards.length ? cards.map((card) => strings.graphCardLabel(card.key, card.title, model.ids.has(card.id) ? undefined : strings.graphOutsideFilter)).join(", ") : strings.graphNone;
  return <aside className="graph-relationships" aria-label={strings.graphRelationships}>
    {selected ? <><h3>{strings.graphRelationship(strings.graphSelected, strings.graphCardLabel(selected.key, selected.title))}</h3>
      <p>{strings.graphRelationship(strings.graphRequires, names(model.requires.get(selected.id) ?? []))}</p>
      <p>{strings.graphRelationship(strings.graphRequiredBy, names(model.requiredBy.get(selected.id) ?? []))}</p>
      <SliceDependencyCues cues={model.cues.filter((cue) => cue.cardId === selected.id)} />
      <button type="button" disabled={readOnly} onClick={open}>{strings.graphOpenCard}</button></> : <p>{strings.graphChooseCard}</p>}
    <div role="group" aria-label={strings.graphBlockers}>{model.cards.map((card) => {
      const cues = model.cues.filter((cue) => cue.cardId === card.id && (cue.open || cue.blockedOrder));
      return cues.length ? <div key={card.id}><strong>{strings.graphCardLabel(card.key, card.title)}</strong><SliceDependencyCues cues={cues} /></div> : null;
    })}</div>
  </aside>;
}
