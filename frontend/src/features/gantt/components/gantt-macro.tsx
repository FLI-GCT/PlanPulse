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
import type { MarginResult } from '@/providers/state/graph-store';
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

interface MacroRow {
  articleId: string;
  label: string;
  ofCount: number;
  ofIds: string[];
  minDate: string;
  maxDate: string;
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

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GanttMacro() {
  const nodes = useGraphStore((s) => s.nodes);
  const margins = useGraphStore((s) => s.margins);
  const ganttZoom = useUiStore((s) => s.ganttZoom);
  const setGanttResolution = useUiStore((s) => s.setGanttResolution);
  const setFilters = useUiStore((s) => s.setFilters);

  const sidebarRef = useRef<HTMLDivElement>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);

  // Build margin lookup
  const marginMap = useMemo(() => {
    const m = new Map<string, MarginResult>();
    for (const margin of margins) {
      m.set(margin.nodeId, margin);
    }
    return m;
  }, [margins]);

  // Build macro rows: group OFs by articleId
  const rows = useMemo(() => {
    const ofNodes = nodes.filter((n) => n.type === 'of');
    const groups = new Map<
      string,
      { label: string; ofIds: string[]; dates: string[]; dateFins: string[]; margins: number[] }
    >();

    for (const node of ofNodes) {
      const key = node.articleId ?? '__unknown__';
      if (!groups.has(key)) {
        groups.set(key, {
          label: node.label.split(' - ')[0] || node.label,
          ofIds: [],
          dates: [],
          dateFins: [],
          margins: [],
        });
      }
      const g = groups.get(key)!;
      g.ofIds.push(node.id);
      g.dates.push(node.dateDebut);
      g.dateFins.push(node.dateFin);
      const m = marginMap.get(node.id);
      if (m) g.margins.push(m.floatTotal);
    }

    const result: MacroRow[] = [];
    for (const [articleId, g] of groups) {
      const sortedDates = [...g.dates].sort();
      const sortedFins = [...g.dateFins].sort();
      const worstMargin =
        g.margins.length > 0 ? Math.min(...g.margins) : Infinity;

      result.push({
        articleId,
        label: g.label,
        ofCount: g.ofIds.length,
        ofIds: g.ofIds,
        minDate: sortedDates[0],
        maxDate: sortedFins[sortedFins.length - 1],
        worstMargin: worstMargin === Infinity ? 99 : worstMargin,
      });
    }

    // Sort by worst margin ASC (most critical first)
    result.sort((a, b) => a.worstMargin - b.worstMargin);
    return result;
  }, [nodes, marginMap]);

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
  const chartHeight = rows.length * ROW_HEIGHT;

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

  // Handlers
  const handleClick = useCallback(
    (articleId: string) => {
      setFilters({ articleType: articleId });
      setGanttResolution('segment');
    },
    [setFilters, setGanttResolution],
  );

  const handleDoubleClick = useCallback(
    (articleId: string) => {
      setFilters({ articleType: articleId });
      setGanttResolution('of');
    },
    [setFilters, setGanttResolution],
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
            Famille d&apos;articles
          </div>
          <div style={{ height: chartHeight }}>
            {rows.map((row, i) => (
              <div
                key={row.articleId}
                className="flex items-center justify-between overflow-hidden border-b px-3 text-xs"
                style={{
                  height: ROW_HEIGHT,
                  borderColor: 'var(--pp-border)',
                  backgroundColor:
                    i % 2 === 0 ? 'var(--pp-surface)' : 'var(--pp-bg)',
                  color: 'var(--pp-navy)',
                  cursor: 'pointer',
                }}
                onClick={() => handleClick(row.articleId)}
                onDoubleClick={() => handleDoubleClick(row.articleId)}
                title={`${row.label} (${row.ofCount} OFs)`}
              >
                <span className="truncate font-medium">{row.label}</span>
                <span
                  className="ml-1 shrink-0 text-[10px]"
                  style={{ color: 'var(--pp-text-secondary)' }}
                >
                  {row.ofCount}
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
                <g key={`bg-${row.articleId}`}>
                  <rect
                    x={0}
                    y={i * ROW_HEIGHT}
                    width={chartWidth}
                    height={ROW_HEIGHT}
                    fill={i % 2 === 0 ? 'transparent' : 'rgba(0, 0, 0, 0.015)'}
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

              {/* Macro bars */}
              {rows.map((row, i) => {
                const x1 = xScale(parseISO(row.minDate));
                const x2 = xScale(parseISO(row.maxDate));
                const barWidth = Math.max(x2 - x1, 6);
                const barY = i * ROW_HEIGHT + 4;
                const barHeight = ROW_HEIGHT - 14;
                const fillColor = getBarColor(row.worstMargin);

                // Charge indicator
                const chargePercent = Math.min((row.ofCount / 10) * 100, 100);
                const chargeColor =
                  chargePercent > 90 ? 'var(--pp-coral)' : 'var(--pp-blue)';

                return (
                  <g
                    key={row.articleId}
                    style={{ cursor: 'pointer' }}
                    onClick={() => handleClick(row.articleId)}
                    onDoubleClick={() => handleDoubleClick(row.articleId)}
                  >
                    {/* Main bar */}
                    <rect
                      x={x1}
                      y={barY}
                      width={barWidth}
                      height={barHeight}
                      rx={3}
                      ry={3}
                      fill={fillColor}
                    />
                    {/* Bar label */}
                    {barWidth > 40 && (
                      <text
                        x={x1 + 5}
                        y={barY + barHeight / 2 + 3}
                        fontSize={10}
                        fontWeight={600}
                        fill="white"
                        style={{ userSelect: 'none', pointerEvents: 'none' }}
                      >
                        {row.label} ({row.ofCount})
                      </text>
                    )}

                    {/* Charge indicator bar (6px below main bar) */}
                    <rect
                      x={x1}
                      y={barY + barHeight + 2}
                      width={barWidth * (chargePercent / 100)}
                      height={6}
                      rx={2}
                      ry={2}
                      fill={chargeColor}
                      opacity={0.7}
                    />
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
