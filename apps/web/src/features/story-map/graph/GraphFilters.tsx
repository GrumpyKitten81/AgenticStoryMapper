import type { ReactElement } from "react";
import { storyMapStrings as strings } from "@storymapper/ui-strings";
import type { GraphFilters as Filters, GraphModel } from "@storymapper/web/features/story-map/graph/graph-model";

const LABELS: Record<keyof Filters, string> = { activity: strings.activity, slice: strings.graphSlice, status: strings.graphStatus, assignee: strings.assignee };

export function GraphFilters({ model, change }: { model: GraphModel; change: (filters: Filters) => void }): ReactElement {
  return <div className="graph-filters">{(Object.keys(LABELS) as (keyof Filters)[]).filter((key) => key !== "status").map((key) => <label key={key}>{LABELS[key]}<select aria-label={`${strings.graph} ${LABELS[key]}`} value={model.filters[key]} onChange={(event) => change({ ...model.filters, [key]: event.target.value })}><option value="">{strings.graphAll}</option>{model.options[key].map(({ id, name }) => <option key={id} value={id}>{name}</option>)}</select></label>)}</div>;
}
