import { createFileRoute } from '@tanstack/react-router';
import { Spinner } from '@fli-dgtf/flow-ui';
import { BarChart3Icon } from 'lucide-react';
import { useGraphInitialLoad } from '@/providers/state/use-graph-initial-load';
import { useUiStore } from '@/providers/state/ui-store';
import { ErrorBoundary } from '@/components/shared/error-boundary';
import { GanttToolbar } from './components/gantt-toolbar';
import { GanttChart } from './components/gantt-chart';
import { GanttMacro } from './components/gantt-macro';
import { GanttSegment } from './components/gantt-segment';
import { GanttBulkActions } from './components/gantt-bulk-actions';

export const Route = createFileRoute('/_layout/gantt')({
  component: GanttView,
});

function GanttView() {
  const { isLoading, error } = useGraphInitialLoad();
  const ganttResolution = useUiStore((s) => s.ganttResolution);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <div className="flex flex-col items-center gap-3">
          <Spinner />
          <span style={{ color: 'var(--pp-text-secondary)' }}>
            Chargement du diagramme de Gantt...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <h1
          className="text-2xl font-bold"
          style={{ color: 'var(--pp-navy)' }}
        >
          Gantt augmente
        </h1>
        <div
          className="rounded-lg border p-4"
          style={{
            borderColor: 'var(--pp-red)',
            backgroundColor: 'var(--pp-surface)',
            color: 'var(--pp-red)',
          }}
        >
          Erreur lors du chargement des donnees : {(error as Error).message}
        </div>
      </div>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex flex-1 flex-col" style={{ minHeight: 0 }}>
        {/* Header + Toolbar */}
        <div className="flex shrink-0 flex-col gap-3 px-6 pt-6 pb-3">
          <div className="flex items-center gap-3">
            <BarChart3Icon
              className="h-6 w-6"
              style={{ color: 'var(--pp-navy)' }}
            />
            <h1
              className="text-2xl font-bold"
              style={{ color: 'var(--pp-navy)' }}
            >
              Gantt augmente
            </h1>
          </div>
          <GanttToolbar />
        </div>

        {/* Chart - fills remaining space */}
        <div className="flex flex-1 px-6 pb-6" style={{ minHeight: 0 }}>
          <div
            className="flex flex-1 overflow-hidden rounded-lg border"
            style={{
              borderColor: 'var(--pp-border)',
              backgroundColor: 'var(--pp-surface)',
            }}
          >
            {ganttResolution === 'macro' && <GanttMacro />}
            {ganttResolution === 'segment' && <GanttSegment />}
            {ganttResolution === 'of' && <GanttChart />}
          </div>
        </div>

        {/* Bulk actions (sticky bottom) */}
        <GanttBulkActions />
      </div>
    </ErrorBoundary>
  );
}
