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
  isWithinInterval,
} from 'date-fns';
import { fr } from 'date-fns/locale';
import type { GraphNode, GraphEdge, MarginResult } from '@/providers/state/graph-store';
import { useUiStore } from '@/providers/state/ui-store';
import { HeatmapCell } from './_heatmap-cell';
import type { HeatmapCellProps } from './_heatmap-cell';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type TimeBucket = 'week' | 'day';
export type GroupBy = 'client' | 'priorite' | 'statut' | 'fournisseur';

interface HeatmapGridProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  margins: MarginResult[];
  timeBucket: TimeBucket;
  groupBy: GroupBy;
}

interface CellData {
  ofIds: string[];
  avgFloat: number | null;
  criticalCount: number;
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

function buildTimeBuckets(bucket: TimeBucket): { label: string; start: Date; end: Date; isCurrent: boolean }[] {
  const today = new Date();
  const buckets: { label: string; start: Date; end: Date; isCurrent: boolean }[] = [];

  if (bucket === 'week') {
    const currentWeek = getISOWeek(today);
    for (let i = 0; i < WEEKS_SPAN; i++) {
      const weekStart = startOfWeek(addWeeks(today, i), { weekStartsOn: 1 });
      const weekEnd = endOfWeek(addWeeks(today, i), { weekStartsOn: 1 });
      const weekNum = getISOWeek(weekStart);
      buckets.push({
        label: `S${weekNum}`,
        start: weekStart,
        end: weekEnd,
        isCurrent: weekNum === currentWeek,
      });
    }
  } else {
    for (let i = 0; i < WEEKS_SPAN * 7; i++) {
      const day = addDays(today, i);
      const isCurrent = isWithinInterval(today, {
        start: startOfDay(day),
        end: endOfDay(day),
      });
      buckets.push({
        label: format(day, 'EEE dd/MM', { locale: fr }),
        start: startOfDay(day),
        end: endOfDay(day),
        isCurrent,
      });
    }
  }
  return buckets;
}

/** Build a lookup: ofId -> fournisseur name (from connected achat nodes via edges). */
function buildFournisseurMap(
  nodes: GraphNode[],
  edges: GraphEdge[],
): Map<string, string> {
  const nodeMap = new Map<string, GraphNode>();
  for (const n of nodes) nodeMap.set(n.id, n);

  const result = new Map<string, string>();

  for (const edge of edges) {
    // An edge connecting an achat to an OF
    const sourceNode = nodeMap.get(edge.sourceId);
    const targetNode = nodeMap.get(edge.targetId);

    if (sourceNode?.type === 'achat' && targetNode?.type === 'of') {
      if (sourceNode.fournisseur) {
        result.set(targetNode.id, sourceNode.fournisseur);
      }
    }
    if (targetNode?.type === 'achat' && sourceNode?.type === 'of') {
      if (targetNode.fournisseur) {
        result.set(sourceNode.id, targetNode.fournisseur);
      }
    }
  }
  return result;
}

function getGroupKey(
  node: GraphNode,
  groupBy: GroupBy,
  fournisseurMap: Map<string, string>,
): string {
  switch (groupBy) {
    case 'client':
      return node.articleId ?? 'Sans article';
    case 'priorite':
      return node.priorite != null ? `P${node.priorite}` : 'Non definie';
    case 'statut':
      return node.statut || 'Inconnu';
    case 'fournisseur':
      return fournisseurMap.get(node.id) ?? 'Sans fournisseur';
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
    case 'fournisseur':
      return 'Fournisseur';
  }
}

function computeTrend(
  currentAvg: number | null,
  prevAvg: number | null,
): HeatmapCellProps['trend'] {
  if (currentAvg === null || prevAvg === null) return 'stable';
  const delta = currentAvg - prevAvg;
  if (delta > 0.5) return 'up';
  if (delta < -0.5) return 'down';
  return 'stable';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const CELL_HEIGHT = 40;
const ROW_LABEL_WIDTH = 140;
const MIN_CELL_WIDTH = 60;
const HEADER_HEIGHT = 32;

export function HeatmapGrid({ nodes, edges, margins, timeBucket, groupBy }: HeatmapGridProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<TooltipState | null>(null);
  const selectNode = useUiStore((s) => s.selectNode);

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

  // Fournisseur lookup
  const fournisseurMap = useMemo(
    () => buildFournisseurMap(nodes, edges),
    [nodes, edges],
  );

  // Time columns
  const timeCols = useMemo(() => buildTimeBuckets(timeBucket), [timeBucket]);

  // Row groups
  const rowGroups = useMemo(() => {
    const groups = new Set<string>();
    for (const node of ofNodes) {
      groups.add(getGroupKey(node, groupBy, fournisseurMap));
    }
    const sorted = Array.from(groups).sort((a, b) => a.localeCompare(b, 'fr'));
    return sorted.length > 0 ? sorted : ['Aucune donnee'];
  }, [ofNodes, groupBy, fournisseurMap]);

  // Build grid data: Map<`${rowIdx}-${colIdx}`, CellData>
  const grid = useMemo(() => {
    const g = new Map<string, CellData>();

    // Init all cells
    for (let r = 0; r < rowGroups.length; r++) {
      for (let c = 0; c < timeCols.length; c++) {
        g.set(`${r}-${c}`, { ofIds: [], avgFloat: null, criticalCount: 0, floats: [] });
      }
    }

    for (const node of ofNodes) {
      const rowKey = getGroupKey(node, groupBy, fournisseurMap);
      const rowIdx = rowGroups.indexOf(rowKey);
      if (rowIdx === -1) continue;

      const nodeStart = parseISO(node.dateDebut);
      const nodeEnd = parseISO(node.dateFin);

      for (let c = 0; c < timeCols.length; c++) {
        const col = timeCols[c];
        const overlaps = nodeStart <= col.end && nodeEnd >= col.start;

        if (overlaps) {
          const key = `${rowIdx}-${c}`;
          const cell = g.get(key)!;
          cell.ofIds.push(node.id);
          const margin = marginMap.get(node.id);
          if (margin) {
            cell.floats.push({ nodeId: node.id, floatTotal: margin.floatTotal });
            if (margin.floatTotal <= 0) {
              cell.criticalCount++;
            }
          }
        }
      }
    }

    // Compute averages
    for (const cell of g.values()) {
      if (cell.floats.length > 0) {
        cell.avgFloat =
          cell.floats.reduce((s, f) => s + f.floatTotal, 0) / cell.floats.length;
      }
    }

    return g;
  }, [ofNodes, marginMap, timeCols, rowGroups, groupBy, fournisseurMap]);

  // Handle cell click -> open detail drawer
  const handleCellClick = useCallback(
    (rowIdx: number, colIdx: number) => {
      const cell = grid.get(`${rowIdx}-${colIdx}`);
      if (cell && cell.ofIds.length > 0) {
        selectNode(cell.ofIds[0]);
      }
    },
    [grid, selectNode],
  );

  const handleMouseEnter = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, rowIdx: number, colIdx: number) => {
      const cell = grid.get(`${rowIdx}-${colIdx}`);
      if (!cell || cell.ofIds.length === 0) return;
      const container = containerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
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
    <div ref={containerRef} className="relative w-full overflow-x-auto">
      <table
        className="border-separate select-none"
        style={{
          borderSpacing: 2,
          minWidth: ROW_LABEL_WIDTH + timeCols.length * MIN_CELL_WIDTH,
        }}
      >
        {/* ---- Column headers ---- */}
        <thead>
          <tr>
            <th
              className="text-left text-xs font-semibold"
              style={{
                width: ROW_LABEL_WIDTH,
                minWidth: ROW_LABEL_WIDTH,
                color: 'var(--pp-text-secondary)',
                height: HEADER_HEIGHT,
              }}
            >
              {getGroupLabel(groupBy)}
            </th>
            {timeCols.map((col, ci) => (
              <th
                key={ci}
                className="text-center text-xs"
                style={{
                  minWidth: MIN_CELL_WIDTH,
                  height: HEADER_HEIGHT,
                  color: 'var(--pp-text-secondary)',
                  fontWeight: col.isCurrent ? 700 : 400,
                  whiteSpace: 'nowrap',
                }}
              >
                {col.label}
              </th>
            ))}
          </tr>
        </thead>

        {/* ---- Rows ---- */}
        <tbody>
          {rowGroups.map((group, ri) => (
            <tr key={group}>
              {/* Row label */}
              <td
                className="text-right text-xs pr-2"
                style={{
                  color: 'var(--pp-navy)',
                  height: CELL_HEIGHT,
                  maxWidth: ROW_LABEL_WIDTH,
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  whiteSpace: 'nowrap',
                }}
                title={group}
              >
                {group.length > 18 ? group.slice(0, 16) + '...' : group}
              </td>

              {/* Cells */}
              {timeCols.map((_, ci) => {
                const cell = grid.get(`${ri}-${ci}`)!;
                const hasData = cell.ofIds.length > 0;

                // Compute trend by comparing with previous column
                const prevCell = ci > 0 ? grid.get(`${ri}-${ci - 1}`) : null;
                const trend = computeTrend(
                  cell.avgFloat,
                  prevCell?.avgFloat ?? null,
                );

                return (
                  <td
                    key={ci}
                    style={{
                      width: MIN_CELL_WIDTH,
                      minWidth: MIN_CELL_WIDTH,
                      height: CELL_HEIGHT,
                      padding: 0,
                    }}
                    onMouseEnter={(e) => handleMouseEnter(e, ri, ci)}
                    onMouseMove={(e) => handleMouseEnter(e, ri, ci)}
                    onMouseLeave={handleMouseLeave}
                  >
                    {hasData ? (
                      <HeatmapCell
                        ofCount={cell.ofIds.length}
                        criticalCount={cell.criticalCount}
                        avgMargin={cell.avgFloat ?? 0}
                        trend={trend}
                        onClick={() => handleCellClick(ri, ci)}
                      />
                    ) : (
                      <div
                        className="h-full w-full"
                        style={{
                          backgroundColor: '#E5E3DC',
                          borderRadius: 3,
                          minHeight: CELL_HEIGHT - 4,
                        }}
                      />
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

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
            {tooltip.cell.criticalCount > 0 && (
              <> &middot; {tooltip.cell.criticalCount} critique{tooltip.cell.criticalCount > 1 ? 's' : ''}</>
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
