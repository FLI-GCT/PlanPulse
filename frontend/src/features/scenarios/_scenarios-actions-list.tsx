import { Button } from '@fli-dgtf/flow-ui';
import {
  TruckIcon,
  XCircleIcon,
  GaugeIcon,
  MoveHorizontalIcon,
  UndoIcon,
  ListIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { fr } from 'date-fns/locale';

interface ScenarioAction {
  type: string;
  description: string;
  appliedAt: string;
}

interface ActionsListProps {
  actions: ScenarioAction[];
  onUndo?: () => void;
}

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  shift_supplier: TruckIcon,
  cancel_command: XCircleIcon,
  reduce_cadence: GaugeIcon,
  shift_of: MoveHorizontalIcon,
};

export function ActionsList({ actions, onUndo }: ActionsListProps) {
  if (actions.length === 0) {
    return (
      <div
        className="flex flex-col items-center gap-2 py-8 text-center"
        style={{ color: 'var(--pp-text-secondary)' }}
      >
        <ListIcon className="h-8 w-8 opacity-50" />
        <p className="text-sm">
          Aucune action appliquee. Utilisez les boutons ci-dessous pour simuler.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {actions.map((action, idx) => {
        const Icon = ACTION_ICONS[action.type] ?? ListIcon;
        const formattedDate = format(
          new Date(action.appliedAt),
          'dd/MM/yyyy HH:mm',
          { locale: fr },
        );

        return (
          <div
            key={idx}
            className="flex items-center gap-3 rounded-lg border px-3 py-2"
            style={{
              borderColor: 'var(--pp-border)',
              backgroundColor: 'var(--pp-surface)',
            }}
          >
            <Icon
              className="h-4 w-4 shrink-0"
              style={{ color: 'var(--pp-navy)' }}
            />
            <div className="min-w-0 flex-1">
              <p
                className="text-sm font-medium"
                style={{ color: 'var(--pp-navy)' }}
              >
                {action.description}
              </p>
              <p
                className="text-xs"
                style={{ color: 'var(--pp-text-secondary)' }}
              >
                {formattedDate}
              </p>
            </div>
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (onUndo) {
                  onUndo();
                } else {
                  toast.info('Fonctionnalite bientot disponible');
                }
              }}
            >
              <UndoIcon className="mr-1 h-3.5 w-3.5" />
              Annuler
            </Button>
          </div>
        );
      })}
    </div>
  );
}
