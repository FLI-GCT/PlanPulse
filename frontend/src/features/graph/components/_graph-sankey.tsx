import { useMemo, useRef, useEffect, useCallback } from 'react';
import { useGraphStore } from '@/providers/state/graph-store';
import { useUiStore } from '@/providers/state/ui-store';

// Attempt to import d3-sankey. If it's not installed, we'll show a placeholder.
let sankey: typeof import('d3-sankey').sankey | undefined;
let sankeyLinkHorizontal:
  | typeof import('d3-sankey').sankeyLinkHorizontal
  | undefined;

try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const d3Sankey = require('d3-sankey');
  sankey = d3Sankey.sankey;
  sankeyLinkHorizontal = d3Sankey.sankeyLinkHorizontal;
} catch {
  // d3-sankey not installed
}

interface SankeyNode {
  id: string;
  name: string;
  column: number;
  color: string;
}

interface SankeyLink {
  source: string;
  target: string;
  value: number;
}

function worstMarginColor(
  nodeIds: string[],
  margins: { nodeId: string; floatTotal: number }[],
): string {
  let worst = Infinity;
  for (const id of nodeIds) {
    const m = margins.find((mg) => mg.nodeId === id);
    if (m && m.floatTotal < worst) worst = m.floatTotal;
  }
  if (worst <= 0) return 'var(--pp-red)';
  if (worst <= 5) return 'var(--pp-amber)';
  return 'var(--pp-green)';
}

export function SankeyView() {
  const setGraphTab = useUiStore((s) => s.setGraphTab);

  if (!sankey || !sankeyLinkHorizontal) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3">
        <p
          className="text-sm"
          style={{ color: 'var(--pp-text-secondary)' }}
        >
          Installer <code className="rounded bg-gray-100 px-1.5 py-0.5 font-mono text-xs">d3-sankey</code> pour activer cette vue.
        </p>
        <p
          className="font-mono text-xs"
          style={{ color: 'var(--pp-text-secondary)' }}
        >
          yarn add d3-sankey @types/d3-sankey
        </p>
      </div>
    );
  }

  return <SankeyDiagram onNavigateToReseau={() => setGraphTab('reseau')} />;
}

function SankeyDiagram({
  onNavigateToReseau,
}: {
  onNavigateToReseau: () => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const margins = useGraphStore((s) => s.margins);

  // Build sankey data
  const sankeyData = useMemo(() => {
    const sNodes: SankeyNode[] = [];
    const sLinks: SankeyLink[] = [];
    const nodeIdSet = new Set<string>();

    // Column 1: Fournisseurs (grouped from achat nodes)
    const fournisseurMap = new Map<string, string[]>(); // name -> achatIds
    for (const n of nodes) {
      if (n.type === 'achat' && n.fournisseur) {
        if (!fournisseurMap.has(n.fournisseur)) {
          fournisseurMap.set(n.fournisseur, []);
        }
        fournisseurMap.get(n.fournisseur)!.push(n.id);
      }
    }

    for (const [name, achatIds] of fournisseurMap) {
      const fId = `f:${name}`;
      sNodes.push({
        id: fId,
        name,
        column: 0,
        color: worstMarginColor(achatIds, margins),
      });
      nodeIdSet.add(fId);
    }

    // Column 2: Articles (grouped from achat nodes by articleId)
    const articleMap = new Map<string, string[]>(); // articleId -> achatIds
    for (const n of nodes) {
      if (n.type === 'achat' && n.articleId) {
        if (!articleMap.has(n.articleId)) {
          articleMap.set(n.articleId, []);
        }
        articleMap.get(n.articleId)!.push(n.id);
      }
    }

    for (const [articleId, achatIds] of articleMap) {
      const aId = `a:${articleId}`;
      sNodes.push({
        id: aId,
        name: articleId,
        column: 1,
        color: worstMarginColor(achatIds, margins),
      });
      nodeIdSet.add(aId);
    }

    // Links: fournisseur -> article
    for (const n of nodes) {
      if (n.type === 'achat' && n.fournisseur && n.articleId) {
        const fId = `f:${n.fournisseur}`;
        const aId = `a:${n.articleId}`;
        const existing = sLinks.find(
          (l) => l.source === fId && l.target === aId,
        );
        if (existing) {
          existing.value++;
        } else {
          sLinks.push({ source: fId, target: aId, value: 1 });
        }
      }
    }

    // Column 3: Sub-OFs (OF with at least one NOMENCLATURE incoming edge from an achat or article)
    // Column 4: Root OFs (OF with no parent = no NOMENCLATURE edge pointing to them as target)
    const ofNodes = nodes.filter((n) => n.type === 'of');

    // Find sub-OFs: OF nodes that are targets of edges from achat nodes
    const achatTargetOfIds = new Set<string>();
    for (const e of edges) {
      if (e.sourceType === 'achat' && e.targetType === 'of') {
        achatTargetOfIds.add(e.targetId);
      }
    }

    // Root OFs: OFs that have child edges (are sources in NOMENCLATURE edges to other OFs)
    // or OFs with no parent OF edge
    const hasParentOf = new Set<string>();
    for (const e of edges) {
      if (
        e.sourceType === 'of' &&
        e.targetType === 'of' &&
        e.typeLien === 'NOMENCLATURE'
      ) {
        hasParentOf.add(e.targetId);
      }
    }

    const subOfIds = new Set<string>();
    const rootOfIds = new Set<string>();

    for (const of_ of ofNodes) {
      if (hasParentOf.has(of_.id) || achatTargetOfIds.has(of_.id)) {
        subOfIds.add(of_.id);
      } else {
        rootOfIds.add(of_.id);
      }
    }

    // Add sub-OF nodes (column 2)
    for (const id of subOfIds) {
      const n = nodes.find((nd) => nd.id === id);
      if (!n) continue;
      const sId = `sof:${id}`;
      sNodes.push({
        id: sId,
        name: n.label,
        column: 2,
        color: worstMarginColor([id], margins),
      });
      nodeIdSet.add(sId);
    }

    // Add root OF nodes (column 3)
    for (const id of rootOfIds) {
      const n = nodes.find((nd) => nd.id === id);
      if (!n) continue;
      const rId = `rof:${id}`;
      sNodes.push({
        id: rId,
        name: n.label,
        column: 3,
        color: worstMarginColor([id], margins),
      });
      nodeIdSet.add(rId);
    }

    // Links: article -> sub-OF (via edges from achat to OF)
    for (const e of edges) {
      if (e.sourceType === 'achat' && e.targetType === 'of') {
        const achatNode = nodes.find((n) => n.id === e.sourceId);
        if (!achatNode?.articleId) continue;
        const aId = `a:${achatNode.articleId}`;
        const targetId = subOfIds.has(e.targetId)
          ? `sof:${e.targetId}`
          : `rof:${e.targetId}`;
        if (!nodeIdSet.has(aId) || !nodeIdSet.has(targetId)) continue;
        const existing = sLinks.find(
          (l) => l.source === aId && l.target === targetId,
        );
        if (existing) {
          existing.value++;
        } else {
          sLinks.push({ source: aId, target: targetId, value: 1 });
        }
      }
    }

    // Links: sub-OF -> root-OF (via NOMENCLATURE edges)
    for (const e of edges) {
      if (
        e.sourceType === 'of' &&
        e.targetType === 'of' &&
        e.typeLien === 'NOMENCLATURE'
      ) {
        const srcId = subOfIds.has(e.sourceId)
          ? `sof:${e.sourceId}`
          : rootOfIds.has(e.sourceId)
            ? `rof:${e.sourceId}`
            : null;
        const tgtId = rootOfIds.has(e.targetId)
          ? `rof:${e.targetId}`
          : subOfIds.has(e.targetId)
            ? `sof:${e.targetId}`
            : null;
        if (!srcId || !tgtId || !nodeIdSet.has(srcId) || !nodeIdSet.has(tgtId))
          continue;
        if (srcId === tgtId) continue;
        const existing = sLinks.find(
          (l) => l.source === srcId && l.target === tgtId,
        );
        if (existing) {
          existing.value++;
        } else {
          sLinks.push({ source: srcId, target: tgtId, value: 1 });
        }
      }
    }

    return { nodes: sNodes, links: sLinks };
  }, [nodes, edges, margins]);

  const draw = useCallback(() => {
    if (!svgRef.current || !containerRef.current || !sankey || !sankeyLinkHorizontal)
      return;

    const rect = containerRef.current.getBoundingClientRect();
    const width = rect.width;
    const height = Math.max(rect.height, 400);

    const svg = svgRef.current;
    // Clear previous
    while (svg.firstChild) svg.removeChild(svg.firstChild);

    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));

    if (sankeyData.nodes.length === 0) return;

    // Build index-based data for d3-sankey
    const nodeIndex = new Map<string, number>();
    const d3Nodes = sankeyData.nodes.map((n, i) => {
      nodeIndex.set(n.id, i);
      return { ...n, index: i };
    });

    const d3Links = sankeyData.links
      .filter(
        (l) => nodeIndex.has(l.source) && nodeIndex.has(l.target),
      )
      .map((l) => ({
        source: nodeIndex.get(l.source)!,
        target: nodeIndex.get(l.target)!,
        value: l.value,
      }));

    const sankeyLayout = sankey!<
      (typeof d3Nodes)[number],
      (typeof d3Links)[number]
    >()
      .nodeId((d: { index: number }) => d.index)
      .nodeWidth(18)
      .nodePadding(12)
      .nodeSort(null)
      .extent([
        [20, 20],
        [width - 20, height - 20],
      ]);

    const graph = sankeyLayout({
      nodes: d3Nodes.map((d) => ({ ...d })),
      links: d3Links.map((d) => ({ ...d })),
    });

    const linkGen = sankeyLinkHorizontal!();

    // Draw links
    const linksG = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'g',
    );
    linksG.setAttribute('fill', 'none');
    linksG.setAttribute('stroke-opacity', '0.3');

    for (const link of graph.links) {
      const path = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'path',
      );
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const d = linkGen(link as any);
      if (d) path.setAttribute('d', d);
      path.setAttribute(
        'stroke',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (link.source as any).color ?? '#999',
      );
      path.setAttribute(
        'stroke-width',
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        String(Math.max(1, (link as any).width ?? 1)),
      );
      linksG.appendChild(path);
    }
    svg.appendChild(linksG);

    // Draw nodes
    const nodesG = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'g',
    );
    for (const node of graph.nodes) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const n = node as any;
      const rect = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'rect',
      );
      rect.setAttribute('x', String(n.x0));
      rect.setAttribute('y', String(n.y0));
      rect.setAttribute('height', String(Math.max(1, n.y1 - n.y0)));
      rect.setAttribute('width', String(n.x1 - n.x0));
      rect.setAttribute('fill', n.color ?? '#999');
      rect.setAttribute('rx', '3');
      rect.style.cursor = 'pointer';
      rect.addEventListener('click', () => {
        onNavigateToReseau();
      });

      nodesG.appendChild(rect);

      // Label
      const text = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'text',
      );
      const isLeft = n.x0 < width / 2;
      text.setAttribute(
        'x',
        String(isLeft ? n.x1 + 6 : n.x0 - 6),
      );
      text.setAttribute('y', String((n.y0 + n.y1) / 2));
      text.setAttribute('dy', '0.35em');
      text.setAttribute('text-anchor', isLeft ? 'start' : 'end');
      text.setAttribute('font-size', '11');
      text.setAttribute('fill', 'var(--pp-navy)');
      text.textContent =
        n.name.length > 20 ? n.name.slice(0, 18) + '...' : n.name;
      nodesG.appendChild(text);
    }
    svg.appendChild(nodesG);

    // Column labels
    const COLUMN_LABELS = [
      'Fournisseurs',
      'Articles',
      'Sous-OF',
      'Commandes',
    ];
    const colG = document.createElementNS(
      'http://www.w3.org/2000/svg',
      'g',
    );
    // Find x positions for each column
    const colXs = [0, 1, 2, 3].map((col) => {
      const colNodes = graph.nodes.filter(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        (n: any) => sankeyData.nodes[n.index]?.column === col,
      );
      if (colNodes.length === 0) return null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x0 = (colNodes[0] as any).x0 ?? 0;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const x1 = (colNodes[0] as any).x1 ?? 18;
      return (x0 + x1) / 2;
    });

    for (let i = 0; i < COLUMN_LABELS.length; i++) {
      const x = colXs[i];
      if (x == null) continue;
      const label = document.createElementNS(
        'http://www.w3.org/2000/svg',
        'text',
      );
      label.setAttribute('x', String(x));
      label.setAttribute('y', '12');
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('font-size', '10');
      label.setAttribute('font-weight', '600');
      label.setAttribute('fill', 'var(--pp-text-secondary)');
      label.setAttribute('text-transform', 'uppercase');
      label.textContent = COLUMN_LABELS[i];
      colG.appendChild(label);
    }
    svg.appendChild(colG);
  }, [sankeyData, onNavigateToReseau]);

  useEffect(() => {
    draw();
    const observer = new ResizeObserver(() => draw());
    if (containerRef.current) observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [draw]);

  if (sankeyData.nodes.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <p
          className="text-sm"
          style={{ color: 'var(--pp-text-secondary)' }}
        >
          Aucune donnee disponible pour le diagramme Sankey.
        </p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="flex-1 overflow-auto">
      <svg ref={svgRef} />
    </div>
  );
}
