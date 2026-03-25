import { useCallback, useMemo } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  ReactFlowProvider,
  useNodesState,
  useEdgesState,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
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

// ── Sizes per depth ──────────────────────────────────────────────
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

// ── Type registries ──────────────────────────────────────────────
const nodeTypes = {
  focusCenter: FocusCenterNode,
  focusNeighbor: FocusNeighborNode,
  focusDistant: FocusDistantNode,
};

const edgeTypes = {
  dependencyEdge: DependencyEdge,
};

// ── BFS depth assignment ─────────────────────────────────────────
function computeDepths(
  focusId: string,
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, number> {
  const depths = new Map<string, number>();
  const nodeSet = new Set(nodes.map((n) => n.id));

  // Build adjacency list (both directions)
  const adjacency = new Map<string, string[]>();
  for (const e of edges) {
    if (!nodeSet.has(e.sourceId) || !nodeSet.has(e.targetId)) continue;
    if (!adjacency.has(e.sourceId)) adjacency.set(e.sourceId, []);
    if (!adjacency.has(e.targetId)) adjacency.set(e.targetId, []);
    adjacency.get(e.sourceId)!.push(e.targetId);
    adjacency.get(e.targetId)!.push(e.sourceId);
  }

  // BFS from focusId
  depths.set(focusId, 0);
  const queue = [focusId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    const currentDepth = depths.get(current)!;
    const neighbors = adjacency.get(current) ?? [];
    for (const neighbor of neighbors) {
      if (!depths.has(neighbor)) {
        depths.set(neighbor, currentDepth + 1);
        queue.push(neighbor);
      }
    }
  }

  return depths;
}

// ── Build xyflow nodes ───────────────────────────────────────────
function buildFocusNodes(
  focusId: string,
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  margins: MarginResult[],
  criticalPath: string[],
): Node[] {
  if (graphNodes.length === 0) return [];

  const depths = computeDepths(focusId, graphNodes, graphEdges);
  const criticalSet = new Set(criticalPath);
  const marginMap = new Map(margins.map((m) => [m.nodeId, m]));

  // Only keep nodes with an assigned depth (reachable from focus)
  const reachableNodes = graphNodes.filter((n) => depths.has(n.id));

  const layoutNodes = reachableNodes.map((n) => {
    const depth = Math.min(depths.get(n.id) ?? 2, 2);
    const size = SIZE_BY_DEPTH[depth] ?? SIZE_BY_DEPTH[2];
    return { id: n.id, width: size.width, height: size.height };
  });

  const layoutEdges = graphEdges
    .filter((e) => depths.has(e.sourceId) && depths.has(e.targetId))
    .map((e) => ({ source: e.sourceId, target: e.targetId }));

  const positions = computeDagreLayout(layoutNodes, layoutEdges, 'LR');
  const posMap = new Map(positions.map((p) => [p.id, { x: p.x, y: p.y }]));

  return reachableNodes.map((gNode) => {
    const depth = Math.min(depths.get(gNode.id) ?? 2, 2);
    const margin = marginMap.get(gNode.id);
    const estCritique = criticalSet.has(gNode.id);
    const pos = posMap.get(gNode.id) ?? { x: 0, y: 0 };
    const nodeType = NODE_TYPE_BY_DEPTH[depth] ?? 'focusDistant';

    return {
      id: gNode.id,
      type: nodeType,
      position: pos,
      data: {
        ...gNode,
        margin,
        estCritique,
      },
    };
  });
}

// ── Build xyflow edges ───────────────────────────────────────────
function buildFocusEdges(
  graphEdges: GraphEdge[],
  criticalPath: string[],
  selectedNodeId: string | null,
  reachableIds: Set<string>,
): Edge[] {
  const criticalSet = new Set(criticalPath);

  return graphEdges
    .filter((e) => reachableIds.has(e.sourceId) && reachableIds.has(e.targetId))
    .map((e) => {
      const isOnCritical =
        criticalSet.has(e.sourceId) && criticalSet.has(e.targetId);
      const isConnectedToSelected =
        selectedNodeId != null &&
        (e.sourceId === selectedNodeId || e.targetId === selectedNodeId);

      return {
        id: `${e.sourceId}-${e.targetId}`,
        source: e.sourceId,
        target: e.targetId,
        type: 'dependencyEdge',
        data: {
          typeLien: e.typeLien,
          estCritique: isOnCritical,
          quantite: e.quantite,
        },
        style: isConnectedToSelected
          ? { stroke: 'var(--pp-blue)', strokeWidth: 2 }
          : undefined,
      };
    });
}

// ── Inner graph (needs ReactFlowProvider) ────────────────────────
function FocusGraphInner({ focusNodeId }: { focusNodeId: string }) {
  const { data, isLoading, error } = useSubgraphQuery(focusNodeId, 2, 'both');
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const selectNode = useUiStore((s) => s.selectNode);
  const { goToFocus } = useGraphNavigation();

  const graphNodes: GraphNode[] = data?.nodes ?? [];
  const graphEdges: GraphEdge[] = data?.edges ?? [];
  const margins: MarginResult[] = data?.margins ?? [];
  const criticalPath: string[] = data?.criticalPath ?? [];

  const flowNodes = useMemo(
    () => buildFocusNodes(focusNodeId, graphNodes, graphEdges, margins, criticalPath),
    [focusNodeId, graphNodes, graphEdges, margins, criticalPath],
  );

  const reachableIds = useMemo(
    () => new Set(flowNodes.map((n) => n.id)),
    [flowNodes],
  );

  const flowEdges = useMemo(
    () => buildFocusEdges(graphEdges, criticalPath, selectedNodeId, reachableIds),
    [graphEdges, criticalPath, selectedNodeId, reachableIds],
  );

  const [nodes, , onNodesChange] = useNodesState(flowNodes);
  const [edges, , onEdgesChange] = useEdgesState(flowEdges);

  // Merge latest data with existing positions for smooth transitions
  const displayNodes = useMemo(() => {
    if (flowNodes.length === 0) return nodes;
    const posMap = new Map(nodes.map((n) => [n.id, n.position]));
    return flowNodes.map((fn) => ({
      ...fn,
      position: posMap.get(fn.id) ?? fn.position,
    }));
  }, [flowNodes, nodes]);

  const handlePaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const handleNodeClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      // Clicking a non-focus node navigates to it as new focus
      if (node.id !== focusNodeId) {
        const label = (node.data as GraphNode)?.label ?? node.id;
        goToFocus(node.id, label);
      }
    },
    [focusNodeId, goToFocus],
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner />
          <span style={{ color: 'var(--pp-text-secondary)' }}>
            Chargement de la vue focus...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span style={{ color: 'var(--pp-red)' }}>
          Erreur lors du chargement du sous-graphe
        </span>
      </div>
    );
  }

  if (graphNodes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span style={{ color: 'var(--pp-text-secondary)' }}>
          Aucun noeud dans ce sous-graphe
        </span>
      </div>
    );
  }

  return (
    <div className="relative flex-1" style={{ minHeight: 0 }}>
      {/* CSS animation for critical path edges */}
      <style>{`
        @keyframes dash-flow {
          to { stroke-dashoffset: -12; }
        }
      `}</style>

      <ReactFlow
        nodes={displayNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange as OnNodesChange<Node>}
        onEdgesChange={onEdgesChange as OnEdgesChange<Edge>}
        onPaneClick={handlePaneClick}
        onNodeClick={handleNodeClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.4 }}
        minZoom={0.3}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'dependencyEdge' }}
      >
        <Controls
          position="bottom-left"
          showInteractive={false}
          style={{
            borderColor: 'var(--pp-border)',
            boxShadow: '0 1px 3px rgba(0,0,0,0.08)',
          }}
        />
        <MiniMap
          position="bottom-right"
          nodeColor={(node) => {
            if (node.type === 'focusCenter') return 'var(--pp-blue)';
            if (node.data?.estCritique) return 'var(--pp-red)';
            return '#94A3B8';
          }}
          maskColor="rgba(248, 247, 244, 0.7)"
          style={{
            borderColor: 'var(--pp-border)',
            backgroundColor: 'var(--pp-surface)',
          }}
        />
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          color="var(--pp-border)"
        />
      </ReactFlow>
    </div>
  );
}

// ── Export wrapped with provider ──────────────────────────────────
export function FocusGraph({ focusNodeId }: { focusNodeId: string }) {
  return (
    <ReactFlowProvider>
      <FocusGraphInner focusNodeId={focusNodeId} />
    </ReactFlowProvider>
  );
}
