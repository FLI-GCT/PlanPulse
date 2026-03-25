import { useCallback, useEffect, useState } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  useReactFlow,
  type Node,
  type Edge,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { Spinner } from '@fli-dgtf/flow-ui';

import { useSubgraphQuery } from '@/providers/api/graph';
import { useUiStore } from '@/providers/state/ui-store';
import type { GraphNode, GraphEdge, MarginResult } from '@/providers/state/graph-store';
import { computeDagreLayout } from '../../utils/dagre-layout';
import { useGraphNavigation } from '../../hooks/use-graph-navigation';
import { FocusCenterNode } from './focus-center-node';
import { FocusNeighborNode } from './focus-neighbor-node';
import { FocusDistantNode } from './focus-distant-node';
import { DependencyEdge } from '../command/dependency-edge';

const SIZE_BY_DEPTH: Record<number, { width: number; height: number }> = {
  0: { width: 280, height: 120 },
  1: { width: 220, height: 90 },
  2: { width: 160, height: 60 },
};

const NODE_TYPE_BY_DEPTH: Record<number, string> = {
  0: 'focusCenter',
  1: 'focusNeighbor',
  2: 'focusDistant',
};

const nodeTypes = {
  focusCenter: FocusCenterNode,
  focusNeighbor: FocusNeighborNode,
  focusDistant: FocusDistantNode,
};

const edgeTypes = {
  dependencyEdge: DependencyEdge,
};

function computeDepths(focusId: string, nodes: GraphNode[], edges: GraphEdge[]): Map<string, number> {
  const depths = new Map<string, number>();
  const nodeSet = new Set(nodes.map((n) => n.id));
  const adjacency = new Map<string, string[]>();

  for (const e of edges) {
    if (!nodeSet.has(e.sourceId) || !nodeSet.has(e.targetId)) continue;
    if (!adjacency.has(e.sourceId)) adjacency.set(e.sourceId, []);
    if (!adjacency.has(e.targetId)) adjacency.set(e.targetId, []);
    adjacency.get(e.sourceId)!.push(e.targetId);
    adjacency.get(e.targetId)!.push(e.sourceId);
  }

  depths.set(focusId, 0);
  const queue = [focusId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depths.get(current)!;
    for (const neighbor of adjacency.get(current) ?? []) {
      if (!depths.has(neighbor)) {
        depths.set(neighbor, currentDepth + 1);
        queue.push(neighbor);
      }
    }
  }
  return depths;
}

function FocusGraphInner({ focusNodeId }: { focusNodeId: string }) {
  const { data, isLoading, error } = useSubgraphQuery(focusNodeId, 2, 'both');
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const selectNode = useUiStore((s) => s.selectNode);
  const { goToFocus } = useGraphNavigation();
  const { fitView } = useReactFlow();

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  useEffect(() => {
    if (!data) return;
    const gn: GraphNode[] = data.nodes ?? [];
    const ge: GraphEdge[] = data.edges ?? [];
    const gm: MarginResult[] = data.margins ?? [];
    const cp: string[] = data.criticalPath ?? [];

    if (gn.length === 0) return;

    const depths = computeDepths(focusNodeId, gn, ge);
    const criticalSet = new Set(cp);
    const marginMap = new Map(gm.map((m) => [m.nodeId, m]));
    const reachable = gn.filter((n) => depths.has(n.id));

    const layoutNodes = reachable.map((n) => {
      const depth = Math.min(depths.get(n.id) ?? 2, 2);
      const size = SIZE_BY_DEPTH[depth] ?? SIZE_BY_DEPTH[2];
      return { id: n.id, width: size.width, height: size.height };
    });
    const layoutEdges = ge
      .filter((e) => depths.has(e.sourceId) && depths.has(e.targetId))
      .map((e) => ({ source: e.sourceId, target: e.targetId }));

    const positions = computeDagreLayout(layoutNodes, layoutEdges, 'LR');
    const posMap = new Map(positions.map((p) => [p.id, { x: p.x, y: p.y }]));

    setNodes(
      reachable.map((gNode) => {
        const depth = Math.min(depths.get(gNode.id) ?? 2, 2);
        return {
          id: gNode.id,
          type: NODE_TYPE_BY_DEPTH[depth] ?? 'focusDistant',
          position: posMap.get(gNode.id) ?? { x: 0, y: 0 },
          data: { ...gNode, margin: marginMap.get(gNode.id), estCritique: criticalSet.has(gNode.id) },
        };
      }),
    );

    const reachableIds = new Set(reachable.map((n) => n.id));
    setEdges(
      ge
        .filter((e) => reachableIds.has(e.sourceId) && reachableIds.has(e.targetId))
        .map((e) => ({
          id: `${e.sourceId}-${e.targetId}`,
          source: e.sourceId,
          target: e.targetId,
          type: 'dependencyEdge',
          data: { typeLien: e.typeLien, estCritique: criticalSet.has(e.sourceId) && criticalSet.has(e.targetId), quantite: e.quantite },
        })),
    );

    setTimeout(() => fitView({ padding: 0.4 }), 100);
  }, [data, focusNodeId, fitView]);

  const handlePaneClick = useCallback(() => selectNode(null), [selectNode]);
  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      if (node.id !== focusNodeId) {
        goToFocus(node.id, (node.data as GraphNode)?.label ?? node.id);
      }
    },
    [focusNodeId, goToFocus],
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  if (error || nodes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span style={{ color: 'var(--pp-text-secondary)' }}>
          {error ? 'Erreur de chargement' : 'Aucun noeud'}
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex-1" style={{ minHeight: 0 }}>
      <style>{`@keyframes dash-flow { to { stroke-dashoffset: -12; } }`}</style>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onPaneClick={handlePaneClick}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.4 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Controls position="bottom-left" showInteractive={false} />
        <MiniMap position="bottom-right" nodeColor={(node) => node.type === 'focusCenter' ? 'var(--pp-blue)' : '#94A3B8'} />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--pp-border)" />
      </ReactFlow>
    </div>
  );
}

export function FocusGraph({ focusNodeId }: { focusNodeId: string }) {
  return (
    <ReactFlowProvider>
      <FocusGraphInner focusNodeId={focusNodeId} />
    </ReactFlowProvider>
  );
}
