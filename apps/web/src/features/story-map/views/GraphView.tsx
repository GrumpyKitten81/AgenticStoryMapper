import { BoardToolbar } from "@storymapper/web/features/story-map/components/BoardToolbar";
import { useEffect, useMemo, useState, type ReactElement } from "react";
import { useNavigate, useSearch } from "@tanstack/react-router";
import { storyMapStrings as strings } from "@storymapper/ui-strings";
import { useStoryMapBoardStateContext } from "@storymapper/web/app/routes/story-map-shell";
import { buildGraphModel, EMPTY_GRAPH_FILTERS } from "@storymapper/web/features/story-map/graph/graph-model";
import { layoutGraph } from "@storymapper/web/features/story-map/graph/graph-layout";
import { GraphCanvas } from "@storymapper/web/features/story-map/graph/GraphCanvas";
import { GraphTable } from "@storymapper/web/features/story-map/graph/GraphTable";
import { GraphFilters } from "@storymapper/web/features/story-map/graph/GraphFilters";
import { GraphRelationships } from "@storymapper/web/features/story-map/graph/GraphRelationships";
import "@storymapper/web/styles/graph.css";
import "@storymapper/web/styles/slices.css";

export function GraphView(): ReactElement {
  const state = useStoryMapBoardStateContext();
  return <ScopedGraphView key={state.snapshot.storyMap.id} snapshot={state.snapshot} />;
}
function ScopedGraphView({ snapshot }: { snapshot: ReturnType<typeof useStoryMapBoardStateContext>["snapshot"] }): ReactElement {
  const [filters, setFilters] = useState(EMPTY_GRAPH_FILTERS);
  const [selectedId, select] = useState<string>();
  const [table, setTable] = useState(false);
  const navigate = useNavigate();
  const search = useSearch({ strict: false }) as { card?: string; preview?: string };
  const board = useStoryMapBoardStateContext();
  const model = useMemo(() => buildGraphModel(snapshot, filters, board.filtered), [snapshot, filters, board.filtered]);
  const layout = useMemo(() => layoutGraph(model), [model]);
  const selected = selectedId && model.ids.has(selectedId) ? model.byId.get(selectedId) : undefined;
  useEffect(() => { if (selectedId && !model.ids.has(selectedId)) select(undefined); }, [model, selectedId]);
  return <section className="dependency-graph" aria-label={strings.graph} data-layout-duration={layout.duration}>
    <h2>{strings.graph}</h2>{!board.preview ? <BoardToolbar state={board} /> : null}<GraphFilters model={model} change={setFilters} />
    <div className="graph-mode button-row"><button type="button" className="secondary" aria-pressed={!table} onClick={() => setTable(false)}>{strings.graphCanvas}</button><button type="button" className="secondary" aria-pressed={table} onClick={() => setTable(true)}>{strings.graphTable}</button></div>
    <p role="status" aria-live="polite">{strings.graphCount(model.cards.filter((card) => board.filtered.matchingCardIds.has(card.id)).length, model.edges.length)}</p>
    {!model.cards.length ? <p>{strings.emptyFilteredCards}</p> : table ? <GraphTable model={model} selectedId={selected?.id} select={select} /> : <GraphCanvas model={model} layout={layout} selectedId={selected?.id} select={select} />}
    <GraphRelationships model={model} selected={selected} readOnly={Boolean(search.preview)} open={() => void (navigate as (options: unknown) => Promise<void>)({ search: { ...search, card: selected?.id } })} />
  </section>;
}
