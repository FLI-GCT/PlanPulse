import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { OfNode } from '../of-node';
import { AchatNode } from '../achat-node';
import { DependencyEdge } from './dependency-edge';

const OF_WIDTH = 220;
const OF_HEIGHT = 90;
const ACHAT_WIDTH = 200;
const ACHAT_HEIGHT = 80;

const nodeTypes = {
  ofNode: OfNode,
  achatNode: AchatNode,
};

const edgeTypes = {
  dependencyEdge: DependencyEdge,
};

function buildNodes(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  margins: MarginResult[],
  criticalPath: string[],
): Node[] {
  if (graphNodes.length === 0) return [];

  const criticalSet = new Set(criticalPath);
  const marginMap = new Map(margins.map((m) => [m.nodeId, m]));

  const layoutNodes = graphNodes.map((n) => ({
    id: n.id,
    width: n.type === 'achat' ? ACHAT_WIDTH : OF_WIDTH,
    height: n.type === 'achat' ? ACHAT_HEIGHT : OF_HEIGHT,
  }));

  const layoutEdges = graphEdges.map((e) => ({
    source: e.sourceId,
    target: e.targetId,
  }));

  const positions = computeDagreLayout(layoutNodes, layoutEdges, 'LR');
  const posMap = new Map(positions.map((p) => [p.id, { x: p.x, y: p.y }]));

  return graphNodes.map((gNode) => ({
    id: gNode.id,
    type: gNode.type === 'achat' ? 'achatNode' : 'ofNode',
    position: posMap.get(gNode.id) ?? { x: 0, y: 0 },
    data: {
      ...gNode,
      margin: marginMap.get(gNode.id),
      estCritique: criticalSet.has(gNode.id),
    },
  }));
}

function buildEdges(
  graphEdges: GraphEdge[],
  criticalPath: string[],
  selectedNodeId: string | null,
): Edge[] {
  const criticalSet = new Set(criticalPath);

  return graphEdges.map((e) => {
    const isOnCritical = criticalSet.has(e.sourceId) && criticalSet.has(e.targetId);
    const isSelected =
      selectedNodeId != null && (e.sourceId === selectedNodeId || e.targetId === selectedNodeId);

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
      style: isSelected ? { stroke: 'var(--pp-blue)', strokeWidth: 2 } : undefined,
    };
  });
}

function CommandGraphInner({ ofFinalId }: { ofFinalId: string }) {
  const { data, isLoading, error } = useSubgraphQuery(ofFinalId);
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const selectNode = useUiStore((s) => s.selectNode);
  const { goToFocus } = useGraphNavigation();
  const { fitView } = useReactFlow();

  // Stabiliser les references de donnees avec un ref pour eviter les boucles
  const prevDataRef = useRef<string>('');

  const stableData = useMemo(() => {
    const raw = data ?? { nodes: [], edges: [], margins: [], criticalPath: [] };
    const key = JSON.stringify({ n: raw.nodes?.length, e: raw.edges?.length, id: ofFinalId });
    if (key !== prevDataRef.current) {
      prevDataRef.current = key;
      return {
        nodes: (raw.nodes ?? []) as GraphNode[],
        edges: (raw.edges ?? []) as GraphEdge[],
        margins: (raw.margins ?? []) as MarginResult[],
        criticalPath: (raw.criticalPath ?? []) as string[],
      };
    }
    return null; // signal pas de changement
  }, [data, ofFinalId]);

  const [nodes, setNodes] = useState<Node[]>([]);
  const [edges, setEdges] = useState<Edge[]>([]);

  // Recalculer les noeuds uniquement quand les donnees changent
  useEffect(() => {
    if (!data) return;
    const raw = data as { nodes?: GraphNode[]; edges?: GraphEdge[]; margins?: MarginResult[]; criticalPath?: string[] };
    const gn = raw.nodes ?? [];
    const ge = raw.edges ?? [];
    const gm = raw.margins ?? [];
    const cp = raw.criticalPath ?? [];

    if (gn.length === 0) return;

    setNodes(buildNodes(gn, ge, gm, cp));
    // Fit apres le render
    setTimeout(() => fitView({ padding: 0.3 }), 100);
  }, [data, fitView]);

  // Recalculer les aretes quand la selection change
  useEffect(() => {
    if (!data) return;
    const raw = data as { edges?: GraphEdge[]; criticalPath?: string[] };
    setEdges(buildEdges(raw.edges ?? [], raw.criticalPath ?? [], selectedNodeId));
  }, [data, selectedNodeId]);

  const handlePaneClick = useCallback(() => {
    selectNode(null);
  }, [selectNode]);

  const handleNodeDoubleClick = useCallback(
    (_event: React.MouseEvent, node: Node) => {
      const label = (node.data as GraphNode)?.label ?? node.id;
      goToFocus(node.id, label);
    },
    [goToFocus],
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner />
          <span style={{ color: 'var(--pp-text-secondary)' }}>Chargement du sous-graphe...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span style={{ color: 'var(--pp-red)' }}>Erreur lors du chargement du graphe</span>
      </div>
    );
  }

  if (nodes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <span style={{ color: 'var(--pp-text-secondary)' }}>Aucun noeud dans ce sous-graphe</span>
      </div>
    );
  }

  return (
    <div className="relative flex-1" style={{ minHeight: 0 }}>
      <style>{`
        @keyframes dash-flow {
          to { stroke-dashoffset: -12; }
        }
      `}</style>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        onPaneClick={handlePaneClick}
        onNodeDoubleClick={handleNodeDoubleClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.3 }}
        minZoom={0.2}
        maxZoom={2}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{ type: 'dependencyEdge' }}
        nodesDraggable={false}
        nodesConnectable={false}
        elementsSelectable={false}
      >
        <Controls
          position="bottom-left"
          showInteractive={false}
          style={{ borderColor: 'var(--pp-border)', boxShadow: '0 1px 3px rgba(0,0,0,0.08)' }}
        />
        <MiniMap
          position="bottom-right"
          nodeColor={(node) => {
            if (node.data?.estCritique) return 'var(--pp-red)';
            if (node.type === 'achatNode') return '#8B5CF6';
            return 'var(--pp-blue)';
          }}
          maskColor="rgba(248, 247, 244, 0.7)"
          style={{ borderColor: 'var(--pp-border)', backgroundColor: 'var(--pp-surface)' }}
        />
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="var(--pp-border)" />
      </ReactFlow>
    </div>
  );
}

export function CommandGraph({ ofFinalId }: { ofFinalId: string }) {
  return (
    <ReactFlowProvider>
      <CommandGraphInner ofFinalId={ofFinalId} />
    </ReactFlowProvider>
  );
}
