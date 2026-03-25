import { useCallback, useEffect, useRef, useState } from 'react';
import * as d3 from 'd3';
import { Spinner } from '@fli-dgtf/flow-ui';
import { useStrategicData } from '@/features/graph/hooks/use-strategic-data';
import { useGraphNavigation } from '@/features/graph/hooks/use-graph-navigation';
import { getMarginColor } from '@/features/graph/utils/margin-color';
import { GroupTooltip, type GroupTooltipProps } from './group-tooltip';
import type { StrategicGroup, StrategicLink } from '@/providers/api/graph';

// ── Helpers ──────────────────────────────────────────────────────
function bubbleRadius(ofCount: number): number {
  return Math.max(30, Math.min(100, Math.sqrt(ofCount) * 15));
}

function truncateText(text: string, maxLen: number): string {
  return text.length > maxLen ? text.slice(0, maxLen - 1) + '\u2026' : text;
}

// ── Simulation node type ─────────────────────────────────────────
interface SimNode extends d3.SimulationNodeDatum {
  id: string;
  group: StrategicGroup;
  r: number;
}

// ── Component ────────────────────────────────────────────────────
export function BubbleMap() {
  const { data, isLoading, isError, groupBy } = useStrategicData();
  const { goToCommand } = useGraphNavigation();
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [tooltip, setTooltip] = useState<GroupTooltipProps>({
    group: null,
    position: { x: 0, y: 0 },
  });

  const renderChart = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !data) return;

    const container = containerRef.current;
    const width = container.clientWidth;
    const height = container.clientHeight;

    if (width === 0 || height === 0) return;

    const svg = d3.select(svgRef.current);
    svg.selectAll('*').remove();
    svg.attr('viewBox', `0 0 ${width} ${height}`);

    const { groups, links } = data;
    if (groups.length === 0) return;

    // ── Time scale for X positioning ────────────────────────────
    const dates = groups.map((g) => new Date(g.temporalCenter).getTime());
    const minDate = Math.min(...dates);
    const maxDate = Math.max(...dates);
    const dateRange = maxDate - minDate || 1;

    const xScale = (date: string) => {
      const t = new Date(date).getTime();
      const ratio = (t - minDate) / dateRange;
      return 100 + ratio * (width - 200);
    };

    // ── Build simulation nodes ──────────────────────────────────
    const simNodes: SimNode[] = groups.map((g) => ({
      id: g.id,
      group: g,
      r: bubbleRadius(g.ofCount),
      x: xScale(g.temporalCenter),
      y: height / 2,
    }));

    const nodeMap = new Map(simNodes.map((n) => [n.id, n]));

    // ── Build links ─────────────────────────────────────────────
    const simLinks = links
      .filter((l) => nodeMap.has(l.sourceGroupId) && nodeMap.has(l.targetGroupId))
      .map((l) => ({
        source: l.sourceGroupId,
        target: l.targetGroupId,
        data: l,
      }));

    // ── Force simulation ────────────────────────────────────────
    const simulation = d3
      .forceSimulation<SimNode>(simNodes)
      .force(
        'x',
        d3.forceX<SimNode>((d) => xScale(d.group.temporalCenter)).strength(0.4),
      )
      .force('y', d3.forceY<SimNode>(height / 2).strength(0.15))
      .force(
        'collide',
        d3.forceCollide<SimNode>((d) => d.r + 6).strength(0.8),
      )
      .force('charge', d3.forceManyBody().strength(-30))
      .alphaDecay(0.05)
      .velocityDecay(0.4);

    // ── Link elements ───────────────────────────────────────────
    const linkGroup = svg.append('g').attr('class', 'links');

    const linkElements = linkGroup
      .selectAll('line')
      .data(simLinks)
      .join('line')
      .attr('stroke', (d) =>
        d.data.hasDelayedDependency ? 'var(--pp-red)' : '#D5D3CC',
      )
      .attr('stroke-width', (d) =>
        Math.min(d.data.sharedDependencyCount, 5),
      )
      .attr('stroke-opacity', 0.6);

    // ── Bubble groups ───────────────────────────────────────────
    const bubbleGroup = svg.append('g').attr('class', 'bubbles');

    const bubbles = bubbleGroup
      .selectAll<SVGGElement, SimNode>('g')
      .data(simNodes, (d) => d.id)
      .join('g')
      .attr('cursor', 'pointer');

    // Circle
    bubbles
      .append('circle')
      .attr('r', (d) => d.r)
      .attr('fill', (d) => getMarginColor(d.group.avgMargin))
      .attr('fill-opacity', (d) => (d.group.alertCount > 0 ? 1.0 : 0.4))
      .attr('stroke', (d) =>
        d.group.hasCriticalPath ? 'var(--pp-red)' : '#B0AFA8',
      )
      .attr('stroke-width', (d) => (d.group.hasCriticalPath ? 3 : 1));

    // Text line 1 - label
    bubbles
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '-0.6em')
      .attr('font-size', '12px')
      .attr('font-weight', 'bold')
      .attr('fill', 'var(--pp-navy)')
      .attr('pointer-events', 'none')
      .text((d) => truncateText(d.group.label, Math.floor(d.r / 5)));

    // Text line 2 - OF count
    bubbles
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '0.7em')
      .attr('font-size', '10px')
      .attr('fill', 'var(--pp-text-secondary)')
      .attr('pointer-events', 'none')
      .text((d) => `${d.group.ofCount} OF`);

    // Text line 3 - margin
    bubbles
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dy', '2.0em')
      .attr('font-size', '10px')
      .attr('font-weight', '600')
      .attr('fill', (d) => getMarginColor(d.group.avgMargin))
      .attr('pointer-events', 'none')
      .text((d) => `${d.group.avgMargin.toFixed(0)}j`);

    // ── Interactions ────────────────────────────────────────────
    bubbles
      .on('mouseenter', (event: MouseEvent, d) => {
        setTooltip({
          group: {
            label: d.group.label,
            ofCount: d.group.ofCount,
            avgMargin: d.group.avgMargin,
            minMargin: d.group.minMargin,
            alertCount: d.group.alertCount,
          },
          position: { x: event.clientX, y: event.clientY },
        });
      })
      .on('mousemove', (event: MouseEvent) => {
        setTooltip((prev) => ({
          ...prev,
          position: { x: event.clientX, y: event.clientY },
        }));
      })
      .on('mouseleave', () => {
        setTooltip({ group: null, position: { x: 0, y: 0 } });
      })
      .on('click', (_event: MouseEvent, d) => {
        if (d.group.ofIds.length > 0) {
          goToCommand(d.group.ofIds[0], d.group.label);
        }
      });

    // ── Tick handler ────────────────────────────────────────────
    simulation.on('tick', () => {
      // Clamp positions to SVG bounds
      for (const node of simNodes) {
        node.x = Math.max(node.r, Math.min(width - node.r, node.x ?? 0));
        node.y = Math.max(node.r, Math.min(height - node.r, node.y ?? 0));
      }

      linkElements
        .attr('x1', (d) => nodeMap.get(d.source as string)?.x ?? 0)
        .attr('y1', (d) => nodeMap.get(d.source as string)?.y ?? 0)
        .attr('x2', (d) => nodeMap.get(d.target as string)?.x ?? 0)
        .attr('y2', (d) => nodeMap.get(d.target as string)?.y ?? 0);

      bubbles.attr('transform', (d) => `translate(${d.x},${d.y})`);
    });

    // Stop after convergence
    simulation.on('end', () => {
      simulation.stop();
    });

    // Cleanup
    return () => {
      simulation.stop();
    };
  }, [data, goToCommand]);

  // Render on data or size change
  useEffect(() => {
    const cleanup = renderChart();

    const resizeObserver = new ResizeObserver(() => {
      renderChart();
    });

    if (containerRef.current) {
      resizeObserver.observe(containerRef.current);
    }

    return () => {
      cleanup?.();
      resizeObserver.disconnect();
    };
  }, [renderChart]);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
        <span className="ml-3" style={{ color: 'var(--pp-text-secondary)' }}>
          Chargement de la vue strategique...
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
        Erreur lors du chargement des donnees strategiques.
      </div>
    );
  }

  if (data && data.groups.length === 0) {
    return (
      <div
        className="flex flex-1 items-center justify-center"
        style={{ color: 'var(--pp-text-secondary)' }}
      >
        Aucun groupe a afficher pour ce critere.
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative flex-1" style={{ minHeight: 0 }}>
      <svg
        ref={svgRef}
        className="h-full w-full"
        style={{ display: 'block' }}
      />
      <GroupTooltip group={tooltip.group} position={tooltip.position} />
    </div>
  );
}
