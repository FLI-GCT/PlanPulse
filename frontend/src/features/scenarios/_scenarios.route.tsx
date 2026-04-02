import { useState, useCallback } from 'react';
import { createFileRoute, useNavigate } from '@tanstack/react-router';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogBody,
  DialogFooter,
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Separator,
  Spinner,
} from '@fli-dgtf/flow-ui';
import {
  GitBranchIcon,
  PlusIcon,
  FlaskConicalIcon,
  TruckIcon,
  XCircleIcon,
  GaugeIcon,
  MoveHorizontalIcon,
  CheckIcon,
  TrashIcon,
  XIcon,
} from 'lucide-react';
import { toast } from 'sonner';

import { ErrorBoundary } from '@/components/shared/error-boundary';
import { useKpiQuery } from '@/providers/api/kpi';
import {
  useScenariosQuery,
  useScenarioKpiQuery,
  useCreateScenarioMutation,
  useApplyActionMutation,
  useCommitScenarioMutation,
  useDeleteScenarioMutation,
} from '@/providers/api/scenario';
import { DeltaKpi } from './_scenarios-delta-kpi';
import { ActionsList } from './_scenarios-actions-list';

export const Route = createFileRoute('/_layout/scenarios')({
  component: ScenariosView,
});

// ---------------------------------------------------------------------------
// Action dialog types
// ---------------------------------------------------------------------------

type ActionDialogType =
  | 'shift_supplier'
  | 'cancel_command'
  | 'reduce_cadence'
  | 'shift_of'
  | null;

interface ScenarioAction {
  type: string;
  description: string;
  appliedAt: string;
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

function ScenariosView() {
  return (
    <ErrorBoundary>
      <ScenariosContent />
    </ErrorBoundary>
  );
}

function ScenariosContent() {
  const navigate = useNavigate();

  // --- Remote state ---
  const { data: kpi } = useKpiQuery();
  const { data: scenarios, isLoading: scenariosLoading } = useScenariosQuery();
  const createScenario = useCreateScenarioMutation();
  const applyAction = useApplyActionMutation();
  const commitScenario = useCommitScenarioMutation();
  const deleteScenario = useDeleteScenarioMutation();

  // --- Local state ---
  const [activeId, setActiveId] = useState<string | null>(null);
  const [actions, setActions] = useState<ScenarioAction[]>([]);
  const [openDialog, setOpenDialog] = useState<ActionDialogType>(null);

  const { data: scenarioKpi } = useScenarioKpiQuery(activeId);

  // --- Handlers ---
  const handleCreate = useCallback(async () => {
    try {
      const result = await createScenario.mutateAsync();
      setActiveId(result.id);
      setActions([]);
      toast.success(`Scenario "${result.nom}" cree`);
    } catch {
      toast.error('Erreur lors de la creation du scenario');
    }
  }, [createScenario]);

  const handleSelectScenario = useCallback(
    (id: string) => {
      setActiveId(id);
      setActions([]);
    },
    [],
  );

  const handleApplyAction = useCallback(
    async (action: Record<string, unknown>) => {
      if (!activeId) return;
      try {
        await applyAction.mutateAsync({ id: activeId, action });
        setActions((prev) => [
          ...prev,
          {
            type: action.type as string,
            description: actionDescription(action),
            appliedAt: new Date().toISOString(),
          },
        ]);
        setOpenDialog(null);
        toast.success('Action appliquee');
      } catch {
        toast.error("Erreur lors de l'application de l'action");
      }
    },
    [activeId, applyAction],
  );

  const handleCommit = useCallback(async () => {
    if (!activeId) return;
    try {
      await commitScenario.mutateAsync(activeId);
      toast.success('Scenario valide et applique au plan reel');
      setActiveId(null);
      setActions([]);
      navigate({ to: '/pulse' });
    } catch {
      toast.error('Erreur lors de la validation du scenario');
    }
  }, [activeId, commitScenario, navigate]);

  const handleDiscard = useCallback(async () => {
    if (!activeId) return;
    try {
      await deleteScenario.mutateAsync(activeId);
      toast.info('Scenario abandonne');
      setActiveId(null);
      setActions([]);
    } catch {
      toast.error('Erreur lors de la suppression du scenario');
    }
  }, [activeId, deleteScenario]);

  // --- Render ---
  return (
    <div className="flex flex-col gap-6 p-6">
      {/* ---- Header / Toolbar ---- */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitBranchIcon
            className="h-6 w-6"
            style={{ color: 'var(--pp-navy)' }}
          />
          <h1
            className="text-2xl font-bold"
            style={{ color: 'var(--pp-navy)' }}
          >
            Scenarios What-If
          </h1>
        </div>

        <div className="flex items-center gap-3">
          {/* Scenario selector */}
          {!scenariosLoading &&
            scenarios &&
            (scenarios as Array<{ id: string; nom: string }>).length > 0 && (
              <Select
                value={activeId ?? ''}
                onValueChange={(v: string) => handleSelectScenario(v)}
              >
                <SelectTrigger className="w-[220px]">
                  <SelectValue placeholder="Selectionner un scenario" />
                </SelectTrigger>
                <SelectContent>
                  {(scenarios as Array<{ id: string; nom: string }>).map(
                    (s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.nom}
                      </SelectItem>
                    ),
                  )}
                </SelectContent>
              </Select>
            )}

          <Button
            onClick={handleCreate}
            disabled={createScenario.isPending}
          >
            {createScenario.isPending ? (
              <Spinner className="mr-1.5 h-4 w-4" />
            ) : (
              <PlusIcon className="mr-1.5 h-4 w-4" />
            )}
            Nouveau scenario
          </Button>
        </div>
      </div>

      {/* ---- Empty state ---- */}
      {!activeId && (
        <Card>
          <CardHeader className="pb-0">
            <CardTitle
              className="text-base"
              style={{ color: 'var(--pp-navy)' }}
            >
              Vos scenarios
            </CardTitle>
          </CardHeader>
          <CardContent className="py-12">
            <Empty className="mx-auto max-w-md">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <FlaskConicalIcon
                    className="h-10 w-10"
                    style={{ color: 'var(--pp-blue)' }}
                  />
                </EmptyMedia>
                <EmptyTitle>Aucun scenario actif</EmptyTitle>
              </EmptyHeader>
              <EmptyContent>
                <EmptyDescription>
                  Les scenarios what-if vous permettent de simuler des
                  modifications du plan de production sans affecter le plan
                  reel. Creez un scenario pour tester l&apos;impact d&apos;un
                  retard fournisseur, d&apos;une annulation de commande ou
                  d&apos;un changement de cadence.
                </EmptyDescription>
              </EmptyContent>
            </Empty>
            <div className="mt-6 flex justify-center">
              <Button
                onClick={handleCreate}
                disabled={createScenario.isPending}
              >
                {createScenario.isPending ? (
                  <Spinner className="mr-1.5 h-4 w-4" />
                ) : (
                  <PlusIcon className="mr-1.5 h-4 w-4" />
                )}
                Creer un scenario
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ---- Active scenario ---- */}
      {activeId && (
        <>
          {/* KPI comparison */}
          {kpi && (
            <DeltaKpi currentKpi={kpi} scenarioKpi={scenarioKpi ?? null} />
          )}

          {/* Action panel */}
          <Card>
            <CardHeader>
              <CardTitle
                className="text-base"
                style={{ color: 'var(--pp-navy)' }}
              >
                Actions de simulation
              </CardTitle>
            </CardHeader>
            <CardContent className="flex flex-col gap-4">
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => setOpenDialog('shift_supplier')}
                  disabled={applyAction.isPending}
                >
                  <TruckIcon className="mr-2 h-4 w-4" />
                  Retard fournisseur
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => setOpenDialog('cancel_command')}
                  disabled={applyAction.isPending}
                >
                  <XCircleIcon className="mr-2 h-4 w-4" />
                  Annuler une commande
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => setOpenDialog('reduce_cadence')}
                  disabled={applyAction.isPending}
                >
                  <GaugeIcon className="mr-2 h-4 w-4" />
                  Reduire cadence
                </Button>
                <Button
                  variant="outline"
                  className="justify-start"
                  onClick={() => setOpenDialog('shift_of')}
                  disabled={applyAction.isPending}
                >
                  <MoveHorizontalIcon className="mr-2 h-4 w-4" />
                  Decaler un OF
                </Button>
              </div>

              <Separator />

              {/* Actions list */}
              <ActionsList
                actions={actions}
                onUndo={() =>
                  toast.info('Fonctionnalite bientot disponible')
                }
              />
            </CardContent>
          </Card>

          {/* Footer actions */}
          <div className="flex items-center justify-end gap-3">
            <Button
              variant="outline"
              onClick={handleDiscard}
              disabled={deleteScenario.isPending}
            >
              {deleteScenario.isPending ? (
                <Spinner className="mr-1.5 h-4 w-4" />
              ) : (
                <TrashIcon className="mr-1.5 h-4 w-4" />
              )}
              Abandonner
            </Button>
            <Button
              onClick={handleCommit}
              disabled={commitScenario.isPending}
              style={{
                backgroundColor: 'var(--pp-green)',
                color: 'white',
              }}
            >
              {commitScenario.isPending ? (
                <Spinner className="mr-1.5 h-4 w-4" />
              ) : (
                <CheckIcon className="mr-1.5 h-4 w-4" />
              )}
              Valider ce scenario
            </Button>
          </div>
        </>
      )}

      {/* ---- Action dialogs ---- */}
      {openDialog === 'shift_supplier' && (
        <ShiftSupplierDialog
          onClose={() => setOpenDialog(null)}
          onApply={handleApplyAction}
          isPending={applyAction.isPending}
        />
      )}
      {openDialog === 'cancel_command' && (
        <CancelCommandDialog
          onClose={() => setOpenDialog(null)}
          onApply={handleApplyAction}
          isPending={applyAction.isPending}
        />
      )}
      {openDialog === 'reduce_cadence' && (
        <ReduceCadenceDialog
          onClose={() => setOpenDialog(null)}
          onApply={handleApplyAction}
          isPending={applyAction.isPending}
        />
      )}
      {openDialog === 'shift_of' && (
        <ShiftOfDialog
          onClose={() => setOpenDialog(null)}
          onApply={handleApplyAction}
          isPending={applyAction.isPending}
        />
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Action description helper
// ---------------------------------------------------------------------------

function actionDescription(action: Record<string, unknown>): string {
  switch (action.type) {
    case 'shift_supplier':
      return `Retard fournisseur "${action.fournisseur}" de ${action.deltaJours} jour(s)`;
    case 'cancel_command':
      return `Annulation de la commande OF ${action.ofId}`;
    case 'reduce_cadence':
      return `Reduction cadence article "${action.article}" de ${action.pourcentage} %`;
    case 'shift_of':
      return `Decalage OF ${action.ofId} de ${action.deltaJours} jour(s)`;
    default:
      return `Action ${action.type as string}`;
  }
}

// ---------------------------------------------------------------------------
// Action dialogs
// ---------------------------------------------------------------------------

interface DialogProps {
  onClose: () => void;
  onApply: (action: Record<string, unknown>) => void;
  isPending: boolean;
}

function ShiftSupplierDialog({ onClose, onApply, isPending }: DialogProps) {
  const [fournisseur, setFournisseur] = useState('');
  const [deltaJours, setDeltaJours] = useState('7');

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Retard fournisseur</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span
                className="text-sm font-medium"
                style={{ color: 'var(--pp-navy)' }}
              >
                Nom du fournisseur
              </span>
              <input
                className="rounded-md border px-3 py-2 text-sm"
                style={{
                  borderColor: 'var(--pp-border)',
                  backgroundColor: 'var(--pp-surface)',
                  color: 'var(--pp-navy)',
                }}
                placeholder="Ex: Acier Martin"
                value={fournisseur}
                onChange={(e) => setFournisseur(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span
                className="text-sm font-medium"
                style={{ color: 'var(--pp-navy)' }}
              >
                Retard (jours)
              </span>
              <input
                type="number"
                className="rounded-md border px-3 py-2 text-sm"
                style={{
                  borderColor: 'var(--pp-border)',
                  backgroundColor: 'var(--pp-surface)',
                  color: 'var(--pp-navy)',
                }}
                value={deltaJours}
                onChange={(e) => setDeltaJours(e.target.value)}
                min={1}
              />
            </label>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <XIcon className="mr-1.5 h-3.5 w-3.5" />
            Annuler
          </Button>
          <Button
            disabled={!fournisseur.trim() || isPending}
            onClick={() =>
              onApply({
                type: 'shift_supplier',
                fournisseur: fournisseur.trim(),
                deltaJours: Number(deltaJours),
              })
            }
          >
            {isPending && <Spinner className="mr-1.5 h-3.5 w-3.5" />}
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CancelCommandDialog({ onClose, onApply, isPending }: DialogProps) {
  const [ofId, setOfId] = useState('');

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Annuler une commande</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <label className="flex flex-col gap-1">
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--pp-navy)' }}
            >
              Identifiant OF
            </span>
            <input
              className="rounded-md border px-3 py-2 text-sm"
              style={{
                borderColor: 'var(--pp-border)',
                backgroundColor: 'var(--pp-surface)',
                color: 'var(--pp-navy)',
              }}
              placeholder="Ex: OF-001"
              value={ofId}
              onChange={(e) => setOfId(e.target.value)}
            />
          </label>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <XIcon className="mr-1.5 h-3.5 w-3.5" />
            Annuler
          </Button>
          <Button
            disabled={!ofId.trim() || isPending}
            onClick={() =>
              onApply({ type: 'cancel_command', ofId: ofId.trim() })
            }
          >
            {isPending && <Spinner className="mr-1.5 h-3.5 w-3.5" />}
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReduceCadenceDialog({ onClose, onApply, isPending }: DialogProps) {
  const [article, setArticle] = useState('');
  const [pourcentage, setPourcentage] = useState('20');

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Reduire la cadence</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span
                className="text-sm font-medium"
                style={{ color: 'var(--pp-navy)' }}
              >
                Article
              </span>
              <input
                className="rounded-md border px-3 py-2 text-sm"
                style={{
                  borderColor: 'var(--pp-border)',
                  backgroundColor: 'var(--pp-surface)',
                  color: 'var(--pp-navy)',
                }}
                placeholder="Ex: Tole-3mm"
                value={article}
                onChange={(e) => setArticle(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span
                className="text-sm font-medium"
                style={{ color: 'var(--pp-navy)' }}
              >
                Reduction (%)
              </span>
              <input
                type="number"
                className="rounded-md border px-3 py-2 text-sm"
                style={{
                  borderColor: 'var(--pp-border)',
                  backgroundColor: 'var(--pp-surface)',
                  color: 'var(--pp-navy)',
                }}
                value={pourcentage}
                onChange={(e) => setPourcentage(e.target.value)}
                min={1}
                max={100}
              />
            </label>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <XIcon className="mr-1.5 h-3.5 w-3.5" />
            Annuler
          </Button>
          <Button
            disabled={!article.trim() || isPending}
            onClick={() =>
              onApply({
                type: 'reduce_cadence',
                article: article.trim(),
                pourcentage: Number(pourcentage),
              })
            }
          >
            {isPending && <Spinner className="mr-1.5 h-3.5 w-3.5" />}
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ShiftOfDialog({ onClose, onApply, isPending }: DialogProps) {
  const [ofId, setOfId] = useState('');
  const [deltaJours, setDeltaJours] = useState('3');

  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decaler un OF</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <div className="flex flex-col gap-4">
            <label className="flex flex-col gap-1">
              <span
                className="text-sm font-medium"
                style={{ color: 'var(--pp-navy)' }}
              >
                Identifiant OF
              </span>
              <input
                className="rounded-md border px-3 py-2 text-sm"
                style={{
                  borderColor: 'var(--pp-border)',
                  backgroundColor: 'var(--pp-surface)',
                  color: 'var(--pp-navy)',
                }}
                placeholder="Ex: OF-001"
                value={ofId}
                onChange={(e) => setOfId(e.target.value)}
              />
            </label>
            <label className="flex flex-col gap-1">
              <span
                className="text-sm font-medium"
                style={{ color: 'var(--pp-navy)' }}
              >
                Decalage (jours, negatif = avancer)
              </span>
              <input
                type="number"
                className="rounded-md border px-3 py-2 text-sm"
                style={{
                  borderColor: 'var(--pp-border)',
                  backgroundColor: 'var(--pp-surface)',
                  color: 'var(--pp-navy)',
                }}
                value={deltaJours}
                onChange={(e) => setDeltaJours(e.target.value)}
              />
            </label>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            <XIcon className="mr-1.5 h-3.5 w-3.5" />
            Annuler
          </Button>
          <Button
            disabled={!ofId.trim() || isPending}
            onClick={() =>
              onApply({
                type: 'shift_of',
                ofId: ofId.trim(),
                deltaJours: Number(deltaJours),
              })
            }
          >
            {isPending && <Spinner className="mr-1.5 h-3.5 w-3.5" />}
            Appliquer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
