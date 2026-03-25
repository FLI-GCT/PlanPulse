import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ReactFlow,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  useNodesState,
  useEdgesState,
  ReactFlowProvider,
  type Node,
  type Edge,
  type OnNodesChange,
  type OnEdgesChange,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';

import { useGraphStore, type GraphNode, type GraphEdge, type MarginResult } from '@/providers/state/graph-store';
import { useUiStore } from '@/providers/state/ui-store';
import { OfNode } from './of-node';
import { AchatNode } from './achat-node';
import { GraphToolbar } from './graph-toolbar';

// ── Node type registry ────────────────────────────────────────────
const nodeTypes = {
  ofNode: OfNode,
  achatNode: AchatNode,
};

// ── BFS layout algorithm ──────────────────────────────────────────
function computeBfsLayout(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  margins: MarginResult[],
  criticalPath: string[],
): Node[] {
  if (graphNodes.length === 0) return [];

  const criticalSet = new Set(criticalPath);
  const marginMap = new Map(margins.map((m) => [m.nodeId, m]));

  // Build adjacency: source -> targets
  const successors = new Map<string, string[]>();
  const predecessors = new Map<string, string[]>();
  for (const node of graphNodes) {
    successors.set(node.id, []);
    predecessors.set(node.id, []);
  }
  for (const edge of graphEdges) {
    successors.get(edge.sourceId)?.push(edge.targetId);
    predecessors.get(edge.targetId)?.push(edge.sourceId);
  }

  // Find root nodes (no predecessors)
  const roots = graphNodes.filter(
    (n) => (predecessors.get(n.id)?.length ?? 0) === 0,
  );

  // BFS to assign depth levels
  const depthMap = new Map<string, number>();
  const visited = new Set<string>();
  const queue: Array<{ id: string; depth: number }> = [];

  for (const root of roots) {
    queue.push({ id: root.id, depth: 0 });
    depthMap.set(root.id, 0);
    visited.add(root.id);
  }

  // If there are orphaned nodes (in cycles or no roots), add them at depth 0
  if (roots.length === 0) {
    const first = graphNodes[0];
    queue.push({ id: first.id, depth: 0 });
    depthMap.set(first.id, 0);
    visited.add(first.id);
  }

  while (queue.length > 0) {
    const { id, depth } = queue.shift()!;
    const children = successors.get(id) ?? [];
    for (const childId of children) {
      const existingDepth = depthMap.get(childId);
      const newDepth = depth + 1;
      // Always take the maximum depth to ensure parents are before children
      if (existingDepth === undefined || newDepth > existingDepth) {
        depthMap.set(childId, newDepth);
      }
      if (!visited.has(childId)) {
        visited.add(childId);
        queue.push({ id: childId, depth: newDepth });
      }
    }
  }

  // Handle any nodes not reached by BFS (disconnected components)
  for (const node of graphNodes) {
    if (!depthMap.has(node.id)) {
      depthMap.set(node.id, 0);
    }
  }

  // Group nodes by depth level
  const levels = new Map<number, GraphNode[]>();
  for (const node of graphNodes) {
    const depth = depthMap.get(node.id) ?? 0;
    if (!levels.has(depth)) {
      levels.set(depth, []);
    }
    levels.get(depth)!.push(node);
  }

  // Convert to React Flow nodes with positions
  const X_GAP = 280;
  const Y_GAP = 100;

  const flowNodes: Node[] = [];
  for (const [depth, nodesAtLevel] of levels.entries()) {
    for (let i = 0; i < nodesAtLevel.length; i++) {
      const gNode = nodesAtLevel[i];
      const margin = marginMap.get(gNode.id);
      const estCritique = criticalSet.has(gNode.id);

      flowNodes.push({
        id: gNode.id,
        type: gNode.type === 'achat' ? 'achatNode' : 'ofNode',
        position: {
          x: depth * X_GAP,
          y: i * Y_GAP,
        },
        data: {
          ...gNode,
          margin,
          estCritique,
        },
      });
    }
  }

  return flowNodes;
}

// ── Edge conversion ───────────────────────────────────────────────
function convertEdges(
  graphEdges: GraphEdge[],
  criticalPath: string[],
  selectedNodeId: string | null,
  highlightedNodes: Set<string>,
): Edge[] {
  const criticalSet = new Set(criticalPath);

  return graphEdges.map((e) => {
    const isOnCritical =
      criticalSet.has(e.sourceId) && criticalSet.has(e.targetId);
    const isConnectedToSelected =
      selectedNodeId != null &&
      (e.sourceId === selectedNodeId || e.targetId === selectedNodeId);
    const isHighlighted =
      highlightedNodes.size > 0 &&
      highlightedNodes.has(e.sourceId) &&
      highlightedNodes.has(e.targetId);

    let strokeColor = '#B0AFA8';
    if (isConnectedToSelected) strokeColor = 'var(--pp-blue)';
    if (isHighlighted) strokeColor = 'var(--pp-blue)';
    if (isOnCritical) strokeColor = 'var(--pp-red)';

    const isDashed = e.typeLien === 'PARTAGE';

    return {
      id: `${e.sourceId}-${e.targetId}`,
      source: e.sourceId,
      target: e.targetId,
      type: 'smoothstep',
      animated: isOnCritical,
      style: {
        stroke: strokeColor,
        strokeWidth: isOnCritical || isConnectedToSelected ? 2 : 1.5,
        strokeDasharray: isDashed ? '6 3' : undefined,
      },
    };
  });
}

// ── Graph traversal helpers ───────────────────────────────────────
function getDescendants(
  startId: string,
  graphEdges: GraphEdge[],
): Set<string> {
  const successors = new Map<string, string[]>();
  for (const e of graphEdges) {
    if (!successors.has(e.sourceId)) successors.set(e.sourceId, []);
    successors.get(e.sourceId)!.push(e.targetId);
  }

  const result = new Set<string>();
  const queue = [startId];
  result.add(startId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of successors.get(current) ?? []) {
      if (!result.has(child)) {
        result.add(child);
        queue.push(child);
      }
    }
  }

  return result;
}

function getAncestors(
  startId: string,
  graphEdges: GraphEdge[],
): Set<string> {
  const predecessors = new Map<string, string[]>();
  for (const e of graphEdges) {
    if (!predecessors.has(e.targetId)) predecessors.set(e.targetId, []);
    predecessors.get(e.targetId)!.push(e.sourceId);
  }

  const result = new Set<string>();
  const queue = [startId];
  result.add(startId);

  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const parent of predecessors.get(current) ?? []) {
      if (!result.has(parent)) {
        result.add(parent);
        queue.push(parent);
      }
    }
  }

  return result;
}

// ── Inner canvas (needs ReactFlowProvider ancestor) ───────────────
function DagCanvasInner() {
  const graphNodes = useGraphStore((s) => s.nodes);
  const graphEdges = useGraphStore((s) => s.edges);
  const criticalPath = useGraphStore((s) => s.criticalPath);
  const margins = useGraphStore((s) => s.margins);
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const selectNode = useUiStore((s) => s.selectNode);

  const [highlightedNodes, setHighlightedNodes] = useState<Set<string>>(
    new Set(),
  );
  const [highlightMode, setHighlightMode] = useState<
    'none' | 'impact' | 'ancestors'
  >('none');

  // Compute layout once when graph data changes
  const initialFlowNodes = useMemo(
    () => computeBfsLayout(graphNodes, graphEdges, margins, criticalPath),
    [graphNodes, graphEdges, margins, criticalPath],
  );

  // Compute edges reactively when selection or highlights change
  const flowEdges = useMemo(
    () =>
      convertEdges(graphEdges, criticalPath, selectedNodeId, highlightedNodes),
    [graphEdges, criticalPath, selectedNodeId, highlightedNodes],
  );

  const [nodes, setNodes, onNodesChange] = useNodesState(initialFlowNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(flowEdges);

  // Keep edges in sync with store changes
  useEffect(() => {
    setEdges(flowEdges);
  }, [flowEdges, setEdges]);

  // Keep nodes in sync when graph data changes
  useEffect(() => {
    setNodes(initialFlowNodes);
  }, [initialFlowNodes, setNodes]);

  // Apply dimming to non-highlighted nodes
  const displayNodes = useMemo(() => {
    if (highlightedNodes.size === 0) return nodes;
    return nodes.map((n) => ({
      ...n,
      style: {
        ...n.style,
        opacity: highlightedNodes.has(n.id) ? 1 : 0.25,
        transition: 'opacity 0.2s ease',
      },
    }));
  }, [nodes, highlightedNodes]);

  const displayEdges = useMemo(() => {
    if (highlightedNodes.size === 0) return edges;
    return edges.map((e) => ({
      ...e,
      style: {
        ...e.style,
        opacity:
          highlightedNodes.has(e.source) && highlightedNodes.has(e.target)
            ? 1
            : 0.1,
        transition: 'opacity 0.2s ease',
      },
    }));
  }, [edges, highlightedNodes]);

  const handlePaneClick = useCallback(() => {
    selectNode(null);
    setHighlightedNodes(new Set());
    setHighlightMode('none');
  }, [selectNode]);

  const handleHighlightImpact = useCallback(() => {
    if (!selectedNodeId) return;
    const descendants = getDescendants(selectedNodeId, graphEdges);
    setHighlightedNodes(descendants);
    setHighlightMode('impact');
  }, [selectedNodeId, graphEdges]);

  const handleHighlightAncestors = useCallback(() => {
    if (!selectedNodeId) return;
    const ancestors = getAncestors(selectedNodeId, graphEdges);
    setHighlightedNodes(ancestors);
    setHighlightMode('ancestors');
  }, [selectedNodeId, graphEdges]);

  const handleClearHighlight = useCallback(() => {
    setHighlightedNodes(new Set());
    setHighlightMode('none');
  }, []);

  return (
    <div className="flex flex-1 flex-col" style={{ minHeight: 0 }}>
      <div className="shrink-0 px-6 py-2">
        <GraphToolbar
          highlightedNodes={highlightedNodes}
          highlightMode={highlightMode}
          onHighlightImpact={handleHighlightImpact}
          onHighlightAncestors={handleHighlightAncestors}
          onClearHighlight={handleClearHighlight}
        />
      </div>

      <div className="relative flex-1" style={{ minHeight: 0 }}>
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          onNodesChange={onNodesChange as OnNodesChange<Node>}
          onEdgesChange={onEdgesChange as OnEdgesChange<Edge>}
          onPaneClick={handlePaneClick}
          nodeTypes={nodeTypes}
          fitView
          fitViewOptions={{ padding: 0.2 }}
          minZoom={0.1}
          maxZoom={2}
          proOptions={{ hideAttribution: true }}
          defaultEdgeOptions={{ type: 'smoothstep' }}
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
              if (node.data?.estCritique) return 'var(--pp-red)';
              if (node.type === 'achatNode') return '#8B5CF6';
              return 'var(--pp-blue)';
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
    </div>
  );
}

// ── Export wrapped with provider ──────────────────────────────────
export function DagCanvas() {
  return (
    <ReactFlowProvider>
      <DagCanvasInner />
    </ReactFlowProvider>
  );
}
