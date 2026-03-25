import {
  AlarmClockIcon,
  NetworkIcon,
  ZapIcon,
  PackageIcon,
} from 'lucide-react';
import { Spinner } from '@fli-dgtf/flow-ui';
import { useUiStore } from '@/providers/state/ui-store';

interface QuestionOption {
  type: string;
  label: string;
  icon: React.ReactNode;
  needsTarget: boolean;
}

interface QuestionSelectorProps {
  onSelect: (type: string, targetId: string | null) => void;
  isLoading: boolean;
}

export function QuestionSelector({
  onSelect,
  isLoading,
}: QuestionSelectorProps) {
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);

  const questions: QuestionOption[] = [];

  if (selectedNodeId) {
    questions.push(
      {
        type: 'why-late',
        label: `Pourquoi ${selectedNodeId} est en retard ?`,
        icon: (
          <AlarmClockIcon
            className="h-5 w-5 shrink-0"
            style={{ color: 'var(--pp-red)' }}
          />
        ),
        needsTarget: true,
      },
      {
        type: 'what-depends',
        label: `Qu'est-ce qui depend de ${selectedNodeId} ?`,
        icon: (
          <NetworkIcon
            className="h-5 w-5 shrink-0"
            style={{ color: 'var(--pp-blue)' }}
          />
        ),
        needsTarget: true,
      },
    );
  }

  questions.push(
    {
      type: 'critical-week',
      label: "Qu'est-ce qui est critique cette semaine ?",
      icon: (
        <ZapIcon
          className="h-5 w-5 shrink-0"
          style={{ color: 'var(--pp-amber)' }}
        />
      ),
      needsTarget: false,
    },
    {
      type: 'endangered-purchases',
      label: 'Quels achats sont en danger ?',
      icon: (
        <PackageIcon
          className="h-5 w-5 shrink-0"
          style={{ color: '#8B5CF6' }}
        />
      ),
      needsTarget: false,
    },
  );

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner />
          <span style={{ color: 'var(--pp-text-secondary)' }}>
            Analyse en cours...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-6 p-8">
      <div className="flex flex-col items-center gap-2">
        <h2
          className="text-lg font-semibold"
          style={{ color: 'var(--pp-navy)' }}
        >
          Poser une question au graphe
        </h2>
        <p
          className="text-sm"
          style={{ color: 'var(--pp-text-secondary)' }}
        >
          Selectionnez une question pour obtenir une reponse visuelle sous forme
          de sous-graphe annote.
        </p>
      </div>

      <div className="grid w-full max-w-xl gap-3">
        {questions.map((q) => (
          <button
            key={q.type}
            onClick={() =>
              onSelect(q.type, q.needsTarget ? selectedNodeId : null)
            }
            className="flex cursor-pointer items-center gap-4 rounded-lg border px-5 py-4 text-left transition-shadow hover:shadow-md"
            style={{
              borderColor: 'var(--pp-border)',
              backgroundColor: 'var(--pp-surface)',
            }}
          >
            {q.icon}
            <span
              className="text-sm font-medium"
              style={{ color: 'var(--pp-navy)' }}
            >
              {q.label}
            </span>
          </button>
        ))}
      </div>

      {!selectedNodeId && (
        <p
          className="text-xs italic"
          style={{ color: 'var(--pp-text-secondary)' }}
        >
          Selectionnez un noeud dans le graphe pour debloquer les questions
          contextuelles.
        </p>
      )}
    </div>
  );
}
