import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { cn } from '@fli-dgtf/flow-ui';
import { OfStatusBadge } from '@/components/shared/of-status-badge';
import { getMarginColor, getMarginBg } from '../../utils/margin-color';
import type { GraphNode, MarginResult } from '@/providers/state/graph-store';

export type FocusDistantData = GraphNode & {
  margin: MarginResult | undefined;
  estCritique: boolean;
};

type FocusDistantNodeType = Node<FocusDistantData, 'focusDistant'>;

function FocusDistantNodeComponent({
  data,
  id,
}: NodeProps<FocusDistantNodeType>) {
  const isCritical = data.estCritique;

  return (
    <div className="relative cursor-pointer" style={{ opacity: 0.6 }}>
      <div
        className={cn(
          'flex w-[160px] flex-col justify-center gap-0.5 rounded-md border-l-3 px-2 py-1.5 shadow-sm transition-shadow hover:opacity-100 hover:shadow-md',
          isCritical && 'border',
        )}
        style={{
          backgroundColor: 'var(--pp-surface)',
          borderLeftColor: isCritical
            ? 'var(--pp-red)'
            : 'var(--pp-border)',
          height: 60,
          ...(isCritical
            ? {
                borderColor: 'var(--pp-red)',
                borderLeftColor: 'var(--pp-red)',
              }
            : {}),
        }}
      >
        {/* Row 1: ID */}
        <span
          className="truncate text-[11px] font-bold"
          style={{ color: 'var(--pp-navy)' }}
        >
          {data.label}
        </span>

        {/* Row 2: Status + Margin number */}
        <div className="flex items-center gap-1">
          <OfStatusBadge statut={data.statut} />
          {data.margin && (
            <span
              className="rounded px-1 py-0.5 text-[9px] font-semibold tabular-nums"
              style={{
                backgroundColor: getMarginBg(data.margin.floatTotal),
                color: getMarginColor(data.margin.floatTotal),
              }}
            >
              {data.margin.floatTotal}j
            </span>
          )}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="!h-1.5 !w-1.5 !border-none"
        style={{ backgroundColor: 'var(--pp-border)' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-1.5 !w-1.5 !border-none"
        style={{ backgroundColor: 'var(--pp-border)' }}
      />
    </div>
  );
}

export const FocusDistantNode = memo(FocusDistantNodeComponent);
