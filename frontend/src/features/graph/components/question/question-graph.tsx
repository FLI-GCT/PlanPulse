import { useMemo, useCallback } from 'react';
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
import { Badge, cn } from '@fli-dgtf/flow-ui';

import type { GraphNode, GraphEdge } from '@/providers/state/graph-store';
import { useUiStore } from '@/providers/state/ui-store';
import { computeDagreLayout } from '../../utils/dagre-layout';
import { OfNode } from '../of-node';
import { AchatNode } from '../achat-node';
import { DependencyEdge } from '../command/dependency-edge';

// ── Types ─────────────────────────────────────────────────────────
export interface QuestionHighlight {
  nodeId: string;
  role: 'cause' | 'victim' | 'bottleneck' | 'solution';
  label: string;
}

export interface QuestionResponse {
  question: string;
  answer: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
  highlights: QuestionHighlight[];
}

// ── Constants ─────────────────────────────────────────────────────
const OF_WIDTH = 220;
const OF_HEIGHT = 90;
const ACHAT_WIDTH = 200;
const ACHAT_HEIGHT = 80;

// ── Role styling config ───────────────────────────────────────────
const roleStyles: Record<
  QuestionHighlight['role'],
  {
    badgeLabel: string;
    badgeClass: string;
    borderStyle: React.CSSProperties;
  }
> = {
  bottleneck: {
    badgeLabel: 'Goulot',
    badgeClass: 'bg-orange-100 text-orange-800 font-semibold',
    borderStyle: {
      border: '3px solid #F97316',
      boxShadow: '0 0 12px rgba(249, 115, 22, 0.35)',
    },
  },
  cause: {
    badgeLabel: 'Cause',
    badgeClass: 'bg-red-100 text-red-800',
    borderStyle: {
      borderLeft: '5px solid var(--pp-red)',
    },
  },
  victim: {
    badgeLabel: 'Impacte',
    badgeClass: 'bg-gray-100 text-gray-600',
    borderStyle: {
      opacity: 0.75,
    },
  },
  solution: {
    badgeLabel: 'Solution',
    badgeClass: 'bg-green-100 text-green-800',
    borderStyle: {
      border: '2px solid var(--pp-green)',
    },
  },
};

// ── Custom node wrapper for highlights ───────────────────────────
function HighlightWrapper({
  children,
  highlight,
}: {
  children: React.ReactNode;
  highlight: QuestionHighlight | undefined;
}) {
  if (!highlight) return <>{children}</>;

  const style = roleStyles[highlight.role];

  return (
    <div className="relative" style={style.borderStyle}>
      {children}
      {/* Role badge */}
      <div className="absolute -top-3.5 left-1/2 z-10 -translate-x-1/2">
        <Badge
          className={cn(
            'whitespace-nowrap px-2 py-0.5 text-[10px] shadow-sm',
            style.badgeClass,
          )}
        >
          {style.badgeLabel}
        </Badge>
      </div>
      {/* Detail label */}
      {highlight.label && (
        <div className="absolute -bottom-5 left-1/2 z-10 -translate-x-1/2">
          <span
            className="whitespace-nowrap rounded bg-white/90 px-1.5 py-0.5 text-[9px] font-medium shadow-sm"
            style={{ color: 'var(--pp-navy)' }}
          >
            {highlight.label}
          </span>
        </div>
      )}
    </div>
  );
}

// ── Node type registries ──────────────────────────────────────────
const nodeTypes = {
  ofNode: OfNode,
  achatNode: AchatNode,
};

const edgeTypes = {
  dependencyEdge: DependencyEdge,
};

// ── Build layout ──────────────────────────────────────────────────
function buildFlowNodes(
  graphNodes: GraphNode[],
  graphEdges: GraphEdge[],
  highlights: QuestionHighlight[],
): Node[] {
  if (graphNodes.length === 0) return [];

  const highlightMap = new Map(highlights.map((h) => [h.nodeId, h]));

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

  return graphNodes.map((gNode) => {
    const highlight = highlightMap.get(gNode.id);
    const pos = posMap.get(gNode.id) ?? { x: 0, y: 0 };

    return {
      id: gNode.id,
      type: gNode.type === 'achat' ? 'achatNode' : 'ofNode',
      position: pos,
      data: {
        ...gNode,
        margin: undefined,
        estCritique: highlight?.role === 'bottleneck',
      },
      style: highlight ? roleStyles[highlight.role].borderStyle : undefined,
    };
  });
}

function buildFlowEdges(graphEdges: GraphEdge[]): Edge[] {
  return graphEdges.map((e) => ({
    id: `${e.sourceId}-${e.targetId}`,
    source: e.sourceId,
    target: e.targetId,
    type: 'dependencyEdge',
    data: {
      typeLien: e.typeLien,
      estCritique: false,
      quantite: e.quantite,
    },
  }));
}

// ── Inner graph component ─────────────────────────────────────────
function QuestionGraphInner({
  questionResponse,
}: {
  questionResponse: QuestionResponse;
}) {
  const { nodes: graphNodes, edges: graphEdges, highlights } = questionResponse;
  const selectNode = useUiStore((s) => s.selectNode);

  const highlightMap = useMemo(
    () => new Map(highlights.map((h) => [h.nodeId, h])),
    [highlights],
  );

  const flowNodes = useMemo(
    () => buildFlowNodes(graphNodes, graphEdges, highlights),
    [graphNodes, graphEdges, highlights],
  );

  const flowEdges = useMemo(
    () => buildFlowEdges(graphEdges),
    [graphEdges],
  );

  const [nodes, , onNodesChange] = useNodesState(flowNodes);
  const [edges, , onEdgesChange] = useEdgesState(flowEdges);

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

  return (
    <div className="relative flex-1" style={{ minHeight: 0 }}>
      {/* Highlight badges overlay (rendered outside of ReactFlow canvas) */}
      <ReactFlow
        nodes={displayNodes}
        edges={flowEdges}
        onNodesChange={onNodesChange as OnNodesChange<Node>}
        onEdgesChange={onEdgesChange as OnEdgesChange<Edge>}
        onPaneClick={handlePaneClick}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        fitView
        fitViewOptions={{ padding: 0.4 }}
        minZoom={0.2}
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
            const h = highlightMap.get(node.id);
            if (h?.role === 'bottleneck') return '#F97316';
            if (h?.role === 'cause') return 'var(--pp-red)';
            if (h?.role === 'solution') return 'var(--pp-green)';
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

      {/* Legend */}
      {highlights.length > 0 && (
        <div
          className="absolute top-3 left-3 z-10 flex flex-col gap-1.5 rounded-lg border p-3 text-xs shadow-sm"
          style={{
            backgroundColor: 'var(--pp-surface)',
            borderColor: 'var(--pp-border)',
          }}
        >
          <span
            className="mb-0.5 text-[10px] font-semibold uppercase tracking-wide"
            style={{ color: 'var(--pp-text-secondary)' }}
          >
            Legende
          </span>
          {highlights.some((h) => h.role === 'bottleneck') && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm border-2" style={{ borderColor: '#F97316', backgroundColor: '#FFF7ED' }} />
              <span style={{ color: 'var(--pp-navy)' }}>Goulot</span>
            </div>
          )}
          {highlights.some((h) => h.role === 'cause') && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm border-l-[3px]" style={{ borderColor: 'var(--pp-red)', backgroundColor: '#FEF2F2' }} />
              <span style={{ color: 'var(--pp-navy)' }}>Cause</span>
            </div>
          )}
          {highlights.some((h) => h.role === 'victim') && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm" style={{ backgroundColor: '#F3F4F6', opacity: 0.75 }} />
              <span style={{ color: 'var(--pp-navy)' }}>Impacte</span>
            </div>
          )}
          {highlights.some((h) => h.role === 'solution') && (
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-sm border-2" style={{ borderColor: 'var(--pp-green)', backgroundColor: '#F0FDF4' }} />
              <span style={{ color: 'var(--pp-navy)' }}>Solution</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Export with ReactFlowProvider ──────────────────────────────────
export function QuestionGraph({
  questionResponse,
}: {
  questionResponse: QuestionResponse;
}) {
  return (
    <ReactFlowProvider>
      <QuestionGraphInner questionResponse={questionResponse} />
    </ReactFlowProvider>
  );
}
