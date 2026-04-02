import { createFileRoute } from '@tanstack/react-router';
import { Spinner } from '@fli-dgtf/flow-ui';
import { NetworkIcon } from 'lucide-react';
import { useGraphInitialLoad } from '@/providers/state/use-graph-initial-load';
import { useGraphNavigation } from './hooks/use-graph-navigation';
import { GraphBreadcrumb } from './components/graph-breadcrumb';
import { CommandGraph } from './components/command/command-graph';
import { CommandSidebar } from './components/command/command-sidebar';
import { FocusGraph } from './components/focus/focus-graph';
import { QuestionView } from './components/question/question-view';
import { StrategicToolbar } from './components/strategic/strategic-toolbar';
import { BubbleMap } from './components/strategic/bubble-map';
import { FlowView } from './components/strategic/flow-view';
import { useUiStore } from '@/providers/state/ui-store';
import { ErrorBoundary } from '@/components/shared/error-boundary';

export const Route = createFileRoute('/_layout/graph')({
  component: GraphView,
});

// ── Strategic view (Level 1) ─────────────────────────────────────
function StrategicView() {
  const variant = useUiStore((s) => s.graphNav.strategicVariant);

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <StrategicToolbar />
      <div className="flex-1 overflow-hidden">
        {variant === 'bubbles' && <BubbleMap />}
        {variant === 'flows' && <FlowView />}
      </div>
    </div>
  );
}

// ── Main graph view with level-based routing ─────────────────────
function GraphView() {
  const { isLoading } = useGraphInitialLoad();
  const { graphNav } = useGraphNavigation();

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
    <ErrorBoundary>
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

        {/* Breadcrumb */}
        <GraphBreadcrumb />

        {/* Content area */}
        <div className="flex flex-1 overflow-hidden" style={{ minHeight: 0 }}>
          {graphNav.level === 1 && <StrategicView />}

          {graphNav.level === 2 && (
            <>
              <CommandSidebar />
              {graphNav.commandOfFinalId ? (
                <CommandGraph ofFinalId={graphNav.commandOfFinalId} />
              ) : (
                <div className="flex flex-1 items-center justify-center">
                  <span style={{ color: 'var(--pp-text-secondary)' }}>
                    Selectionnez une commande client dans le panneau de gauche
                  </span>
                </div>
              )}
            </>
          )}

          {graphNav.level === '3a' && graphNav.focusNodeId && (
            <FocusGraph focusNodeId={graphNav.focusNodeId} />
          )}

          {graphNav.level === '3b' && <QuestionView />}
        </div>
      </div>
    </ErrorBoundary>
  );
}
