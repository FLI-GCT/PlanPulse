import { memo, useCallback } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { cn } from '@fli-dgtf/flow-ui';
import { OfStatusBadge } from '@/components/shared/of-status-badge';
import { DateDisplay } from '@/components/shared/date-display';
import { getMarginColor, getMarginBg } from '../../utils/margin-color';
import type { GraphNode, MarginResult } from '@/providers/state/graph-store';

export type FocusCenterData = GraphNode & {
  margin: MarginResult | undefined;
  estCritique: boolean;
};

type FocusCenterNodeType = Node<FocusCenterData, 'focusCenter'>;

function FocusCenterNodeComponent({ data, id }: NodeProps<FocusCenterNodeType>) {
  const isCritical = data.estCritique;
  const marginColor = data.margin
    ? getMarginColor(data.margin.floatTotal)
    : 'var(--pp-border)';

  return (
    <div className="relative">
      <div
        className={cn(
          'flex w-[280px] flex-col gap-1.5 rounded-lg border-l-[5px] px-4 py-3',
          isCritical && 'border-2',
        )}
        style={{
          backgroundColor: '#F0F7FF',
          borderLeftColor: isCritical ? 'var(--pp-red)' : marginColor,
          boxShadow: '0 4px 12px rgba(0,0,0,0.1)',
          height: 120,
          ...(isCritical
            ? {
                borderColor: 'var(--pp-red)',
                borderLeftColor: 'var(--pp-red)',
              }
            : {}),
        }}
      >
        {/* Row 1: ID + Priority */}
        <div className="flex items-center justify-between">
          <span
            className="truncate text-base font-bold"
            style={{ color: 'var(--pp-navy)' }}
          >
            {data.label}
          </span>
          {data.priorite != null && (
            <span
              className="ml-2 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums"
              style={{
                color: 'var(--pp-text-secondary)',
                backgroundColor: 'var(--pp-bg)',
              }}
            >
              P{data.priorite}
            </span>
          )}
        </div>

        {/* Row 2: Article */}
        <div
          className="truncate text-xs"
          style={{ color: 'var(--pp-text-secondary)' }}
        >
          {data.articleId ?? 'Sans article'}
        </div>

        {/* Row 3: Dates */}
        <div
          className="flex items-center gap-1 text-xs"
          style={{ color: 'var(--pp-text-secondary)' }}
        >
          <DateDisplay date={data.dateDebut} />
          <span>&rarr;</span>
          <DateDisplay date={data.dateFin} />
        </div>

        {/* Row 4: Status + Margin */}
        <div className="flex items-center gap-2">
          <OfStatusBadge statut={data.statut} />
          {data.margin && (
            <span
              className="rounded px-2 py-0.5 text-xs font-semibold tabular-nums"
              style={{
                backgroundColor: getMarginBg(data.margin.floatTotal),
                color: getMarginColor(data.margin.floatTotal),
              }}
            >
              {data.margin.floatTotal}j
            </span>
          )}
          {isCritical && (
            <span
              className="text-[10px] font-semibold"
              style={{ color: 'var(--pp-red)' }}
            >
              Critique
            </span>
          )}
        </div>
      </div>

      <Handle
        type="target"
        position={Position.Left}
        className="!h-3 !w-3 !border-none"
        style={{ backgroundColor: 'var(--pp-blue)' }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="!h-3 !w-3 !border-none"
        style={{ backgroundColor: 'var(--pp-blue)' }}
      />
    </div>
  );
}

export const FocusCenterNode = memo(FocusCenterNodeComponent);
