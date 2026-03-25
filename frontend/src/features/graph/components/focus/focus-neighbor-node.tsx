import { memo } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { cn } from '@fli-dgtf/flow-ui';
import { OfStatusBadge } from '@/components/shared/of-status-badge';
import { DateDisplay } from '@/components/shared/date-display';
import { getMarginColor, getMarginBg } from '../../utils/margin-color';
import type { GraphNode, MarginResult } from '@/providers/state/graph-store';

export type FocusNeighborData = GraphNode & {
  margin: MarginResult | undefined;
  estCritique: boolean;
};

type FocusNeighborNodeType = Node<FocusNeighborData, 'focusNeighbor'>;

function FocusNeighborNodeComponent({
  data,
  id,
}: NodeProps<FocusNeighborNodeType>) {
  const isCritical = data.estCritique;
  const marginColor = data.margin
    ? getMarginColor(data.margin.floatTotal)
    : 'var(--pp-border)';

  return (
    <div className="relative cursor-pointer">
      <div
        className={cn(
          'flex w-[220px] flex-col gap-1 rounded-lg border-l-4 px-3 py-2 shadow-sm transition-shadow hover:shadow-md',
          isCritical && 'border-2',
        )}
        style={{
          backgroundColor: 'var(--pp-surface)',
          borderLeftColor: isCritical ? 'var(--pp-red)' : marginColor,
          height: 90,
          ...(isCritical
            ? {
                borderColor: 'var(--pp-red)',
                borderLeftColor: 'var(--pp-red)',
              }
            : {}),
        }}
      >
        {/* Row 1: ID */}
        <div className="flex items-center justify-between">
          <span
            className="truncate text-xs font-bold"
            style={{ color: 'var(--pp-navy)' }}
          >
            {data.label}
          </span>
          {data.priorite != null && (
            <span
              className="ml-1 text-[10px] tabular-nums"
              style={{ color: 'var(--pp-text-secondary)' }}
            >
              P{data.priorite}
            </span>
          )}
        </div>

        {/* Row 2: Article */}
        <div
          className="truncate text-[10px]"
          style={{ color: 'var(--pp-text-secondary)' }}
        >
          {data.articleId ?? 'Sans article'}
        </div>

        {/* Row 3: Dates */}
        <div
          className="flex items-center gap-1 text-[10px]"
          style={{ color: 'var(--pp-text-secondary)' }}
        >
          <DateDisplay date={data.dateDebut} />
          <span>&rarr;</span>
          <DateDisplay date={data.dateFin} />
        </div>

        {/* Row 4: Status + Margin */}
        <div className="flex items-center gap-1.5">
          <OfStatusBadge statut={data.statut} />
          {data.margin && (
            <span
              className="rounded px-1.5 py-0.5 text-[10px] font-semibold tabular-nums"
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
        className="!h-2 !w-2 !border-none"
        style={{ backgroundColor: 'var(--pp-border)' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-2 !w-2 !border-none"
        style={{ backgroundColor: 'var(--pp-border)' }}
      />
    </div>
  );
}

export const FocusNeighborNode = memo(FocusNeighborNodeComponent);
