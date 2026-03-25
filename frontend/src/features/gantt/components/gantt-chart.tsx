import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { scaleTime } from 'd3-scale';
import { timeDay, timeWeek } from 'd3-time';
import {
  parseISO,
  format,
  differenceInCalendarDays,
  getISOWeek,
  startOfDay,
} from 'date-fns';
import { fr } from 'date-fns/locale';

import { useGraphStore } from '@/providers/state/graph-store';
import type { GraphNode, GraphEdge, MarginResult, PropagationResult } from '@/providers/state/graph-store';
import { useUiStore } from '@/providers/state/ui-store';
import { useSocket } from '@/providers/socket/socket-context';
import { useSocketEmit } from '@/providers/socket/use-socket-emit';
import { useSocketEvent } from '@/providers/socket/use-socket-event';

import { GanttBar } from './gantt-bar';
import { MoveConfirmDialog } from './move-confirm-dialog';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const SIDEBAR_WIDTH = 200;
const ROW_HEIGHT = 36;
const HEADER_HEIGHT = 52;
const DAY_WIDTH = 36;
const INDENT_PX = 16;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RowData {
  node: GraphNode;
  depth: number;
}

interface DragSession {
  nodeId: string;
  startClientX: number;
  startDateDebut: Date;
  currentDeltaPx: number;
  lastEmitTime: number;
}

interface PendingMove {
  nodeId: string;
  deltaJours: number;
  impactedNodes: PropagationResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a hierarchical row list: parents first, then their children indented. */
function buildRows(
  nodes: GraphNode[],
  edges: GraphEdge[],
  statutFilter: string[],
  criticalFilter: boolean,
  criticalPath: string[],
): RowData[] {
  // Filter to OFs only
  let ofNodes = nodes.filter((n) => n.type === 'of');

  // Apply statut filter (ignore __critical__ marker)
  const realStatuts = statutFilter.filter((s) => s !== '__critical__');
  if (realStatuts.length > 0) {
    ofNodes = ofNodes.filter((n) => realStatuts.includes(n.statut));
  }

  // Apply critical path filter
  const critSet = new Set(criticalPath);
  if (criticalFilter) {
    ofNodes = ofNodes.filter((n) => critSet.has(n.id));
  }

  // Build parent-child map from NOMENCLATURE edges
  // An edge sourceId -> targetId where both are 'of' and typeLien='NOMENCLATURE'
  // means sourceId is a parent of targetId (source depends on target being done first)
  // Actually in a BOM, the assembly (parent) has children (sub-OFs) that feed into it.
  // Let's find children: if an edge has sourceType='of', targetType='of', typeLien='NOMENCLATURE',
  // then targetId is a child that feeds into sourceId (the parent).
  const childrenOf = new Map<string, string[]>();
  const hasParent = new Set<string>();

  const ofIdSet = new Set(ofNodes.map((n) => n.id));

  for (const edge of edges) {
    if (
      edge.sourceType === 'of' &&
      edge.targetType === 'of' &&
      edge.typeLien === 'NOMENCLATURE' &&
      ofIdSet.has(edge.sourceId) &&
      ofIdSet.has(edge.targetId)
    ) {
      // sourceId is the parent (assembly), targetId is the child
      if (!childrenOf.has(edge.sourceId)) {
        childrenOf.set(edge.sourceId, []);
      }
      childrenOf.get(edge.sourceId)!.push(edge.targetId);
      hasParent.add(edge.targetId);
    }
  }

  const nodeMap = new Map(ofNodes.map((n) => [n.id, n]));
  const rows: RowData[] = [];
  const visited = new Set<string>();

  // Recursive function to add a node and its children
  function addNodeWithChildren(nodeId: string, depth: number) {
    if (visited.has(nodeId)) return;
    visited.add(nodeId);
    const node = nodeMap.get(nodeId);
    if (!node) return;
    rows.push({ node, depth });

    const children = childrenOf.get(nodeId) ?? [];
    // Sort children by dateDebut
    children.sort((a, b) => {
      const na = nodeMap.get(a);
      const nb = nodeMap.get(b);
      if (!na || !nb) return 0;
      return na.dateDebut.localeCompare(nb.dateDebut);
    });
    for (const childId of children) {
      addNodeWithChildren(childId, depth + 1);
    }
  }

  // Roots: nodes that have no parent
  const roots = ofNodes
    .filter((n) => !hasParent.has(n.id))
    .sort((a, b) => a.dateDebut.localeCompare(b.dateDebut));

  for (const root of roots) {
    addNodeWithChildren(root.id, 0);
  }

  // Add any remaining nodes that weren't reached (orphans)
  for (const node of ofNodes) {
    if (!visited.has(node.id)) {
      rows.push({ node, depth: 0 });
    }
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GanttChart() {
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const margins = useGraphStore((s) => s.margins);
  const criticalPath = useGraphStore((s) => s.criticalPath);
  const propagationPreview = useGraphStore((s) => s.propagationPreview);
  const applyPreview = useGraphStore((s) => s.applyPreview);
  const clearPreview = useGraphStore((s) => s.clearPreview);

  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const selectNode = useUiStore((s) => s.selectNode);
  const filters = useUiStore((s) => s.filters);
  const ganttZoom = useUiStore((s) => s.ganttZoom);
  const startDragStore = useUiStore((s) => s.startDrag);
  const endDragStore = useUiStore((s) => s.endDrag);

  const { isConnected } = useSocket();
  const emit = useSocketEmit();

  // Refs for drag
  const dragRef = useRef<DragSession | null>(null);
  const requestIdRef = useRef(0);
  const lastEmittedRequestIdRef = useRef(0);
  const svgRef = useRef<SVGSVGElement>(null);
  const sidebarRef = useRef<HTMLDivElement>(null);
  const chartScrollRef = useRef<HTMLDivElement>(null);
  const rafRef = useRef<number>(0);

  // Drag visual state (only the delta in pixels, for re-render)
  const [dragDelta, setDragDelta] = useState<{ nodeId: string; deltaPx: number } | null>(null);
  const [pendingMove, setPendingMove] = useState<PendingMove | null>(null);

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

  // Preview lookup
  const previewMap = useMemo(() => {
    const m = new Map<string, PropagationResult>();
    if (!propagationPreview) return m;
    for (const p of propagationPreview) {
      m.set(p.nodeId, p);
    }
    return m;
  }, [propagationPreview]);

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

  // ---- Dependency lines for selected node ----

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

  // ---- Socket event: preview result ----

  const handlePreviewResult = useCallback(
    (data: { requestId: number; impactedNodes: PropagationResult[] }) => {
      if (data.requestId >= lastEmittedRequestIdRef.current) {
        applyPreview(data.impactedNodes);
      }
    },
    [applyPreview],
  );

  useSocketEvent('of:move-preview-result', handlePreviewResult);

  // ---- Drag handlers ----

  const handleDragStart = useCallback(
    (nodeId: string, startClientX: number) => {
      if (!isConnected) return;

      const node = nodes.find((n) => n.id === nodeId);
      if (!node) return;

      requestIdRef.current += 1;
      const reqId = requestIdRef.current;

      dragRef.current = {
        nodeId,
        startClientX,
        startDateDebut: parseISO(node.dateDebut),
        currentDeltaPx: 0,
        lastEmitTime: 0,
      };

      startDragStore(nodeId, reqId);
      setDragDelta({ nodeId, deltaPx: 0 });
    },
    [isConnected, nodes, startDragStore],
  );

  const handleBarClick = useCallback(
    (nodeId: string) => {
      selectNode(nodeId);
    },
    [selectNode],
  );

  // Global mouse move & up for drag
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      const drag = dragRef.current;
      if (!drag) return;

      const deltaPx = e.clientX - drag.startClientX;
      drag.currentDeltaPx = deltaPx;

      // Update visual via rAF
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setDragDelta({ nodeId: drag.nodeId, deltaPx });
      });

      // Throttle emission to 100ms
      const now = Date.now();
      if (now - drag.lastEmitTime < 100) return;
      drag.lastEmitTime = now;

      // Convert pixel delta to date
      const newDate = xScale.invert(xScale(drag.startDateDebut) + deltaPx);
      requestIdRef.current += 1;
      const reqId = requestIdRef.current;
      lastEmittedRequestIdRef.current = reqId;

      emit('of:move-preview', {
        requestId: reqId,
        ofId: drag.nodeId,
        newDateDebut: newDate.toISOString(),
      });
    };

    const handleMouseUp = () => {
      const drag = dragRef.current;
      if (!drag) return;

      // Calculate final delta in days
      const newDate = xScale.invert(xScale(drag.startDateDebut) + drag.currentDeltaPx);
      const deltaDays = differenceInCalendarDays(newDate, drag.startDateDebut);

      dragRef.current = null;
      endDragStore();

      if (deltaDays === 0) {
        // No real move, clear preview
        clearPreview();
        setDragDelta(null);
        return;
      }

      // Show confirmation dialog
      setPendingMove({
        nodeId: drag.nodeId,
        deltaJours: deltaDays,
        impactedNodes: propagationPreview ?? [],
      });
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
      cancelAnimationFrame(rafRef.current);
    };
  }, [xScale, emit, endDragStore, clearPreview, propagationPreview]);

  // ---- Confirm / Cancel move ----

  const handleConfirmMove = useCallback(() => {
    if (!pendingMove) return;
    emit('of:move-commit', {
      ofId: pendingMove.nodeId,
      deltaJours: pendingMove.deltaJours,
    });
    clearPreview();
    setDragDelta(null);
    setPendingMove(null);
  }, [pendingMove, emit, clearPreview]);

  const handleCancelMove = useCallback(() => {
    clearPreview();
    setDragDelta(null);
    setPendingMove(null);
  }, [clearPreview]);

  // ---- Sync scroll between sidebar and chart ----

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
            ref={svgRef}
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

              {/* ---- OF bars ---- */}
              {rows.map((row, i) => {
                const margin = marginMap.get(row.node.id);
                const isCritical = criticalSet.has(row.node.id);
                const isSelected = row.node.id === selectedNodeId;
                const preview = previewMap.get(row.node.id);

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
              {propagationPreview &&
                propagationPreview
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
