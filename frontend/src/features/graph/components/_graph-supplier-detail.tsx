import { useState } from 'react';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  Badge,
  Button,
  Separator,
  cn,
} from '@fli-dgtf/flow-ui';
import {
  TruckIcon,
  XIcon,
  PackageIcon,
  ClockIcon,
  AlertTriangleIcon,
} from 'lucide-react';
import {
  type SupplierRisk,
  useBulkMovePreviewMutation,
} from '@/providers/api/achat';
import { useGraphStore, type GraphNode } from '@/providers/state/graph-store';

function riskBadge(score: number) {
  if (score >= 60) {
    return (
      <Badge className="bg-red-100 text-xs text-red-800">
        Risque {score}
      </Badge>
    );
  }
  if (score >= 20) {
    return (
      <Badge className="bg-amber-100 text-xs text-amber-800">
        Risque {score}
      </Badge>
    );
  }
  return (
    <Badge className="bg-green-100 text-xs text-green-800">
      Risque {score}
    </Badge>
  );
}

function marginBadge(node: GraphNode, margins: { nodeId: string; floatTotal: number }[]) {
  const m = margins.find((mg) => mg.nodeId === node.id);
  if (!m) return null;
  const cls =
    m.floatTotal <= 0
      ? 'bg-red-100 text-red-800'
      : m.floatTotal <= 5
        ? 'bg-amber-100 text-amber-800'
        : 'bg-green-100 text-green-800';
  return (
    <Badge className={cn('text-xs', cls)}>
      {m.floatTotal}j
    </Badge>
  );
}

const WHATIF_DELTAS = [7, 14, 21] as const;

interface WhatIfResult {
  delta: number;
  ofsDecales: number;
  commandesImpactees: number;
}

export function SupplierDetailPanel({
  supplier,
  onClose,
}: {
  supplier: SupplierRisk;
  onClose: () => void;
}) {
  const nodes = useGraphStore((s) => s.nodes);
  const margins = useGraphStore((s) => s.margins);
  const edges = useGraphStore((s) => s.edges);
  const bulkMove = useBulkMovePreviewMutation();
  const [whatIfResults, setWhatIfResults] = useState<WhatIfResult[]>([]);
  const [loadingDelta, setLoadingDelta] = useState<number | null>(null);

  // Find achat nodes for this supplier
  const achatNodes = nodes.filter(
    (n) => n.type === 'achat' && n.fournisseur === supplier.name,
  );

  // Find dependent OF nodes
  const depOfSet = new Set(supplier.dependentOfIds);
  const depOfNodes = nodes.filter((n) => depOfSet.has(n.id));

  const handleWhatIf = async (delta: number) => {
    if (supplier.dependentOfIds.length === 0) return;
    setLoadingDelta(delta);
    try {
      const result = await bulkMove.mutateAsync({
        ofIds: supplier.dependentOfIds,
        deltaJours: delta,
      });
      setWhatIfResults((prev) => {
        const next = prev.filter((r) => r.delta !== delta);
        next.push({
          delta,
          ofsDecales: result.ofsDecales ?? result.affectedOfs?.length ?? 0,
          commandesImpactees:
            result.commandesImpactees ?? result.affectedCommands ?? 0,
        });
        return next;
      });
    } catch {
      // silently ignore - mutation error is available via bulkMove.error
    } finally {
      setLoadingDelta(null);
    }
  };

  return (
    <Sheet open onOpenChange={(open) => !open && onClose()}>
      <SheetContent
        side="right"
        showCloseButton={false}
        className="w-[420px] sm:w-[480px]"
      >
        {/* Header */}
        <SheetHeader className="pb-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-col gap-2">
              <SheetTitle
                className="flex items-center gap-2 text-lg"
                style={{ color: 'var(--pp-navy)' }}
              >
                <TruckIcon
                  className="h-5 w-5 shrink-0"
                  style={{ color: '#8B5CF6' }}
                />
                <span className="truncate font-bold">{supplier.name}</span>
              </SheetTitle>
              <div className="flex items-center gap-2">
                {riskBadge(supplier.riskScore)}
                <Badge className="bg-blue-100 text-xs text-blue-800">
                  {supplier.totalAchats} achat
                  {supplier.totalAchats !== 1 ? 's' : ''}
                </Badge>
              </div>
            </div>
            <Button
              variant="ghost"
              className="h-8 w-8 shrink-0 p-0"
              onClick={onClose}
            >
              <XIcon className="h-4 w-4" />
            </Button>
          </div>
        </SheetHeader>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-1 pb-4">
          {/* Achats */}
          <div className="mb-4">
            <h3
              className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--pp-text-secondary)' }}
            >
              <PackageIcon className="h-3.5 w-3.5" />
              Achats ({achatNodes.length})
            </h3>
            {achatNodes.length === 0 ? (
              <p
                className="text-sm"
                style={{ color: 'var(--pp-text-secondary)' }}
              >
                Aucun achat en cours
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {achatNodes.map((achat) => (
                  <li
                    key={achat.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--pp-border)' }}
                  >
                    <span
                      className="flex-1 truncate font-mono text-xs"
                      style={{ color: 'var(--pp-navy)' }}
                    >
                      {achat.label}
                    </span>
                    <Badge
                      className={cn(
                        'text-xs',
                        achat.statut === 'EN_RETARD'
                          ? 'bg-red-100 text-red-800'
                          : achat.statut === 'RECU'
                            ? 'bg-green-100 text-green-800'
                            : 'bg-blue-100 text-blue-800',
                      )}
                    >
                      {achat.statut}
                    </Badge>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Separator className="my-4" />

          {/* Dependent OFs */}
          <div className="mb-4">
            <h3
              className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--pp-text-secondary)' }}
            >
              <ClockIcon className="h-3.5 w-3.5" />
              OF dependants ({depOfNodes.length})
            </h3>
            {depOfNodes.length === 0 ? (
              <p
                className="text-sm"
                style={{ color: 'var(--pp-text-secondary)' }}
              >
                Aucun OF dependant
              </p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {depOfNodes.map((of) => (
                  <li
                    key={of.id}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 text-sm"
                    style={{ borderColor: 'var(--pp-border)' }}
                  >
                    <span
                      className="flex-1 truncate font-mono text-xs"
                      style={{ color: 'var(--pp-navy)' }}
                    >
                      {of.label}
                    </span>
                    {marginBadge(of, margins)}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <Separator className="my-4" />

          {/* What-If */}
          <div>
            <h3
              className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide"
              style={{ color: 'var(--pp-text-secondary)' }}
            >
              <AlertTriangleIcon className="h-3.5 w-3.5" />
              Simulation retard fournisseur
            </h3>
            <div className="flex gap-2">
              {WHATIF_DELTAS.map((delta) => (
                <Button
                  key={delta}
                  variant="outline"
                  size="sm"
                  disabled={
                    loadingDelta !== null ||
                    supplier.dependentOfIds.length === 0
                  }
                  onClick={() => handleWhatIf(delta)}
                >
                  {loadingDelta === delta ? '...' : `+${delta}j`}
                </Button>
              ))}
            </div>
            {whatIfResults.length > 0 && (
              <div className="mt-3 flex flex-col gap-2">
                {whatIfResults
                  .sort((a, b) => a.delta - b.delta)
                  .map((r) => (
                    <div
                      key={r.delta}
                      className="rounded-md border px-3 py-2 text-sm"
                      style={{
                        borderColor: 'var(--pp-border)',
                        backgroundColor: 'var(--pp-bg)',
                      }}
                    >
                      <span style={{ color: 'var(--pp-navy)' }}>
                        Si retard{' '}
                        <strong>+{r.delta}j</strong> :{' '}
                        {r.ofsDecales} OF decale
                        {r.ofsDecales !== 1 ? 's' : ''},{' '}
                        {r.commandesImpactees} commande
                        {r.commandesImpactees !== 1 ? 's' : ''} impactee
                        {r.commandesImpactees !== 1 ? 's' : ''}
                      </span>
                    </div>
                  ))}
              </div>
            )}
            {bulkMove.error && (
              <p className="mt-2 text-xs text-[var(--pp-red)]">
                Erreur lors de la simulation. L&apos;endpoint n&apos;est
                peut-etre pas encore disponible.
              </p>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
