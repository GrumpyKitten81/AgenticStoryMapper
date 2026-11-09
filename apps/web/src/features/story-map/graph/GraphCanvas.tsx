import { ChangedMarker } from "@storymapper/web/features/what-changed";
import { useLayoutEffect, useRef, useState, type KeyboardEvent, type ReactElement } from "react";
import { storyMapStrings as strings } from "@storymapper/ui-strings";
import type { GraphModel } from "@storymapper/web/features/story-map/graph/graph-model";
import { NODE_HEIGHT, NODE_WIDTH, type GraphLayout } from "@storymapper/web/features/story-map/graph/graph-layout";

export function GraphCanvas({ model, layout, selectedId, select }: { model: GraphModel; layout: GraphLayout; selectedId: string | undefined; select: (id: string) => void }): ReactElement {
  const [viewport, setViewport] = useState({ x: 0, y: 0, zoom: 1 });
  const canvas = useRef<HTMLDivElement>(null);
  const drag = useRef<{ id: number; x: number; y: number } | undefined>(undefined);
  const requires = new Set((model.requires.get(selectedId ?? "") ?? []).map((card) => card.id));
  const requiredBy = new Set((model.requiredBy.get(selectedId ?? "") ?? []).map((card) => card.id));
  const keyboard = (event: KeyboardEvent) => {
    if (event.ctrlKey || event.metaKey || event.altKey) return;
    const delta = { ArrowLeft: [40, 0], ArrowRight: [-40, 0], ArrowUp: [0, 40], ArrowDown: [0, -40] }[event.key];
    if (delta) { event.preventDefault(); setViewport((value) => ({ ...value, x: value.x + delta[0]!, y: value.y + delta[1]! })); }
    if (event.key === "+" || event.key === "=" || event.key === "-") {
      event.preventDefault(); setViewport((value) => ({ ...value, zoom: Math.max(0.25, Math.min(2, value.zoom + (event.key === "-" ? -0.1 : 0.1))) }));
    }
  };
  const reveal = (node: HTMLElement) => {
    const boundary = canvas.current!.getBoundingClientRect(), bounds = node.getBoundingClientRect();
    const dx = bounds.left < boundary.left + 8 ? boundary.left + 8 - bounds.left : bounds.right > boundary.right - 8 ? boundary.right - 8 - bounds.right : 0;
    const dy = bounds.top < boundary.top + 8 ? boundary.top + 8 - bounds.top : bounds.bottom > boundary.bottom - 8 ? boundary.bottom - 8 - bounds.bottom : 0;
    if (dx || dy) setViewport((value) => ({ ...value, x: value.x + dx, y: value.y + dy }));
  };
  useLayoutEffect(() => {
    setViewport({ x: 0, y: 0, zoom: 1 });
    drag.current = undefined;
  }, [layout]);
  useLayoutEffect(() => {
    const focused = document.activeElement;
    if (focused instanceof HTMLElement && focused.matches("[data-graph-card-id]") && canvas.current?.contains(focused)) reveal(focused);
  }, [viewport.zoom]);
  return <><p id="graph-keyboard-help">{strings.graphKeyboardHelp}</p><div ref={canvas} className="graph-canvas" tabIndex={0} role="region" aria-label={strings.graphCanvas} aria-describedby="graph-keyboard-help" onKeyDown={keyboard}
    onPointerDown={(event) => {
      if (event.button !== 0 || (event.target as Element).closest("button")) return;
      event.currentTarget.focus(); event.currentTarget.setPointerCapture(event.pointerId);
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }} onPointerMove={(event) => {
      const previous = drag.current;
      if (!previous || previous.id !== event.pointerId) return;
      setViewport((value) => ({ ...value, x: value.x + event.clientX - previous.x, y: value.y + event.clientY - previous.y }));
      drag.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
    }} onPointerUp={() => { drag.current = undefined; }} onPointerCancel={() => { drag.current = undefined; }} onLostPointerCapture={() => { drag.current = undefined; }}>
    <div className="graph-viewport" data-graph-viewport style={{ width: layout.width, height: layout.height, transform: `translate(${viewport.x}px, ${viewport.y}px) scale(${viewport.zoom})` }}>
      <svg width={layout.width} height={layout.height} aria-hidden="true"><defs><marker id="graph-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" /></marker></defs>
        {layout.edges.map((edge) => <polyline key={edge.id} points={edge.points.map((point) => `${point.x},${point.y}`).join(" ")} markerEnd="url(#graph-arrow)" />)}</svg>
      {layout.nodes.map(({ card, x, y }) => <button key={card.id} type="button" className={`graph-node${model.contextIds.has(card.id) ? " filter-context" : ""}${selectedId === card.id ? " graph-node-selected" : ""}`} data-graph-card-id={card.id} aria-pressed={selectedId === card.id} onClick={() => select(card.id)} onFocus={(event) => reveal(event.currentTarget)} style={{ left: x, top: y, width: NODE_WIDTH, height: NODE_HEIGHT }}>
        <span className="graph-level">{card.level}</span><strong>{strings.graphCardLabel(card.key, card.title)}</strong><span>{card.status} <ChangedMarker cardId={card.id} /></span>
        {selectedId === card.id ? <span>{strings.graphSelected}</span> : requires.has(card.id) ? <span>{strings.graphRequires}</span> : requiredBy.has(card.id) ? <span>{strings.graphRequiredBy}</span> : null}
      </button>)}
    </div>
  </div></>;
}
