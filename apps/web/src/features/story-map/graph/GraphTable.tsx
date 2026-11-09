import { ChangedMarker } from "@storymapper/web/features/what-changed";
import type { ReactElement } from "react";
import type { Card } from "@storymapper/contracts";
import { storyMapStrings as strings } from "@storymapper/ui-strings";
import type { GraphModel } from "@storymapper/web/features/story-map/graph/graph-model";

export function GraphTable({ model, selectedId, select }: { model: GraphModel; selectedId: string | undefined; select: (id: string) => void }): ReactElement {
  const incident = new Set(model.edges.flatMap((edge) => [edge.cardId, edge.prerequisiteCardId]));
  const rows = model.edges.map((edge) => ({ key: edge.id, card: model.byId.get(edge.cardId)!, prerequisite: model.byId.get(edge.prerequisiteCardId) }));
  rows.push(...model.cards.filter((card) => !incident.has(card.id)).map((card) => ({ key: card.id, card, prerequisite: undefined })));
  const label = (card: Card, qualifier?: string) => strings.graphCardLabel(card.key, card.title, qualifier);
  return <table className="graph-table" aria-label={strings.graphTable}><thead><tr><th>{strings.graphCard}</th><th>{strings.graphDependsOn}</th><th>{strings.graphRequiredBy}</th><th>{strings.blockedOrderSummary}</th></tr></thead>
    <tbody>{rows.map(({ key, card, prerequisite }) => <tr key={key} className={model.contextIds.has(card.id) ? "filter-context" : undefined}><td><button type="button" aria-pressed={selectedId === card.id} onClick={() => select(card.id)}>{label(card, selectedId === card.id ? strings.graphSelected : undefined)}</button><ChangedMarker cardId={card.id} /></td>
      <td>{prerequisite ? <><button type="button" aria-pressed={selectedId === prerequisite.id} onClick={() => select(prerequisite.id)}>{label(prerequisite, selectedId === prerequisite.id ? strings.graphSelected : undefined)}</button><ChangedMarker cardId={prerequisite.id} /></> : strings.graphNone}</td>
      <td>{(model.requiredBy.get(card.id) ?? []).map((related) => label(related, model.ids.has(related.id) ? undefined : strings.graphOutsideFilter)).join(", ") || strings.graphNone}</td>
      <td>{model.cues.filter((cue) => cue.cardId === card.id && cue.blockedOrder).map((cue) => cue.prerequisite.key).join(", ") || strings.graphNone}</td>
    </tr>)}</tbody></table>;
}
