import { memo, useCallback, useState } from 'react';
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react';
import { cn } from '@fli-dgtf/flow-ui';
import { OfStatusBadge } from '@/components/shared/of-status-badge';
import { DateDisplay } from '@/components/shared/date-display';
import { useUiStore } from '@/providers/state/ui-store';
import type { GraphNode, MarginResult } from '@/providers/state/graph-store';

export type AchatNodeData = GraphNode & {
  margin: MarginResult | undefined;
  estCritique: boolean;
};

type AchatNodeType = Node<AchatNodeData, 'achatNode'>;

function getBorderColor(margin: MarginResult | undefined): string {
  if (!margin) return 'var(--pp-border)';
  if (margin.floatTotal > 5) return 'var(--pp-green)';
  if (margin.floatTotal >= 1) return 'var(--pp-amber)';
  return 'var(--pp-red)';
}

function AchatNodeComponent({ data, id }: NodeProps<AchatNodeType>) {
  const [showTooltip, setShowTooltip] = useState(false);
  const selectedNodeId = useUiStore((s) => s.selectedNodeId);
  const selectNode = useUiStore((s) => s.selectNode);
  const hoverNode = useUiStore((s) => s.hoverNode);
  const isSelected = selectedNodeId === id;
  const isCritical = data.estCritique;
  const borderColor = getBorderColor(data.margin);

  const handleClick = useCallback(() => {
    selectNode(id);
  }, [selectNode, id]);

  const handleMouseEnter = useCallback(() => {
    hoverNode(id);
    setShowTooltip(true);
  }, [hoverNode, id]);

  const handleMouseLeave = useCallback(() => {
    hoverNode(null);
    setShowTooltip(false);
  }, [hoverNode]);

  return (
    <div
      className="relative"
      onClick={handleClick}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      {/* Diamond-shaped wrapper via rotated inner element */}
      <div
        className={cn(
          'flex w-[180px] flex-col gap-1 rounded-lg border-l-4 px-3 py-2 shadow-sm transition-shadow',
          isSelected && 'ring-2',
          isCritical && 'border-2',
        )}
        style={{
          backgroundColor: '#F3EEFF',
          borderLeftColor: borderColor,
          ...(isCritical
            ? {
                borderColor: 'var(--pp-red)',
                borderLeftColor: 'var(--pp-red)',
              }
            : {}),
          ...(isSelected
            ? {
                ringColor: 'var(--pp-blue)',
                boxShadow: '0 0 0 2px var(--pp-blue)',
              }
            : {}),
        }}
      >
        {/* Purple diamond indicator */}
        <div className="flex items-center gap-1.5">
          <div
            className="h-3 w-3 shrink-0 rotate-45 rounded-sm"
            style={{ backgroundColor: '#8B5CF6' }}
          />
          <span
            className="truncate text-xs font-bold"
            style={{ color: 'var(--pp-navy)' }}
          >
            {data.label}
          </span>
        </div>

        <div
          className="truncate text-[10px]"
          style={{ color: 'var(--pp-text-secondary)' }}
        >
          {data.articleId ?? 'Sans article'}
        </div>

        <div
          className="flex items-center gap-1 text-[10px]"
          style={{ color: 'var(--pp-text-secondary)' }}
        >
          <DateDisplay date={data.dateDebut} />
          <span>-</span>
          <DateDisplay date={data.dateFin} />
        </div>

        <div className="mt-0.5">
          <OfStatusBadge statut={data.statut} />
        </div>
      </div>

      {/* Tooltip */}
      {showTooltip && (
        <div
          className="absolute -top-2 left-[190px] z-50 w-56 rounded-lg border p-3 text-xs shadow-lg"
          style={{
            backgroundColor: 'var(--pp-surface)',
            borderColor: 'var(--pp-border)',
            color: 'var(--pp-navy)',
          }}
        >
          <div className="mb-1 font-bold">{data.label}</div>
          <div style={{ color: 'var(--pp-text-secondary)' }}>
            Type : Achat
          </div>
          <div style={{ color: 'var(--pp-text-secondary)' }}>
            Article : {data.articleId ?? '-'}
          </div>
          <div style={{ color: 'var(--pp-text-secondary)' }}>
            Quantite : {data.quantite}
          </div>
          <div style={{ color: 'var(--pp-text-secondary)' }}>
            Debut : <DateDisplay date={data.dateDebut} />
          </div>
          <div style={{ color: 'var(--pp-text-secondary)' }}>
            Fin : <DateDisplay date={data.dateFin} />
          </div>
          {data.margin && (
            <>
              <div className="mt-1 border-t pt-1" style={{ borderColor: 'var(--pp-border)' }}>
                <span>Marge totale : {data.margin.floatTotal}j</span>
              </div>
              <div>Marge libre : {data.margin.floatLibre}j</div>
              {data.estCritique && (
                <div className="mt-1 font-semibold" style={{ color: 'var(--pp-red)' }}>
                  Chemin critique
                </div>
              )}
            </>
          )}
        </div>
      )}

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

export const AchatNode = memo(AchatNodeComponent);
