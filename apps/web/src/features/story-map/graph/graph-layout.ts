import { graphlib, layout } from "@dagrejs/dagre";
import type { GraphModel } from "@storymapper/web/features/story-map/graph/graph-model";

export const NODE_WIDTH = 240;
export const NODE_HEIGHT = 150;
export function layoutGraph(model: GraphModel) {
  const start = performance.now();
  const graph = new graphlib.Graph().setGraph({ rankdir: "LR", nodesep: 28, ranksep: 90, marginx: 24, marginy: 24 }).setDefaultEdgeLabel(() => ({}));
  for (const card of model.cards) graph.setNode(card.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  for (const edge of model.edges) graph.setEdge(edge.cardId, edge.prerequisiteCardId);
  layout(graph);
  return { nodes: model.cards.map((card) => ({ card, x: graph.node(card.id).x - NODE_WIDTH / 2, y: graph.node(card.id).y - NODE_HEIGHT / 2 })),
    edges: model.edges.map((edge) => ({ ...edge, points: graph.edge(edge.cardId, edge.prerequisiteCardId).points as { x: number; y: number }[] })),
    width: graph.graph().width ?? 0, height: graph.graph().height ?? 0, duration: performance.now() - start };
}
export type GraphLayout = ReturnType<typeof layoutGraph>;
