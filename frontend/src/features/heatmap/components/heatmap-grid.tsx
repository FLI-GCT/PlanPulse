import { useCallback, useMemo, useRef, useState } from 'react';
import {
  startOfWeek,
  endOfWeek,
  addWeeks,
  addDays,
  format,
  startOfDay,
  endOfDay,
  parseISO,
  getISOWeek,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import type { GraphNode, MarginResult } from '@/providers/state/graph-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TimeBucket = 'week' | 'day';
export type GroupBy = 'client' | 'priorite' | 'statut';

interface HeatmapGridProps {
  nodes: GraphNode[];
  margins: MarginResult[];
  timeBucket: TimeBucket;
  groupBy: GroupBy;
}

interface CellData {
  ofIds: string[];
  avgFloat: number | null;
  floats: { nodeId: string; floatTotal: number }[];
}

interface TooltipState {
  x: number;
  y: number;
  cell: CellData;
  colLabel: string;
  rowLabel: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WEEKS_SPAN = 6;

function buildTimeBuckets(bucket: TimeBucket): { label: string; start: Date; end: Date }[] {
  const today = new Date();
  const buckets: { label: string; start: Date; end: Date }[] = [];

  if (bucket === 'week') {
    for (let i = 0; i < WEEKS_SPAN; i++) {
      const weekStart = startOfWeek(addWeeks(today, i), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(addWeeks(today, i), { weekStartsOn: 1 });
      buckets.push({
        label: `S${getISOWeek(weekStart)} - ${format(weekStart, 'dd/MM', { locale: fr })}`,
        start: weekStart,
        end: weekEnd,
      });
    }
  } else {
    // 6 weeks = 42 days
    for (let i = 0; i < WEEKS_SPAN * 7; i++) {
      const day = addDays(today, i);
      buckets.push({
        label: format(day, 'EEE dd/MM', { locale: fr }),
        start: startOfDay(day),
        end: endOfDay(day),
      });
    }
  }
  return buckets;
}

function getGroupKey(node: GraphNode, groupBy: GroupBy): string {
  switch (groupBy) {
    case 'client':
      // Use articleId as a rough client/product grouping
      return node.articleId ?? 'Sans article';
    case 'priorite':
      return node.priorite != null ? `P${node.priorite}` : 'Non definie';
    case 'statut':
      return node.statut || 'Inconnu';
  }
}

function getGroupLabel(groupBy: GroupBy): string {
  switch (groupBy) {
    case 'client':
      return 'Article';
    case 'priorite':
      return 'Priorite';
    case 'statut':
      return 'Statut';
  }
}

function floatToColor(avgFloat: number | null): string {
  if (avgFloat === null) return '#E5E3DC'; // --pp-border (light gray)
  if (avgFloat < 0) return 'var(--pp-red)';
  if (avgFloat <= 1) return 'var(--pp-coral)';
  if (avgFloat <= 5) return 'var(--pp-amber)';
  return 'var(--pp-green)';
}

function floatToOpacityRange(count: number, maxCount: number): number {
  if (maxCount === 0) return 0.3;
  const ratio = count / maxCount;
  return 0.3 + ratio * 0.7; // range [0.3, 1.0]
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CELL_HEIGHT = 36;
const ROW_LABEL_WIDTH = 140;
const MIN_CELL_WIDTH = 50;

export function HeatmapGrid({ nodes, margins, timeBucket, groupBy }: HeatmapGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);

  // Only OF nodes
  const ofNodes = useMemo(() => nodes.filter((n) => n.type === 'of'), [nodes]);

  // Margin lookup
  const marginMap = useMemo(() => {
    const m = new Map<string, MarginResult>();
    for (const margin of margins) {
      m.set(margin.nodeId, margin);
    }
    return m;
  }, [margins]);

  // Time columns
  const timeCols = useMemo(() => buildTimeBuckets(timeBucket), [timeBucket]);

  // Row groups
  const rowGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const node of ofNodes) {
      groups.add(getGroupKey(node, groupBy));
    }
    const sorted = Array.from(groups).sort((a, b) => a.localeCompare(b, 'fr'));
    // Ensure at least one row
    return sorted.length > 0 ? sorted : ['Aucune donnee'];
  }, [ofNodes, groupBy]);

  // Build grid data: Map<`${rowIdx}-${colIdx}`, CellData>
  const { grid, maxCount } = useMemo(() => {
    const g = new Map<string, CellData>();
    let max = 0;

    // Init all cells
    for (let r = 0; r < rowGroups.length; r++) {
      for (let c = 0; c < timeCols.length; c++) {
        g.set(`${r}-${c}`, { ofIds: [], avgFloat: null, floats: [] });
      }
    }

    for (const node of ofNodes) {
      const rowKey = getGroupKey(node, groupBy);
      const rowIdx = rowGroups.indexOf(rowKey);
      if (rowIdx === -1) continue;

      const nodeStart = parseISO(node.dateDebut);
      const nodeEnd = parseISO(node.dateFin);

      for (let c = 0; c < timeCols.length; c++) {
        const col = timeCols[c];
        // Check if the OF overlaps with this time bucket
        const overlaps =
          nodeStart <= col.end && nodeEnd >= col.start;

        if (overlaps) {
          const key = `${rowIdx}-${c}`;
          const cell = g.get(key)!;
          cell.ofIds.push(node.id);
          const margin = marginMap.get(node.id);
          if (margin) {
            cell.floats.push({ nodeId: node.id, floatTotal: margin.floatTotal });
          }
        }
      }
    }

    // Compute averages and max count
    for (const cell of g.values()) {
      if (cell.floats.length > 0) {
        cell.avgFloat =
          cell.floats.reduce((s, f) => s + f.floatTotal, 0) / cell.floats.length;
      }
      if (cell.ofIds.length > max) max = cell.ofIds.length;
    }

    return { grid: g, maxCount: max };
  }, [ofNodes, marginMap, timeCols, rowGroups, groupBy]);

  // SVG dimensions
  const colCount = timeCols.length;
  const headerHeight = timeBucket === 'day' ? 60 : 44;
  const svgHeight = headerHeight + rowGroups.length * CELL_HEIGHT + 2;

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<SVGRectElement>, rowIdx: number, colIdx: number) => {
      const cell = grid.get(`${rowIdx}-${colIdx}`);
      if (!cell || cell.ofIds.length === 0) return;
      const svgEl = (e.target as SVGElement).closest('svg');
      if (!svgEl) return;
      const rect = svgEl.getBoundingClientRect();
      setTooltip({
        x: e.clientX - rect.left + 12,
        y: e.clientY - rect.top - 8,
        cell,
        colLabel: timeCols[colIdx].label,
        rowLabel: rowGroups[rowIdx],
      });
    },
    [grid, timeCols, rowGroups],
  );

  const handleMouseLeave = useCallback(() => {
    setTooltip(null);
  }, []);

  if (ofNodes.length === 0) {
    return (
      <div
        className="flex items-center justify-center rounded-lg border p-12"
        style={{ borderColor: 'var(--pp-border)', backgroundColor: 'var(--pp-surface)' }}
      >
        <p style={{ color: 'var(--pp-text-secondary)' }}>
          Aucun OF disponible. Lancez le seed pour alimenter le graphe.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="w-full overflow-x-auto">
      <svg
        width="100%"
        viewBox={`0 0 ${ROW_LABEL_WIDTH + colCount * Math.max(MIN_CELL_WIDTH, 1)} ${svgHeight}`}
        style={{ minWidth: ROW_LABEL_WIDTH + colCount * MIN_CELL_WIDTH }}
        className="select-none"
      >
        {/* ---- Column headers ---- */}
        {timeCols.map((col, ci) => (
          <text
            key={ci}
            x={ROW_LABEL_WIDTH + ci * MIN_CELL_WIDTH + MIN_CELL_WIDTH / 2}
            y={headerHeight - 6}
            textAnchor="middle"
            fontSize={timeBucket === 'day' ? 9 : 11}
            fill="var(--pp-text-secondary)"
            style={{ userSelect: 'none' }}
            transform={
              timeBucket === 'day'
                ? `rotate(-45, ${ROW_LABEL_WIDTH + ci * MIN_CELL_WIDTH + MIN_CELL_WIDTH / 2}, ${headerHeight - 6})`
                : undefined
            }
          >
            {col.label}
          </text>
        ))}

        {/* ---- Rows ---- */}
        {rowGroups.map((group, ri) => (
          <g key={group} transform={`translate(0, ${headerHeight + ri * CELL_HEIGHT})`}>
            {/* Row label */}
            <text
              x={ROW_LABEL_WIDTH - 8}
              y={CELL_HEIGHT / 2 + 4}
              textAnchor="end"
              fontSize={11}
              fill="var(--pp-navy)"
              style={{ userSelect: 'none' }}
            >
              {group.length > 18 ? group.slice(0, 16) + '...' : group}
            </text>

            {/* Cells */}
            {timeCols.map((_, ci) => {
              const cell = grid.get(`${ri}-${ci}`)!;
              const hasData = cell.ofIds.length > 0;
              const opacity = hasData ? floatToOpacityRange(cell.ofIds.length, maxCount) : 1;

              return (
                <rect
                  key={ci}
                  x={ROW_LABEL_WIDTH + ci * MIN_CELL_WIDTH + 1}
                  y={1}
                  width={MIN_CELL_WIDTH - 2}
                  height={CELL_HEIGHT - 2}
                  rx={3}
                  fill={floatToColor(cell.avgFloat)}
                  opacity={opacity}
                  stroke="var(--pp-surface)"
                  strokeWidth={1}
                  className="cursor-pointer transition-opacity duration-150"
                  onMouseEnter={(e) => handleMouseEnter(e, ri, ci)}
                  onMouseMove={(e) => handleMouseEnter(e, ri, ci)}
                  onMouseLeave={handleMouseLeave}
                />
              );
            })}
          </g>
        ))}

        {/* ---- Y-axis label ---- */}
        <text
          x={4}
          y={headerHeight - 10}
          fontSize={10}
          fontWeight={600}
          fill="var(--pp-text-secondary)"
          style={{ userSelect: 'none' }}
        >
          {getGroupLabel(groupBy)}
        </text>
      </svg>

      {/* ---- Tooltip ---- */}
      {tooltip && (
        <div
          className="pointer-events-none absolute z-50 max-w-xs rounded-lg border px-3 py-2 shadow-lg"
          style={{
            left: tooltip.x,
            top: tooltip.y,
            backgroundColor: 'var(--pp-surface)',
            borderColor: 'var(--pp-border)',
          }}
        >
          <div className="mb-1 text-xs font-semibold" style={{ color: 'var(--pp-navy)' }}>
            {tooltip.rowLabel} &mdash; {tooltip.colLabel}
          </div>
          <div className="text-xs" style={{ color: 'var(--pp-text-secondary)' }}>
            {tooltip.cell.ofIds.length} OF{tooltip.cell.ofIds.length > 1 ? 's' : ''}
            {tooltip.cell.avgFloat !== null && (
              <> &middot; Marge moy. : {tooltip.cell.avgFloat.toFixed(1)}j</>
            )}
          </div>
          <ul className="mt-1 max-h-32 overflow-y-auto text-xs" style={{ color: 'var(--pp-navy)' }}>
            {tooltip.cell.floats.slice(0, 10).map((f) => (
              <li key={f.nodeId}>
                {f.nodeId} : {f.floatTotal.toFixed(1)}j
              </li>
            ))}
            {tooltip.cell.floats.length > 10 && (
              <li style={{ color: 'var(--pp-text-secondary)' }}>
                ...et {tooltip.cell.floats.length - 10} autres
              </li>
            )}
          </ul>
        </div>
      )}
    </div>
  );
}
