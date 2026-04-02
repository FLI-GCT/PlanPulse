import {
  useCallback,
  useMemo,
  useRef,
} from 'react';
import { scaleTime } from 'd3-scale';
import { timeDay, timeWeek } from 'd3-time';
import {
  format,
  differenceInCalendarDays,
  getISOWeek,
  startOfDay,
} from 'date-fns';
import { fr } from 'date-fns/locale';

import { useGraphStore } from '@/providers/state/graph-store';
import type { MarginResult } from '@/providers/state/graph-store';
import { useUiStore } from '@/providers/state/ui-store';

import {
  SIDEBAR_WIDTH,
  ROW_HEIGHT,
  HEADER_HEIGHT,
  DAY_WIDTH,
  INDENT_PX,
  buildRows,
} from '@/features/gantt/gantt-layout';
import { useGanttDrag } from '@/features/gantt/hooks/use-gantt-drag';
import { GanttDependencies } from './gantt-dependencies';
import { GanttBar } from './gantt-bar';
import { MoveConfirmDialog } from './move-confirm-dialog';

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GanttChart() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const margins = useGraphStore((s) => s.margins);
  const criticalPath = useGraphStore((s) => s.criticalPath);

  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const selectNode = useUiStore((s) => s.selectNode);
  const filters = useUiStore((s) => s.filters);
  const ganttZoom = useUiStore((s) => s.ganttZoom);

  // Refs for scroll sync
  const sidebarRef = useRef<HTMLDivElement>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);

  // ---- Derived data ----

  const isCriticalFilterActive = filters.statuts.includes('__critical__');

  const marginMap = useMemo(() => {
    const m = new Map<string, MarginResult>();
    for (const margin of margins) {
      m.set(margin.nodeId, margin);
    }
    return m;
  }, [margins]);

  const criticalSet = useMemo(() => new Set(criticalPath), [criticalPath]);

  const rows = useMemo(
    () => buildRows(nodes, edges, filters.statuts, isCriticalFilterActive, criticalPath),
    [nodes, edges, filters.statuts, isCriticalFilterActive, criticalPath],
  );

  // ---- Time scale ----

  const { xScale, startDate, endDate, totalDays } = useMemo(() => {
    const s = new Date(ganttZoom.startDate);
    const e = new Date(ganttZoom.endDate);
    const days = Math.max(differenceInCalendarDays(e, s), 7);
    const chartWidth = days * DAY_WIDTH;

    const scale = scaleTime()
      .domain([s, e])
      .range([0, chartWidth]);

    return { xScale: scale, startDate: s, endDate: e, totalDays: days };
  }, [ganttZoom]);

  const chartWidth = totalDays * DAY_WIDTH;
  const chartHeight = rows.length * ROW_HEIGHT;

  // ---- Drag hook ----

  const {
    dragDelta,
    pendingMove,
    handleDragStart,
    handleConfirmMove,
    handleCancelMove,
    previewNodes,
    isConnected,
  } = useGanttDrag(xScale);

  // Preview lookup
  const previewMap = useMemo(() => {
    const m = new Map<string, import('@/providers/state/graph-store').PropagationResult>();
    if (!previewNodes) return m;
    for (const p of previewNodes) {
      m.set(p.nodeId, p);
    }
    return m;
  }, [previewNodes]);

  // ---- Week / day ticks ----

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

  // ---- Today line ----

  const todayX = useMemo(() => {
    const today = startOfDay(new Date());
    if (today < startDate || today > endDate) return null;
    return xScale(today);
  }, [xScale, startDate, endDate]);

  // ---- Handlers ----

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

  // ---- Render ----

  return (
    <div className="flex flex-1 flex-col" style={{ minHeight: 0 }}>
      <div className="flex flex-1" style={{ minHeight: 0 }}>
        {/* ---- Left sidebar: OF labels ---- */}
        <div
          ref={sidebarRef}
          className="shrink-0 overflow-hidden border-r"
          style={{
            width: SIDEBAR_WIDTH,
            borderColor: 'var(--pp-border)',
            backgroundColor: 'var(--pp-surface)',
          }}
        >
          {/* Header spacer */}
          <div
            className="flex items-end border-b px-3 pb-1 text-xs font-semibold"
            style={{
              height: HEADER_HEIGHT,
              borderColor: 'var(--pp-border)',
              color: 'var(--pp-text-secondary)',
            }}
          >
            Ordre de fabrication
          </div>

          {/* Row labels */}
          <div style={{ height: chartHeight }}>
            {rows.map((row, i) => (
              <div
                key={row.node.id}
                className="flex items-center overflow-hidden border-b px-3 text-xs"
                style={{
                  height: ROW_HEIGHT,
                  paddingLeft: 12 + row.depth * INDENT_PX,
                  borderColor: 'var(--pp-border)',
                  backgroundColor:
                    row.node.id === selectedNodeId
                      ? 'rgba(46, 117, 182, 0.08)'
                      : i % 2 === 0
                        ? 'var(--pp-surface)'
                        : 'var(--pp-bg)',
                  color: 'var(--pp-navy)',
                  cursor: 'pointer',
                }}
                onClick={() => selectNode(row.node.id)}
                title={row.node.label}
              >
                <span className="truncate font-medium">{row.node.label}</span>
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
            {/* ---- Header background ---- */}
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

            {/* ---- Week headers (top row) ---- */}
            {weekTicks.map((tick, i) => {
              const nextX = i < weekTicks.length - 1 ? weekTicks[i + 1].x : chartWidth;
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

            {/* ---- Day headers (bottom row) ---- */}
            {dayTicks.map((tick, i) => (
              <g key={`day-${i}`}>
                <text
                  x={tick.x + DAY_WIDTH / 2}
                  y={HEADER_HEIGHT - 6}
                  textAnchor="middle"
                  fontSize={9}
                  fill={tick.isWeekend ? 'var(--pp-coral)' : 'var(--pp-text-secondary)'}
                  style={{ userSelect: 'none' }}
                >
                  {tick.label}
                </text>
              </g>
            ))}

            {/* ---- Chart body ---- */}
            <g transform={`translate(0, ${HEADER_HEIGHT})`}>
              {/* ---- Row backgrounds / horizontal grid lines ---- */}
              {rows.map((row, i) => (
                <g key={`bg-${row.node.id}`}>
                  <rect
                    x={0}
                    y={i * ROW_HEIGHT}
                    width={chartWidth}
                    height={ROW_HEIGHT}
                    fill={
                      row.node.id === selectedNodeId
                        ? 'rgba(46, 117, 182, 0.06)'
                        : i % 2 === 0
                          ? 'transparent'
                          : 'rgba(0, 0, 0, 0.015)'
                    }
                  />
                  <line
                    x1={0}
                    y1={(i + 1) * ROW_HEIGHT}
                    x2={chartWidth}
                    y2={(i + 1) * ROW_HEIGHT}
                    stroke="var(--pp-border)"
                    strokeWidth={0.5}
                    opacity={0.5}
                  />
                </g>
              ))}

              {/* ---- Vertical day grid lines ---- */}
              {dayTicks.map((tick, i) => (
                <line
                  key={`vline-${i}`}
                  x1={tick.x}
                  y1={0}
                  x2={tick.x}
                  y2={chartHeight}
                  stroke={tick.isMonday ? 'var(--pp-border)' : 'var(--pp-border)'}
                  strokeWidth={tick.isMonday ? 1 : 0.5}
                  opacity={tick.isMonday ? 0.6 : 0.25}
                />
              ))}

              {/* ---- Weekend shading ---- */}
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

              {/* ---- Dependency lines ---- */}
              <GanttDependencies
                rows={rows}
                nodes={nodes}
                edges={edges}
                xScale={xScale}
                selectedNodeId={selectedNodeId}
              />

              {/* ---- OF bars ---- */}
              {rows.map((row, i) => {
                const margin = marginMap.get(row.node.id);
                const isCritical = criticalSet.has(row.node.id);
                const isSelected = row.node.id === selectedNodeId;

                // Dim non-critical bars when critical filter is active
                const dimmed = isCriticalFilterActive && !isCritical;

                // Calculate drag offset for this specific bar
                let barDeltaPx = 0;
                if (dragDelta && dragDelta.nodeId === row.node.id) {
                  barDeltaPx = dragDelta.deltaPx;
                }

                // If this bar is being dragged, offset its position
                const barX = barDeltaPx !== 0 ? barDeltaPx : 0;

                return (
                  <g
                    key={row.node.id}
                    opacity={dimmed ? 0.3 : 1}
                    transform={barDeltaPx !== 0 ? `translate(${barX}, 0)` : undefined}
                  >
                    <GanttBar
                      node={row.node}
                      margin={margin}
                      xScale={xScale}
                      yPosition={i * ROW_HEIGHT}
                      isSelected={isSelected}
                      isCritical={isCritical}
                      isPreview={false}
                      isDragDisabled={!isConnected}
                      onDragStart={handleDragStart}
                      onClick={handleBarClick}
                    />
                  </g>
                );
              })}

              {/* ---- Preview bars (impacted nodes during drag) ---- */}
              {previewNodes &&
                previewNodes
                  .filter((p) => p.nodeId !== dragDelta?.nodeId)
                  .map((p) => {
                    const rowIdx = rows.findIndex((r) => r.node.id === p.nodeId);
                    if (rowIdx === -1) return null;
                    const row = rows[rowIdx];
                    const margin = marginMap.get(row.node.id);
                    const isCritical = criticalSet.has(row.node.id);

                    return (
                      <GanttBar
                        key={`preview-${p.nodeId}`}
                        node={row.node}
                        margin={margin}
                        xScale={xScale}
                        yPosition={rowIdx * ROW_HEIGHT}
                        isSelected={false}
                        isCritical={isCritical}
                        isPreview={true}
                        previewDateDebut={p.newDateDebut}
                        previewDateFin={p.newDateFin}
                        isDragDisabled={true}
                        onDragStart={handleDragStart}
                        onClick={handleBarClick}
                      />
                    );
                  })}

              {/* ---- Today line ---- */}
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

      {/* ---- Move confirmation dialog ---- */}
      {pendingMove && (
        <MoveConfirmDialog
          open={true}
          ofId={pendingMove.nodeId}
          deltaJours={pendingMove.deltaJours}
          impactedNodes={pendingMove.impactedNodes}
          onConfirm={handleConfirmMove}
          onCancel={handleCancelMove}
        />
      )}
    </div>
  );
}
