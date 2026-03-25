import { useMemo, useCallback } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetFooter,
  Badge,
  Button,
  Separator,
  Spinner,
  cn,
} from '@fli-dgtf/flow-ui';
import {
  XIcon,
  CalendarIcon,
  ArrowRightIcon,
  ArrowLeftIcon,
  LayersIcon,
  LinkIcon,
  FocusIcon,
  PackageIcon,
  TruckIcon,
} from 'lucide-react';
import { useUiStore } from '@/providers/state/ui-store';
import { useGraphStore, type GraphNode, type GraphEdge, type MarginResult } from '@/providers/state/graph-store';
import { useOfQuery } from '@/providers/api/of';
import { OfStatusBadge } from '@/components/shared/of-status-badge';
import { DateDisplay } from '@/components/shared/date-display';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function marginColorClass(floatTotal: number): string {
  if (floatTotal <= 0) return 'text-[var(--pp-red)] font-semibold';
  if (floatTotal <= 5) return 'text-[var(--pp-amber)] font-medium';
  return 'text-[var(--pp-green)]';
}

function prioriteBadge(priorite: number | null) {
  if (priorite == null) return null;
  const colorMap: Record<number, string> = {
    1: 'bg-red-100 text-red-800',
    2: 'bg-amber-100 text-amber-800',
    3: 'bg-blue-100 text-blue-800',
  };
  const cls = colorMap[priorite] ?? 'bg-gray-100 text-gray-600';
  return <Badge className={cn('text-xs', cls)}>P{priorite}</Badge>;
}

// ---------------------------------------------------------------------------
// Section components
// ---------------------------------------------------------------------------

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3
      className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
      style={{ color: 'var(--pp-text-secondary)' }}
    >
      {children}
    </h3>
  );
}

function DatesSection({
  node,
  margin,
}: {
  node: GraphNode;
  margin: MarginResult | null;
}) {
  return (
    <div>
      <SectionTitle>
        <CalendarIcon className="h-3.5 w-3.5" />
        Dates
      </SectionTitle>
      <div className="grid grid-cols-2 gap-2 text-sm">
        <div>
          <span className="text-xs" style={{ color: 'var(--pp-text-secondary)' }}>
            Debut prevu
          </span>
          <div style={{ color: 'var(--pp-navy)' }}>
            <DateDisplay date={node.dateDebut} />
          </div>
        </div>
        <div>
          <span className="text-xs" style={{ color: 'var(--pp-text-secondary)' }}>
            Fin prevue
          </span>
          <div style={{ color: 'var(--pp-navy)' }}>
            <DateDisplay date={node.dateFin} />
          </div>
        </div>
        {margin && (
          <>
            <div>
              <span className="text-xs" style={{ color: 'var(--pp-text-secondary)' }}>
                Marge totale
              </span>
              <div className={cn('tabular-nums', marginColorClass(margin.floatTotal))}>
                {margin.floatTotal} jour{Math.abs(margin.floatTotal) !== 1 ? 's' : ''}
              </div>
            </div>
            <div>
              <span className="text-xs" style={{ color: 'var(--pp-text-secondary)' }}>
                Marge libre
              </span>
              <div className={cn('tabular-nums', marginColorClass(margin.floatLibre))}>
                {margin.floatLibre} jour{Math.abs(margin.floatLibre) !== 1 ? 's' : ''}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function DependencyList({
  title,
  icon,
  nodeIds,
  allNodes,
  onNavigate,
}: {
  title: string;
  icon: React.ReactNode;
  nodeIds: string[];
  allNodes: GraphNode[];
  onNavigate: (nodeId: string) => void;
}) {
  if (nodeIds.length === 0) {
    return (
      <div>
        <SectionTitle>
          {icon}
          {title}
        </SectionTitle>
        <p className="text-sm" style={{ color: 'var(--pp-text-secondary)' }}>
          Aucune dependance
        </p>
      </div>
    );
  }

  const nodeMap = new Map(allNodes.map((n) => [n.id, n]));

  return (
    <div>
      <SectionTitle>
        {icon}
        {title}
      </SectionTitle>
      <ul className="flex flex-col gap-1.5">
        {nodeIds.map((nid) => {
          const depNode = nodeMap.get(nid);
          return (
            <li key={nid}>
              <button
                type="button"
                onClick={() => onNavigate(nid)}
                className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--pp-bg)]"
                style={{
                  borderColor: 'var(--pp-border)',
                  color: 'var(--pp-navy)',
                }}
              >
                {depNode?.type === 'achat' ? (
                  <TruckIcon className="h-3.5 w-3.5 shrink-0" style={{ color: '#8B5CF6' }} />
                ) : (
                  <PackageIcon className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--pp-blue)' }} />
                )}
                <span className="flex-1 truncate font-mono text-xs">
                  {depNode?.label ?? nid.slice(0, 8)}
                </span>
                {depNode && <OfStatusBadge statut={depNode.statut} />}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function SousOfSection({
  sousOfs,
  onNavigate,
}: {
  sousOfs: Array<{ id: string; label?: string; statut?: string }>;
  onNavigate: (id: string) => void;
}) {
  if (!sousOfs || sousOfs.length === 0) return null;

  return (
    <div>
      <SectionTitle>
        <LayersIcon className="h-3.5 w-3.5" />
        Sous-OF
      </SectionTitle>
      <ul className="flex flex-col gap-1.5">
        {sousOfs.map((sof) => (
          <li key={sof.id}>
            <button
              type="button"
              onClick={() => onNavigate(sof.id)}
              className="flex w-full items-center gap-2 rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-[var(--pp-bg)]"
              style={{
                borderColor: 'var(--pp-border)',
                color: 'var(--pp-navy)',
              }}
            >
              <PackageIcon className="h-3.5 w-3.5 shrink-0" style={{ color: 'var(--pp-blue)' }} />
              <span className="flex-1 truncate font-mono text-xs">
                {sof.label ?? sof.id.slice(0, 8)}
              </span>
              {sof.statut && <OfStatusBadge statut={sof.statut} />}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------------------------------------------------------------------
// OF detail content
// ---------------------------------------------------------------------------

function OfDetailContent({
  node,
  margin,
  predecessors,
  successors,
  allNodes,
  onNavigate,
}: {
  node: GraphNode;
  margin: MarginResult | null;
  predecessors: string[];
  successors: string[];
  allNodes: GraphNode[];
  onNavigate: (id: string) => void;
}) {
  const { data: ofDetail, isLoading } = useOfQuery(node.id);

  return (
    <div className="flex flex-col gap-5">
      {/* Dates */}
      <DatesSection node={node} margin={margin} />

      <Separator />

      {/* Dependances amont */}
      <DependencyList
        title="Dependances amont"
        icon={<ArrowLeftIcon className="h-3.5 w-3.5" />}
        nodeIds={predecessors}
        allNodes={allNodes}
        onNavigate={onNavigate}
      />

      <Separator />

      {/* Dependances aval */}
      <DependencyList
        title="Dependances aval"
        icon={<ArrowRightIcon className="h-3.5 w-3.5" />}
        nodeIds={successors}
        allNodes={allNodes}
        onNavigate={onNavigate}
      />

      {/* Sous-OF */}
      {isLoading ? (
        <div className="flex justify-center py-4">
          <Spinner />
        </div>
      ) : (
        ofDetail?.sousOfs &&
        ofDetail.sousOfs.length > 0 && (
          <>
            <Separator />
            <SousOfSection sousOfs={ofDetail.sousOfs} onNavigate={onNavigate} />
          </>
        )
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Achat detail content
// ---------------------------------------------------------------------------

function AchatDetailContent({
  node,
  margin,
  predecessors,
  successors,
  allNodes,
  onNavigate,
}: {
  node: GraphNode;
  margin: MarginResult | null;
  predecessors: string[];
  successors: string[];
  allNodes: GraphNode[];
  onNavigate: (id: string) => void;
}) {
  return (
    <div className="flex flex-col gap-5">
      {/* Dates */}
      <DatesSection node={node} margin={margin} />

      <Separator />

      {/* Dependances amont */}
      <DependencyList
        title="Dependances amont"
        icon={<ArrowLeftIcon className="h-3.5 w-3.5" />}
        nodeIds={predecessors}
        allNodes={allNodes}
        onNavigate={onNavigate}
      />

      <Separator />

      {/* Dependances aval (OF lie) */}
      <DependencyList
        title={successors.length > 0 ? 'OF lie' : 'Dependances aval'}
        icon={<LinkIcon className="h-3.5 w-3.5" />}
        nodeIds={successors}
        allNodes={allNodes}
        onNavigate={onNavigate}
      />
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main drawer component
// ---------------------------------------------------------------------------

export function OfDetailDrawer() {
  const detailDrawerOpen = useUiStore((s) => s.detailDrawerOpen);
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const toggleDrawer = useUiStore((s) => s.toggleDrawer);
  const selectNode = useUiStore((s) => s.selectNode);

  const nodes = useGraphStore((s) => s.nodes);
  const edges = useGraphStore((s) => s.edges);
  const margins = useGraphStore((s) => s.margins);

  // Find the selected node
  const node = useMemo(
    () => nodes.find((n) => n.id === selectedNodeId) ?? null,
    [nodes, selectedNodeId],
  );

  // Find margin for the node
  const margin = useMemo(
    () => margins.find((m) => m.nodeId === selectedNodeId) ?? null,
    [margins, selectedNodeId],
  );

  // Predecessors: edges where this node is the target
  const predecessors = useMemo(
    () =>
      edges
        .filter((e: GraphEdge) => e.targetId === selectedNodeId)
        .map((e: GraphEdge) => e.sourceId),
    [edges, selectedNodeId],
  );

  // Successors: edges where this node is the source
  const successors = useMemo(
    () =>
      edges
        .filter((e: GraphEdge) => e.sourceId === selectedNodeId)
        .map((e: GraphEdge) => e.targetId),
    [edges, selectedNodeId],
  );

  const handleClose = useCallback(() => {
    toggleDrawer(false);
    selectNode(null);
  }, [toggleDrawer, selectNode]);

  const handleNavigate = useCallback(
    (nodeId: string) => {
      selectNode(nodeId);
    },
    [selectNode],
  );

  const isOpen = detailDrawerOpen && !!node;

  return (
    <Sheet
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) handleClose();
      }}
    >
      <SheetContent side="right" showCloseButton={false} className="w-[400px] sm:w-[440px]">
        {node && (
          <>
            {/* Header */}
            <SheetHeader className="pb-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col gap-2">
                  <SheetTitle
                    className="flex items-center gap-2 text-lg"
                    style={{ color: 'var(--pp-navy)' }}
                  >
                    {node.type === 'achat' ? (
                      <TruckIcon className="h-5 w-5 shrink-0" style={{ color: '#8B5CF6' }} />
                    ) : (
                      <PackageIcon className="h-5 w-5 shrink-0" style={{ color: 'var(--pp-blue)' }} />
                    )}
                    <span className="truncate font-bold">{node.label}</span>
                  </SheetTitle>
                  <div className="flex items-center gap-1.5 text-sm" style={{ color: 'var(--pp-text-secondary)' }}>
                    <span className="font-mono text-xs">{node.id.slice(0, 12)}</span>
                    {node.articleId && (
                      <>
                        <span>-</span>
                        <span>{node.articleId}</span>
                      </>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <OfStatusBadge statut={node.statut} />
                    {node.type === 'of' && prioriteBadge(node.priorite)}
                    {node.type === 'achat' && (
                      <Badge className="bg-purple-100 text-xs text-purple-800">
                        Achat
                      </Badge>
                    )}
                    {margin?.estCritique && (
                      <Badge className="bg-red-100 text-xs text-red-800">
                        Critique
                      </Badge>
                    )}
                  </div>
                </div>
                <Button
                  variant="ghost"
                  className="h-8 w-8 shrink-0 p-0"
                  onClick={handleClose}
                >
                  <XIcon className="h-4 w-4" />
                </Button>
              </div>
            </SheetHeader>

            {/* Body */}
            <div className="flex-1 overflow-y-auto px-1 pb-4">
              {node.type === 'of' ? (
                <OfDetailContent
                  node={node}
                  margin={margin}
                  predecessors={predecessors}
                  successors={successors}
                  allNodes={nodes}
                  onNavigate={handleNavigate}
                />
              ) : (
                <AchatDetailContent
                  node={node}
                  margin={margin}
                  predecessors={predecessors}
                  successors={successors}
                  allNodes={nodes}
                  onNavigate={handleNavigate}
                />
              )}
            </div>

            {/* Footer */}
            <SheetFooter className="border-t pt-4" style={{ borderColor: 'var(--pp-border)' }}>
              <div className="flex w-full items-center justify-end gap-2">
                <Button
                  variant="outline"
                  onClick={handleClose}
                >
                  <XIcon className="mr-1.5 h-3.5 w-3.5" />
                  Fermer
                </Button>
                <Button
                  onClick={() => {
                    // The node is already selected; close the drawer so the graph view
                    // can centre on it.
                    toggleDrawer(false);
                  }}
                >
                  <FocusIcon className="mr-1.5 h-3.5 w-3.5" />
                  Voir dans le graphe
                </Button>
              </div>
            </SheetFooter>
          </>
        )}
      </SheetContent>
    </Sheet>
  );
}
