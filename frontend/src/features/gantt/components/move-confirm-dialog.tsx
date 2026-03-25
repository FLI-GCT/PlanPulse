import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@fli-dgtf/flow-ui';
import { CheckIcon, XIcon } from 'lucide-react';
import type { PropagationResult } from '@/providers/state/graph-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface MoveConfirmDialogProps {
  open: boolean;
  ofId: string;
  deltaJours: number;
  impactedNodes: PropagationResult[];
  onConfirm: () => void;
  onCancel: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function MoveConfirmDialog({
  open,
  ofId,
  deltaJours,
  impactedNodes,
  onConfirm,
  onCancel,
}: MoveConfirmDialogProps) {
  const direction = deltaJours > 0 ? 'vers la droite' : 'vers la gauche';
  const absDelta = Math.abs(deltaJours);

  // Count the other impacted OFs (excluding the one being dragged)
  const otherImpacted = impactedNodes.filter((n) => n.nodeId !== ofId);

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Confirmer le deplacement</DialogTitle>
        </DialogHeader>

        <DialogBody>
          <div className="flex flex-col gap-3">
            {/* Main info */}
            <p style={{ color: 'var(--pp-navy)' }}>
              Deplacement de{' '}
              <span className="font-semibold">{ofId}</span> de{' '}
              <span className="font-semibold">
                {absDelta} jour{absDelta > 1 ? 's' : ''}
              </span>{' '}
              {direction}.
            </p>

            {/* Impact count */}
            {otherImpacted.length > 0 && (
              <div
                className="rounded-lg border p-3"
                style={{
                  borderColor: 'var(--pp-amber)',
                  backgroundColor: 'rgba(186, 117, 23, 0.06)',
                }}
              >
                <p
                  className="text-sm font-medium"
                  style={{ color: 'var(--pp-amber)' }}
                >
                  {otherImpacted.length} OF{otherImpacted.length > 1 ? 's' : ''}{' '}
                  impacte{otherImpacted.length > 1 ? 's' : ''} par propagation
                </p>
                <ul
                  className="mt-2 max-h-40 space-y-1 overflow-y-auto text-xs"
                  style={{ color: 'var(--pp-navy)' }}
                >
                  {otherImpacted.slice(0, 15).map((n) => (
                    <li key={n.nodeId} className="flex items-center justify-between">
                      <span className="font-mono">{n.nodeId}</span>
                      <span style={{ color: 'var(--pp-text-secondary)' }}>
                        {n.deltaJours > 0 ? '+' : ''}
                        {n.deltaJours}j
                      </span>
                    </li>
                  ))}
                  {otherImpacted.length > 15 && (
                    <li style={{ color: 'var(--pp-text-secondary)' }}>
                      ...et {otherImpacted.length - 15} autres
                    </li>
                  )}
                </ul>
              </div>
            )}

            {otherImpacted.length === 0 && (
              <p className="text-sm" style={{ color: 'var(--pp-text-secondary)' }}>
                Aucun autre OF impacte.
              </p>
            )}
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            <XIcon className="mr-1.5 h-3.5 w-3.5" />
            Annuler
          </Button>
          <Button onClick={onConfirm}>
            <CheckIcon className="mr-1.5 h-3.5 w-3.5" />
            Confirmer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
