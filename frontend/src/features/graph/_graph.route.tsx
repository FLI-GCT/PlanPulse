import { createFileRoute } from '@tanstack/react-router';
import { Spinner } from '@fli-dgtf/flow-ui';
import { NetworkIcon } from 'lucide-react';
import { useGraphInitialLoad } from '@/providers/state/use-graph-initial-load';
import { DagCanvas } from './components/dag-canvas';

export const Route = createFileRoute('/_layout/graph')({
  component: GraphView,
});

function GraphView() {
  const { isLoading } = useGraphInitialLoad();

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner />
          <span style={{ color: 'var(--pp-text-secondary)' }}>
            Chargement du graphe...
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col" style={{ minHeight: 0 }}>
      {/* Header */}
      <div className="flex shrink-0 items-center gap-3 px-6 pt-6 pb-2">
        <NetworkIcon
          className="h-6 w-6"
          style={{ color: 'var(--pp-navy)' }}
        />
        <h1
          className="text-2xl font-bold"
          style={{ color: 'var(--pp-navy)' }}
        >
          Graphe de dependances
        </h1>
      </div>

      {/* DAG Canvas - fills remaining space */}
      <DagCanvas />
    </div>
  );
}
