import type { GraphNode, GraphEdge } from '@/providers/state/graph-store';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

export const SIDEBAR_WIDTH = 200;
export const ROW_HEIGHT = 36;
export const HEADER_HEIGHT = 52;
export const DAY_WIDTH = 36;
export const INDENT_PX = 16;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface RowData {
  node: GraphNode;
  depth: number;
}

export interface DragSession {
  nodeId: string;
  startClientX: number;
  startDateDebut: Date;
  currentDeltaPx: number;
  lastEmitTime: number;
}

export interface PendingMove {
  nodeId: string;
  deltaJours: number;
  impactedNodes: import('@/providers/state/graph-store').PropagationResult[];
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Build a hierarchical row list: parents first, then their children indented. */
export function buildRows(
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
