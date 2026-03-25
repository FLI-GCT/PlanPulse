import { useCallback } from 'react';
import { useReactFlow } from '@xyflow/react';
import { Button } from '@fli-dgtf/flow-ui';
import {
  ZapIcon,
  ArrowUpFromLineIcon,
  MaximizeIcon,
} from 'lucide-react';
import { useUiStore } from '@/providers/state/ui-store';

interface GraphToolbarProps {
  highlightedNodes: Set<string>;
  onHighlightImpact: () => void;
  onHighlightAncestors: () => void;
  onClearHighlight: () => void;
  highlightMode: 'none' | 'impact' | 'ancestors';
}

export function GraphToolbar({
  highlightedNodes,
  onHighlightImpact,
  onHighlightAncestors,
  onClearHighlight,
  highlightMode,
}: GraphToolbarProps) {
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const { fitView } = useReactFlow();

  const handleFitView = useCallback(() => {
    fitView({ padding: 0.2, duration: 300 });
  }, [fitView]);

  const handleImpact = useCallback(() => {
    if (highlightMode === 'impact') {
      onClearHighlight();
    } else {
      onHighlightImpact();
    }
  }, [highlightMode, onHighlightImpact, onClearHighlight]);

  const handleAncestors = useCallback(() => {
    if (highlightMode === 'ancestors') {
      onClearHighlight();
    } else {
      onHighlightAncestors();
    }
  }, [highlightMode, onHighlightAncestors, onClearHighlight]);

  return (
    <div
      className="flex items-center gap-2 rounded-lg border px-3 py-2"
      style={{
        backgroundColor: 'var(--pp-surface)',
        borderColor: 'var(--pp-border)',
      }}
    >
      <Button
        size="sm"
        variant={highlightMode === 'impact' ? 'default' : 'outline'}
        disabled={!selectedNodeId}
        onClick={handleImpact}
      >
        <ZapIcon className="mr-1.5 h-3.5 w-3.5" />
        Zone d&apos;impact
        {highlightMode === 'impact' && highlightedNodes.size > 0 && (
          <span className="ml-1 tabular-nums">({highlightedNodes.size})</span>
        )}
      </Button>

      <Button
        size="sm"
        variant={highlightMode === 'ancestors' ? 'default' : 'outline'}
        disabled={!selectedNodeId}
        onClick={handleAncestors}
      >
        <ArrowUpFromLineIcon className="mr-1.5 h-3.5 w-3.5" />
        Remonter les causes
        {highlightMode === 'ancestors' && highlightedNodes.size > 0 && (
          <span className="ml-1 tabular-nums">({highlightedNodes.size})</span>
        )}
      </Button>

      <div
        className="mx-1 h-5 w-px"
        style={{ backgroundColor: 'var(--pp-border)' }}
      />

      <Button size="sm" variant="outline" onClick={handleFitView}>
        <MaximizeIcon className="mr-1.5 h-3.5 w-3.5" />
        Recentrer
      </Button>
    </div>
  );
}
