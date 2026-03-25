import dagre from 'dagre';

interface LayoutNode {
  id: string;
  width: number;
  height: number;
}

interface LayoutEdge {
  source: string;
  target: string;
}

interface LayoutResult {
  id: string;
  x: number;
  y: number;
}

export function computeDagreLayout(
  nodes: LayoutNode[],
  edges: LayoutEdge[],
  direction: 'LR' | 'TB' = 'LR',
): LayoutResult[] {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({
    rankdir: direction,
    nodesep: 60,
    ranksep: 120,
    marginx: 40,
    marginy: 40,
  });

  nodes.forEach((n) => g.setNode(n.id, { width: n.width, height: n.height }));
  edges.forEach((e) => g.setEdge(e.source, e.target));

  dagre.layout(g);

  return nodes.map((n) => {
    const pos = g.node(n.id);
    return { id: n.id, x: pos.x - n.width / 2, y: pos.y - n.height / 2 };
  });
}
