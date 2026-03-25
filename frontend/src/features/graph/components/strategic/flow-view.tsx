import { useCallback, useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Spinner } from '@fli-dgtf/flow-ui';
import { useFlowData } from '@/features/graph/hooks/use-flow-data';
import { useGraphNavigation } from '@/features/graph/hooks/use-graph-navigation';
import { getMarginColor } from '@/features/graph/utils/margin-color';
import type { Flow, SharedPurchase, FlowWaypoint } from '@/providers/api/graph';

// ── Constants ────────────────────────────────────────────────────
const FLOW_MIN_HEIGHT = 20;
const FLOW_MAX_HEIGHT = 60;
const FLOW_GAP = 8;
const LEFT_MARGIN = 140;
const RIGHT_MARGIN = 40;
const TOP_MARGIN = 30;

// ── CSS for flow animation ──────────────────────────────────────
const FLOW_ANIMATION_STYLE = `
  @keyframes flowDash {
    to { stroke-dashoffset: -24; }
  }
  .flow-band {
    stroke-dasharray: 12 12;
    animation: flowDash 2s linear infinite;
  }
  .shared-purchase-pulse {
    animation: purchasePulse 1.5s ease-in-out infinite;
  }
  @keyframes purchasePulse {
    0%, 100% { stroke-opacity: 0.3; }
    50% { stroke-opacity: 1; }
  }
`;

// ── Helpers ──────────────────────────────────────────────────────
function flowHeight(componentCount: number): number {
  return Math.max(FLOW_MIN_HEIGHT, Math.min(FLOW_MAX_HEIGHT, componentCount * 8));
}

function waypointRadius(type: FlowWaypoint['type']): number {
  switch (type) {
    case 'achat':
      return 4;
    case 'sous_of':
      return 5;
    case 'assemblage':
      return 8;
    case 'jalon':
      return 6;
  }
}

// ── Component ────────────────────────────────────────────────────
export function FlowView() {
  const { data, isLoading, isError } = useFlowData();
  const { goToCommand } = useGraphNavigation();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [hoveredFlowId, setHoveredFlowId] = useState<string | null>(null);
  const [hoveredPurchaseId, setHoveredPurchaseId] = useState<string | null>(null);

  const renderChart = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !data) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const containerHeight = container.clientHeight;

    if (width === 0 || containerHeight === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();

    // Inject animation styles
    svg.append('defs').append('style').text(FLOW_ANIMATION_STYLE);

    const { flows, sharedPurchases } = data;
    if (flows.length === 0) return;

    // Sort flows by tension (worst on top)
    const sortedFlows = [...flows].sort((a, b) => a.tension - b.tension);

    // ── Compute time scale ─────────────────────────────────────
    const allDates = sortedFlows.flatMap((f) =>
      f.waypoints.map((wp) => new Date(wp.date)),
    );
    if (allDates.length === 0) return;

    const minDate = d3.min(allDates) as Date;
    const maxDate = d3.max(allDates) as Date;
    const twoWeeks = 14 * 24 * 60 * 60 * 1000;

    const xScale = d3
      .scaleTime()
      .domain([minDate, new Date(maxDate.getTime() + twoWeeks)])
      .range([LEFT_MARGIN, width - RIGHT_MARGIN]);

    // ── Compute flow vertical positions ────────────────────────
    const flowYPositions: Array<{ flow: Flow; y: number; h: number }> = [];
    let currentY = TOP_MARGIN;

    for (const flow of sortedFlows) {
      const h = flowHeight(flow.componentCount);
      flowYPositions.push({ flow, y: currentY, h });
      currentY += h + FLOW_GAP;
    }

    const totalHeight = Math.max(containerHeight, currentY + TOP_MARGIN);
    svg.attr('viewBox', `0 0 ${width} ${totalHeight}`);

    // ── Shared purchases (background vertical rectangles) ──────
    const purchaseGroup = svg.append('g').attr('class', 'shared-purchases');

    for (const purchase of sharedPurchases) {
      // Find the flows connected to this purchase
      const connectedPositions = flowYPositions.filter((fp) =>
        purchase.flowsConnected.includes(fp.flow.ofFinalId),
      );
      if (connectedPositions.length < 2) continue;

      // Find a waypoint date for this purchase (approximate from first connected flow)
      let purchaseX = width / 2;
      for (const fp of connectedPositions) {
        const achatWp = fp.flow.waypoints.find(
          (wp) => wp.type === 'achat',
        );
        if (achatWp) {
          purchaseX = xScale(new Date(achatWp.date));
          break;
        }
      }

      const minY = Math.min(...connectedPositions.map((fp) => fp.y));
      const maxYBottom = Math.max(
        ...connectedPositions.map((fp) => fp.y + fp.h),
      );

      const rectWidth = 12;
      const rect = purchaseGroup
        .append('rect')
        .attr('x', purchaseX - rectWidth / 2)
        .attr('y', minY - 4)
        .attr('width', rectWidth)
        .attr('height', maxYBottom - minY + 8)
        .attr('rx', 3)
        .attr('fill', '#7F77DD')
        .attr('fill-opacity', 0.15)
        .attr('stroke', purchase.isDelayed ? 'var(--pp-red)' : '#7F77DD')
        .attr('stroke-width', purchase.isDelayed ? 2 : 1)
        .attr('cursor', 'pointer')
        .attr('data-purchase-id', purchase.achatId);

      if (purchase.isDelayed) {
        rect.attr('class', 'shared-purchase-pulse');
      }

      // Penury badge
      if (purchase.isPenury) {
        purchaseGroup
          .append('text')
          .attr('x', purchaseX)
          .attr('y', minY - 8)
          .attr('text-anchor', 'middle')
          .attr('font-size', '9px')
          .attr('font-weight', '600')
          .attr('fill', 'var(--pp-amber)')
          .text('Penurie');
      }

      // Hover interactions for shared purchases
      rect
        .on('mouseenter', () => {
          setHoveredPurchaseId(purchase.achatId);
        })
        .on('mouseleave', () => {
          setHoveredPurchaseId(null);
        });
    }

    // ── Flow bands ─────────────────────────────────────────────
    const flowGroup = svg.append('g').attr('class', 'flows');

    for (const { flow, y, h } of flowYPositions) {
      const g = flowGroup.append('g').attr('data-flow-id', flow.ofFinalId);

      // Determine opacity based on hover state
      const isHoveredFlow = hoveredFlowId === flow.ofFinalId;
      const isConnectedToPurchase =
        hoveredPurchaseId != null &&
        sharedPurchases.some(
          (sp) =>
            sp.achatId === hoveredPurchaseId &&
            sp.flowsConnected.includes(flow.ofFinalId),
        );
      const shouldHighlight =
        hoveredFlowId === null && hoveredPurchaseId === null
          ? true
          : isHoveredFlow || isConnectedToPurchase;

      const flowOpacity = shouldHighlight ? 1.0 : 0.2;

      // Sort waypoints by date
      const sortedWaypoints = [...flow.waypoints].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
      );

      // Flow band rectangle
      const x1 =
        sortedWaypoints.length > 0
          ? xScale(new Date(sortedWaypoints[0].date))
          : LEFT_MARGIN;
      const x2 =
        sortedWaypoints.length > 0
          ? xScale(new Date(sortedWaypoints[sortedWaypoints.length - 1].date))
          : width - RIGHT_MARGIN;

      g.append('rect')
        .attr('x', x1)
        .attr('y', y)
        .attr('width', Math.max(x2 - x1, 20))
        .attr('height', h)
        .attr('rx', 4)
        .attr('fill', getMarginColor(flow.tension))
        .attr('fill-opacity', 0.12 * flowOpacity)
        .attr('stroke', getMarginColor(flow.tension))
        .attr('stroke-width', 1.5)
        .attr('stroke-opacity', 0.5 * flowOpacity)
        .attr('class', 'flow-band');

      // Center Y of band
      const cy = y + h / 2;

      // Flow label on the left
      g.append('text')
        .attr('x', LEFT_MARGIN - 8)
        .attr('y', cy)
        .attr('text-anchor', 'end')
        .attr('dominant-baseline', 'central')
        .attr('font-size', '11px')
        .attr('font-weight', '600')
        .attr('fill', 'var(--pp-navy)')
        .attr('opacity', flowOpacity)
        .text(
          flow.clientName.length > 16
            ? flow.clientName.slice(0, 15) + '\u2026'
            : flow.clientName,
        );

      // Waypoints
      for (const wp of sortedWaypoints) {
        const wpX = xScale(new Date(wp.date));

        if (wp.type === 'jalon') {
          // Diamond shape for jalon
          const size = waypointRadius(wp.type);
          g.append('path')
            .attr(
              'd',
              `M${wpX},${cy - size} L${wpX + size},${cy} L${wpX},${cy + size} L${wpX - size},${cy} Z`,
            )
            .attr('fill', getMarginColor(wp.margin))
            .attr('stroke', 'var(--pp-navy)')
            .attr('stroke-width', 1)
            .attr('opacity', flowOpacity);
        } else {
          // Circle for other types
          const r = waypointRadius(wp.type);
          const fillColor =
            wp.type === 'achat' ? '#7F77DD' : getMarginColor(wp.margin);

          g.append('circle')
            .attr('cx', wpX)
            .attr('cy', cy)
            .attr('r', r)
            .attr('fill', fillColor)
            .attr('stroke', '#fff')
            .attr('stroke-width', 1)
            .attr('opacity', flowOpacity);
        }
      }

      // Interaction area (invisible rect covering the band)
      g.append('rect')
        .attr('x', 0)
        .attr('y', y)
        .attr('width', width)
        .attr('height', h)
        .attr('fill', 'transparent')
        .attr('cursor', 'pointer')
        .on('mouseenter', () => {
          setHoveredFlowId(flow.ofFinalId);
        })
        .on('mouseleave', () => {
          setHoveredFlowId(null);
        })
        .on('click', () => {
          goToCommand(flow.ofFinalId, flow.clientName);
        });
    }

    // ── Time axis ──────────────────────────────────────────────
    const axisGroup = svg
      .append('g')
      .attr('transform', `translate(0,${totalHeight - 20})`);

    const xAxis = d3
      .axisBottom(xScale)
      .ticks(d3.timeWeek.every(1))
      .tickFormat((d) => {
        const date = d as Date;
        return `S${d3.timeFormat('%W')(date)}`;
      });

    axisGroup
      .call(xAxis)
      .selectAll('text')
      .attr('font-size', '9px')
      .attr('fill', 'var(--pp-text-secondary)');

    axisGroup.selectAll('line').attr('stroke', 'var(--pp-border)');
    axisGroup.select('.domain').attr('stroke', 'var(--pp-border)');
  }, [data, goToCommand, hoveredFlowId, hoveredPurchaseId]);

  // Render on data or size change
  useEffect(() => {
    renderChart();

    const resizeObserver = new ResizeObserver(() => {
      renderChart();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      resizeObserver.disconnect();
    };
  }, [renderChart]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
        <span className="ml-3" style={{ color: 'var(--pp-text-secondary)' }}>
          Chargement des flux...
        </span>
      </div>
    );
  }

  if (isError) {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        style={{ color: 'var(--pp-red)' }}
      >
        Erreur lors du chargement des flux.
      </div>
    );
  }

  if (data && data.flows.length === 0) {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        style={{ color: 'var(--pp-text-secondary)' }}
      >
        Aucun flux a afficher.
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className="relative flex-1 overflow-auto"
      style={{ minHeight: 0 }}
    >
      <svg
        ref={svgRef}
        className="w-full"
        style={{ display: 'block', minHeight: '100%' }}
      />
    </div>
  );
}
