import { useCallback, useState } from 'react';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
} from '@fli-dgtf/flow-ui';
import {
  ArrowRightIcon,
  ArrowLeftIcon,
  BanIcon,
  CheckIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { useUiStore } from '@/providers/state/ui-store';
import { useBulkMoveMutation, useBulkBlockMutation } from '@/providers/api/of';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type BulkAction =
  | { type: 'move'; deltaJours: number }
  | { type: 'block' };

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GanttBulkActions() {
  const ganttSelection = useUiStore((s) => s.ganttSelection);
  const setGanttSelection = useUiStore((s) => s.setGanttSelection);

  const bulkMove = useBulkMoveMutation();
  const bulkBlock = useBulkBlockMutation();

  const [pendingAction, setPendingAction] = useState<BulkAction | null>(null);

  const handleConfirm = useCallback(async () => {
    if (!pendingAction) return;

    try {
      if (pendingAction.type === 'move') {
        const result = await bulkMove.mutateAsync({
          ofIds: ganttSelection,
          deltaJours: pendingAction.deltaJours,
        });
        toast.success(
          `${result.movedCount} OF${result.movedCount > 1 ? 's' : ''} deplace${result.movedCount > 1 ? 's' : ''} (${result.impactedCount} impacts)`,
        );
      } else {
        const result = await bulkBlock.mutateAsync({ ofIds: ganttSelection });
        toast.success(
          `${result.blockedCount} OF${result.blockedCount > 1 ? 's' : ''} bloque${result.blockedCount > 1 ? 's' : ''}`,
        );
      }
      setGanttSelection([]);
    } catch {
      toast.error("Erreur lors de l'action groupee");
    } finally {
      setPendingAction(null);
    }
  }, [pendingAction, ganttSelection, bulkMove, bulkBlock, setGanttSelection]);

  const handleCancel = useCallback(() => {
    setPendingAction(null);
  }, []);

  if (ganttSelection.length === 0) return null;

  const MOVE_OPTIONS = [
    { label: '-14j', delta: -14, icon: ArrowLeftIcon },
    { label: '-7j', delta: -7, icon: ArrowLeftIcon },
    { label: '+7j', delta: 7, icon: ArrowRightIcon },
    { label: '+14j', delta: 14, icon: ArrowRightIcon },
  ];

  return (
    <>
      {/* Sticky bottom panel */}
      <div
        className="flex items-center justify-between gap-4 border-t px-6 py-3"
        style={{
          backgroundColor: 'var(--pp-surface)',
          borderColor: 'var(--pp-border)',
        }}
      >
        <span
          className="text-sm font-medium"
          style={{ color: 'var(--pp-navy)' }}
        >
          {ganttSelection.length} element{ganttSelection.length > 1 ? 's' : ''}{' '}
          selectionne{ganttSelection.length > 1 ? 's' : ''}
        </span>

        <div className="flex items-center gap-2">
          {MOVE_OPTIONS.map((opt) => {
            const Icon = opt.icon;
            return (
              <Button
                key={opt.label}
                size="sm"
                variant="outline"
                onClick={() =>
                  setPendingAction({ type: 'move', deltaJours: opt.delta })
                }
              >
                <Icon className="mr-1 h-3.5 w-3.5" />
                {opt.label}
              </Button>
            );
          })}

          <div
            className="mx-1 h-6 w-px"
            style={{ backgroundColor: 'var(--pp-border)' }}
          />

          <Button
            size="sm"
            variant="outline"
            onClick={() => setPendingAction({ type: 'block' })}
            style={{ borderColor: 'var(--pp-red)', color: 'var(--pp-red)' }}
          >
            <BanIcon className="mr-1 h-3.5 w-3.5" />
            Bloquer
          </Button>

          <div
            className="mx-1 h-6 w-px"
            style={{ backgroundColor: 'var(--pp-border)' }}
          />

          <Button
            size="sm"
            variant="outline"
            onClick={() => setGanttSelection([])}
          >
            <XIcon className="mr-1 h-3.5 w-3.5" />
            Deselectionner
          </Button>
        </div>
      </div>

      {/* Confirmation dialog */}
      {pendingAction && (
        <Dialog open={true} onOpenChange={(v) => !v && handleCancel()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Confirmer l&apos;action groupee</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <p style={{ color: 'var(--pp-navy)' }}>
                {pendingAction.type === 'move' ? (
                  <>
                    Deplacer{' '}
                    <span className="font-semibold">
                      {ganttSelection.length} OF
                      {ganttSelection.length > 1 ? 's' : ''}
                    </span>{' '}
                    de{' '}
                    <span className="font-semibold">
                      {Math.abs(pendingAction.deltaJours)} jour
                      {Math.abs(pendingAction.deltaJours) > 1 ? 's' : ''}
                    </span>{' '}
                    {pendingAction.deltaJours > 0
                      ? 'vers la droite'
                      : 'vers la gauche'}
                    .
                  </>
                ) : (
                  <>
                    Bloquer{' '}
                    <span className="font-semibold">
                      {ganttSelection.length} OF
                      {ganttSelection.length > 1 ? 's' : ''}
                    </span>{' '}
                    (statut ANNULE).
                  </>
                )}
              </p>
              <p
                className="mt-2 text-sm"
                style={{ color: 'var(--pp-text-secondary)' }}
              >
                Cette action est irreversible.
              </p>
            </DialogBody>
            <DialogFooter>
              <Button variant="outline" onClick={handleCancel}>
                <XIcon className="mr-1.5 h-3.5 w-3.5" />
                Annuler
              </Button>
              <Button
                onClick={handleConfirm}
                disabled={bulkMove.isPending || bulkBlock.isPending}
              >
                <CheckIcon className="mr-1.5 h-3.5 w-3.5" />
                Confirmer
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </>
  );
}
