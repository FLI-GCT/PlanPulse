import { useMemo } from 'react';
import type { ScaleTime } from 'd3-scale';
import { parseISO } from 'date-fns';

import type { GraphNode, GraphEdge } from '@/providers/state/graph-store';
import type { RowData } from '@/features/gantt/gantt-layout';
import { ROW_HEIGHT } from '@/features/gantt/gantt-layout';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GanttDependenciesProps {
  rows: RowData[];
  nodes: GraphNode[];
  edges: GraphEdge[];
  xScale: ScaleTime<number, number>;
  selectedNodeId: string | null;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GanttDependencies({
  rows,
  nodes,
  edges,
  xScale,
  selectedNodeId,
}: GanttDependenciesProps) {
  const dependencyLines = useMemo(() => {
    if (!selectedNodeId) return [];

    const nodeMap = new Map(nodes.map((n) => [n.id, n]));
    const rowIndexMap = new Map(rows.map((r, i) => [r.node.id, i]));
    const lines: { x1: number; y1: number; x2: number; y2: number }[] = [];

    for (const edge of edges) {
      const isRelevant =
        (edge.sourceId === selectedNodeId || edge.targetId === selectedNodeId) &&
        edge.sourceType === 'of' &&
        edge.targetType === 'of';

      if (!isRelevant) continue;

      const sourceNode = nodeMap.get(edge.sourceId);
      const targetNode = nodeMap.get(edge.targetId);
      const sourceRow = rowIndexMap.get(edge.sourceId);
      const targetRow = rowIndexMap.get(edge.targetId);

      if (!sourceNode || !targetNode || sourceRow === undefined || targetRow === undefined) continue;

      // Line from end of target bar to start of source bar
      // (target feeds into source in NOMENCLATURE edges)
      const x1 = xScale(parseISO(targetNode.dateFin));
      const y1 = targetRow * ROW_HEIGHT + ROW_HEIGHT / 2;
      const x2 = xScale(parseISO(sourceNode.dateDebut));
      const y2 = sourceRow * ROW_HEIGHT + ROW_HEIGHT / 2;

      lines.push({ x1, y1, x2, y2 });
    }

    return lines;
  }, [selectedNodeId, nodes, edges, rows, xScale]);

  if (dependencyLines.length === 0) return null;

  return (
    <g>
      {dependencyLines.map((line, i) => {
        const midX = (line.x1 + line.x2) / 2;
        return (
          <path
            key={`dep-${i}`}
            d={`M ${line.x1} ${line.y1} C ${midX} ${line.y1}, ${midX} ${line.y2}, ${line.x2} ${line.y2}`}
            fill="none"
            stroke="var(--pp-text-secondary)"
            strokeWidth={1.5}
            strokeDasharray="4 3"
            opacity={0.5}
          />
        );
      })}
    </g>
  );
}
