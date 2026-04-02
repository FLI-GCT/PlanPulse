import { useCallback, useMemo, useRef } from 'react';
import { scaleTime } from 'd3-scale';
import { timeDay, timeWeek } from 'd3-time';
import {
  format,
  differenceInCalendarDays,
  getISOWeek,
  parseISO,
  startOfDay,
} from 'date-fns';
import { fr } from 'date-fns/locale';

import { useGraphStore } from '@/providers/state/graph-store';
import type { MarginResult, GraphNode, GraphEdge } from '@/providers/state/graph-store';
import { useUiStore } from '@/providers/state/ui-store';
import {
  SIDEBAR_WIDTH,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  DAY_WIDTH,
} from '@/features/gantt/gantt-layout';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SegmentRow {
  rootOf: GraphNode;
  subOfs: GraphNode[];
  worstMargin: number;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBarColor(worstMargin: number): string {
  if (worstMargin < 0) return 'var(--pp-red)';
  if (worstMargin <= 1) return 'var(--pp-coral)';
  if (worstMargin <= 5) return 'var(--pp-amber)';
  return 'var(--pp-green)';
}

function findSubOfs(
  rootId: string,
  edges: GraphEdge[],
  nodeMap: Map<string, GraphNode>,
): GraphNode[] {
  const children: GraphNode[] = [];
  for (const edge of edges) {
    if (
      edge.sourceId === rootId &&
      edge.sourceType === 'of' &&
      edge.targetType === 'of' &&
      edge.typeLien === 'NOMENCLATURE'
    ) {
      const child = nodeMap.get(edge.targetId);
      if (child) children.push(child);
    }
  }
  children.sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));
  return children;
}

// Row height for segment view: taller to accommodate sub-bars
const SEGMENT_ROW_HEIGHT = 60;
const SUB_BAR_HEIGHT = 14;
const SUB_BAR_INDENT = 8;
const MAX_VISIBLE_SUB = 4;

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GanttSegment() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const margins = useGraphStore((s) => s.margins);
  const ganttZoom = useUiStore((s) => s.ganttZoom);
  const selectNode = useUiStore((s) => s.selectNode);

  const sidebarRef = useRef<HTMLDivElement>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);

  // Build lookups
  const marginMap = useMemo(() => {
    const m = new Map<string, MarginResult>();
    for (const margin of margins) {
      m.set(margin.nodeId, margin);
    }
    return m;
  }, [margins]);

  const nodeMap = useMemo(
    () => new Map(nodes.map((n) => [n.id, n])),
    [nodes],
  );

  // Build segment rows: root OFs (no parent)
  const rows = useMemo(() => {
    const ofNodes = nodes.filter((n) => n.type === 'of');

    // Find OFs that are children (have a parent via NOMENCLATURE edge)
    const hasParent = new Set<string>();
    for (const edge of edges) {
      if (
        edge.sourceType === 'of' &&
        edge.targetType === 'of' &&
        edge.typeLien === 'NOMENCLATURE'
      ) {
        hasParent.add(edge.targetId);
      }
    }

    const rootOfs = ofNodes.filter((n) => !hasParent.has(n.id));
    const result: SegmentRow[] = [];

    for (const root of rootOfs) {
      const subOfs = findSubOfs(root.id, edges, nodeMap);
      const allIds = [root.id, ...subOfs.map((s) => s.id)];
      const allMargins = allIds
        .map((id) => marginMap.get(id))
        .filter((m): m is MarginResult => !!m)
        .map((m) => m.floatTotal);
      const worstMargin =
        allMargins.length > 0 ? Math.min(...allMargins) : 99;

      result.push({ rootOf: root, subOfs, worstMargin });
    }

    result.sort((a, b) => a.worstMargin - b.worstMargin);
    return result;
  }, [nodes, edges, nodeMap, marginMap]);

  // Time scale
  const { xScale, startDate, endDate, totalDays } = useMemo(() => {
    const s = new Date(ganttZoom.startDate);
    const e = new Date(ganttZoom.endDate);
    const days = Math.max(differenceInCalendarDays(e, s), 7);
    const chartWidth = days * DAY_WIDTH;
    const scale = scaleTime().domain([s, e]).range([0, chartWidth]);
    return { xScale: scale, startDate: s, endDate: e, totalDays: days };
  }, [ganttZoom]);

  const chartWidth = totalDays * DAY_WIDTH;
  const chartHeight = rows.length * SEGMENT_ROW_HEIGHT;

  // Week / day ticks
  const weekTicks = useMemo(() => {
    const weeks = timeWeek.every(1);
    if (!weeks) return [];
    return weeks.range(startDate, endDate).map((d) => ({
      x: xScale(d),
      label: `S${getISOWeek(d)}`,
    }));
  }, [xScale, startDate, endDate]);

  const dayTicks = useMemo(() => {
    const days = timeDay.every(1);
    if (!days) return [];
    return days.range(startDate, endDate).map((d) => ({
      x: xScale(d),
      label: format(d, 'EE dd', { locale: fr }),
      isWeekend: d.getDay() === 0 || d.getDay() === 6,
      isMonday: d.getDay() === 1,
    }));
  }, [xScale, startDate, endDate]);

  const todayX = useMemo(() => {
    const today = startOfDay(new Date());
    if (today < startDate || today > endDate) return null;
    return xScale(today);
  }, [xScale, startDate, endDate]);

  const handleBarClick = useCallback(
    (nodeId: string) => {
      selectNode(nodeId);
    },
    [selectNode],
  );

  const handleChartScroll = useCallback(() => {
    const chartEl = chartScrollRef.current;
    const sidebarEl = sidebarRef.current;
    if (chartEl && sidebarEl) {
      sidebarEl.scrollTop = chartEl.scrollTop;
    }
  }, []);

  return (
    <div className="flex flex-1 flex-col" style={{ minHeight: 0 }}>
      <div className="flex flex-1" style={{ minHeight: 0 }}>
        {/* ---- Left sidebar ---- */}
        <div
          ref={sidebarRef}
          className="shrink-0 overflow-hidden border-r"
          style={{
            width: SIDEBAR_WIDTH,
            borderColor: 'var(--pp-border)',
            backgroundColor: 'var(--pp-surface)',
          }}
        >
          <div
            className="flex items-end border-b px-3 pb-1 text-xs font-semibold"
            style={{
              height: HEADER_HEIGHT,
              borderColor: 'var(--pp-border)',
              color: 'var(--pp-text-secondary)',
            }}
          >
            Commande client
          </div>
          <div style={{ height: chartHeight }}>
            {rows.map((row, i) => (
              <div
                key={row.rootOf.id}
                className="flex flex-col justify-center overflow-hidden border-b px-3 text-xs"
                style={{
                  height: SEGMENT_ROW_HEIGHT,
                  borderColor: 'var(--pp-border)',
                  backgroundColor:
                    i % 2 === 0 ? 'var(--pp-surface)' : 'var(--pp-bg)',
                  color: 'var(--pp-navy)',
                  cursor: 'pointer',
                }}
                onClick={() => handleBarClick(row.rootOf.id)}
                title={`${row.rootOf.label} (${row.subOfs.length} sous-OFs)`}
              >
                <span className="truncate font-medium">
                  {row.rootOf.label}
                </span>
                <span
                  className="truncate text-[10px]"
                  style={{ color: 'var(--pp-text-secondary)' }}
                >
                  {row.rootOf.id}
                  {row.subOfs.length > 0 && ` - ${row.subOfs.length} sous-OF${row.subOfs.length > 1 ? 's' : ''}`}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* ---- Right: scrollable chart area ---- */}
        <div
          ref={chartScrollRef}
          className="flex-1 overflow-auto"
          style={{ backgroundColor: 'var(--pp-bg)' }}
          onScroll={handleChartScroll}
        >
          <svg
            width={chartWidth}
            height={HEADER_HEIGHT + chartHeight}
            style={{ display: 'block' }}
          >
            {/* Header background */}
            <rect
              x={0}
              y={0}
              width={chartWidth}
              height={HEADER_HEIGHT}
              fill="var(--pp-surface)"
            />
            <line
              x1={0}
              y1={HEADER_HEIGHT}
              x2={chartWidth}
              y2={HEADER_HEIGHT}
              stroke="var(--pp-border)"
              strokeWidth={1}
            />

            {/* Week headers */}
            {weekTicks.map((tick, i) => {
              const nextX =
                i < weekTicks.length - 1 ? weekTicks[i + 1].x : chartWidth;
              return (
                <g key={`week-${i}`}>
                  <text
                    x={tick.x + (nextX - tick.x) / 2}
                    y={18}
                    textAnchor="middle"
                    fontSize={11}
                    fontWeight={600}
                    fill="var(--pp-navy)"
                    style={{ userSelect: 'none' }}
                  >
                    {tick.label}
                  </text>
                  <line
                    x1={tick.x}
                    y1={0}
                    x2={tick.x}
                    y2={HEADER_HEIGHT}
                    stroke="var(--pp-border)"
                    strokeWidth={1}
                  />
                </g>
              );
            })}

            {/* Day headers */}
            {dayTicks.map((tick, i) => (
              <g key={`day-${i}`}>
                <text
                  x={tick.x + DAY_WIDTH / 2}
                  y={HEADER_HEIGHT - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fill={
                    tick.isWeekend
                      ? 'var(--pp-coral)'
                      : 'var(--pp-text-secondary)'
                  }
                  style={{ userSelect: 'none' }}
                >
                  {tick.label}
                </text>
              </g>
            ))}

            {/* Chart body */}
            <g transform={`translate(0, ${HEADER_HEIGHT})`}>
              {/* Row backgrounds */}
              {rows.map((row, i) => (
                <g key={`bg-${row.rootOf.id}`}>
                  <rect
                    x={0}
                    y={i * SEGMENT_ROW_HEIGHT}
                    width={chartWidth}
                    height={SEGMENT_ROW_HEIGHT}
                    fill={
                      i % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.015)'
                    }
                  />
                  <line
                    x1={0}
                    y1={(i + 1) * SEGMENT_ROW_HEIGHT}
                    x2={chartWidth}
                    y2={(i + 1) * SEGMENT_ROW_HEIGHT}
                    stroke="var(--pp-border)"
                    strokeWidth={0.5}
                    opacity={0.5}
                  />
                </g>
              ))}

              {/* Vertical grid */}
              {dayTicks.map((tick, i) => (
                <line
                  key={`vline-${i}`}
                  x1={tick.x}
                  y1={0}
                  x2={tick.x}
                  y2={chartHeight}
                  stroke="var(--pp-border)"
                  strokeWidth={tick.isMonday ? 1 : 0.5}
                  opacity={tick.isMonday ? 0.6 : 0.25}
                />
              ))}

              {/* Weekend shading */}
              {dayTicks
                .filter((t) => t.isWeekend)
                .map((tick, i) => (
                  <rect
                    key={`weekend-${i}`}
                    x={tick.x}
                    y={0}
                    width={DAY_WIDTH}
                    height={chartHeight}
                    fill="rgba(0, 0, 0, 0.025)"
                  />
                ))}

              {/* Segment bars */}
              {rows.map((row, i) => {
                const rootX1 = xScale(parseISO(row.rootOf.dateDebut));
                const rootX2 = xScale(parseISO(row.rootOf.dateFin));
                const rootWidth = Math.max(rootX2 - rootX1, 6);
                const rootY = i * SEGMENT_ROW_HEIGHT + 4;
                const rootBarHeight = 22;
                const fillColor = getBarColor(row.worstMargin);

                const visibleSubs = row.subOfs.slice(0, MAX_VISIBLE_SUB);
                const hiddenCount = row.subOfs.length - MAX_VISIBLE_SUB;

                return (
                  <g
                    key={row.rootOf.id}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleBarClick(row.rootOf.id)}
                  >
                    {/* Main root bar */}
                    <rect
                      x={rootX1}
                      y={rootY}
                      width={rootWidth}
                      height={rootBarHeight}
                      rx={3}
                      ry={3}
                      fill={fillColor}
                    />
                    {rootWidth > 50 && (
                      <text
                        x={rootX1 + 5}
                        y={rootY + rootBarHeight / 2 + 4}
                        fontSize={10}
                        fontWeight={600}
                        fill="white"
                        style={{ userSelect: 'none', pointerEvents: 'none' }}
                      >
                        {row.rootOf.label}
                      </text>
                    )}

                    {/* Sub-OF bars */}
                    {visibleSubs.map((sub, si) => {
                      const subX1 = xScale(parseISO(sub.dateDebut));
                      const subX2 = xScale(parseISO(sub.dateFin));
                      const subWidth = Math.max(subX2 - subX1, 4);
                      const subY =
                        rootY + rootBarHeight + 2 + si * (SUB_BAR_HEIGHT + 1);
                      const subMargin = marginMap.get(sub.id);
                      const subColor = subMargin
                        ? getBarColor(subMargin.floatTotal)
                        : 'var(--pp-blue)';

                      return (
                        <g key={sub.id}>
                          <rect
                            x={subX1 + SUB_BAR_INDENT}
                            y={subY}
                            width={Math.max(subWidth - SUB_BAR_INDENT, 3)}
                            height={SUB_BAR_HEIGHT}
                            rx={2}
                            ry={2}
                            fill={subColor}
                            opacity={0.75}
                          />
                          {subWidth > 30 && (
                            <text
                              x={subX1 + SUB_BAR_INDENT + 3}
                              y={subY + SUB_BAR_HEIGHT / 2 + 3}
                              fontSize={8}
                              fontWeight={500}
                              fill="white"
                              style={{
                                userSelect: 'none',
                                pointerEvents: 'none',
                              }}
                            >
                              {sub.label}
                            </text>
                          )}
                        </g>
                      );
                    })}

                    {/* +N indicator */}
                    {hiddenCount > 0 && (
                      <text
                        x={
                          rootX1 + rootWidth + 4
                        }
                        y={
                          rootY +
                          rootBarHeight +
                          MAX_VISIBLE_SUB * (SUB_BAR_HEIGHT + 1) +
                          2
                        }
                        fontSize={9}
                        fontWeight={600}
                        fill="var(--pp-text-secondary)"
                        style={{ userSelect: 'none' }}
                      >
                        +{hiddenCount}
                      </text>
                    )}
                  </g>
                );
              })}

              {/* Today line */}
              {todayX !== null && (
                <g>
                  <line
                    x1={todayX}
                    y1={0}
                    x2={todayX}
                    y2={chartHeight}
                    stroke="var(--pp-red)"
                    strokeWidth={2}
                    strokeDasharray="6 4"
                    opacity={0.7}
                  />
                  <text
                    x={todayX + 4}
                    y={12}
                    fontSize={9}
                    fontWeight={600}
                    fill="var(--pp-red)"
                    style={{ userSelect: 'none' }}
                  >
                    Aujourd&apos;hui
                  </text>
                </g>
              )}
            </g>
          </svg>
        </div>
      </div>
    </div>
  );
}
