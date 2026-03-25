import { memo, useCallback, useRef } from 'react';
import type { ScaleTime } from 'd3-scale';
import { parseISO } from 'date-fns';
import type { GraphNode, MarginResult } from '@/providers/state/graph-store';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface GanttBarProps {
  node: GraphNode;
  margin: MarginResult | undefined;
  xScale: ScaleTime<number, number>;
  yPosition: number;
  isSelected: boolean;
  isCritical: boolean;
  isPreview: boolean;
  previewDateDebut?: string;
  previewDateFin?: string;
  isDragDisabled: boolean;
  onDragStart: (nodeId: string, startX: number) => void;
  onClick: (nodeId: string) => void;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROW_HEIGHT = 36;
const BAR_HEIGHT = 28;
const BAR_Y_OFFSET = (ROW_HEIGHT - BAR_HEIGHT) / 2;
const MIN_BAR_WIDTH = 6;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function getBarColor(margin: MarginResult | undefined, statut: string): string {
  if (statut === 'EN_RETARD') return 'var(--pp-red)';
  if (!margin) return 'var(--pp-blue)';

  const ft = margin.floatTotal;
  if (ft < 0) return 'var(--pp-red)';
  if (ft <= 1) return 'var(--pp-coral)';
  if (ft <= 5) return 'var(--pp-amber)';
  return 'var(--pp-green)';
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const GanttBar = memo(function GanttBar({
  node,
  margin,
  xScale,
  yPosition,
  isSelected,
  isCritical,
  isPreview,
  previewDateDebut,
  previewDateFin,
  isDragDisabled,
  onDragStart,
  onClick,
}: GanttBarProps) {
  const barRef = useRef<SVGGElement>(null);

  const dateDebut = previewDateDebut ?? node.dateDebut;
  const dateFin = previewDateFin ?? node.dateFin;

  const x = xScale(parseISO(dateDebut));
  const xEnd = xScale(parseISO(dateFin));
  const width = Math.max(xEnd - x, MIN_BAR_WIDTH);
  const y = yPosition + BAR_Y_OFFSET;

  const fillColor = getBarColor(margin, node.statut);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isDragDisabled || node.type !== 'of') return;
      e.preventDefault();
      e.stopPropagation();
      onDragStart(node.id, e.clientX);
    },
    [isDragDisabled, node.id, node.type, onDragStart],
  );

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      // Only trigger click if not dragging
      if (e.detail === 1) {
        onClick(node.id);
      }
    },
    [node.id, onClick],
  );

  // Stroke style
  let strokeColor = 'none';
  let strokeWidth = 0;
  if (isCritical) {
    strokeColor = 'var(--pp-red)';
    strokeWidth = 3;
  }
  if (isSelected) {
    strokeColor = 'var(--pp-blue)';
    strokeWidth = 2.5;
  }

  // Clip ID for text
  const clipId = `bar-clip-${node.id}${isPreview ? '-preview' : ''}`;

  return (
    <g
      ref={barRef}
      opacity={isPreview ? 0.5 : 1}
      style={{
        cursor: isDragDisabled || node.type !== 'of' ? 'default' : 'grab',
      }}
      onMouseDown={handleMouseDown}
      onClick={handleClick}
    >
      <defs>
        <clipPath id={clipId}>
          <rect x={x + 4} y={y} width={Math.max(width - 8, 0)} height={BAR_HEIGHT} />
        </clipPath>
      </defs>

      {/* Bar background */}
      <rect
        x={x}
        y={y}
        width={width}
        height={BAR_HEIGHT}
        rx={4}
        ry={4}
        fill={fillColor}
        stroke={strokeColor}
        strokeWidth={strokeWidth}
      />

      {/* Bar text label */}
      {width > 30 && (
        <text
          x={x + 6}
          y={y + BAR_HEIGHT / 2 + 4}
          fontSize={10}
          fontWeight={600}
          fill="white"
          clipPath={`url(#${clipId})`}
          style={{ userSelect: 'none', pointerEvents: 'none' }}
        >
          {node.label}
        </text>
      )}
    </g>
  );
});
