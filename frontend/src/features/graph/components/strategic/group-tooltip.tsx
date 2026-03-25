import { getMarginColor } from '@/features/graph/utils/margin-color';

export interface GroupTooltipProps {
  group: {
    label: string;
    ofCount: number;
    avgMargin: number;
    minMargin: number;
    alertCount: number;
  } | null;
  position: { x: number; y: number };
}

export function GroupTooltip({ group, position }: GroupTooltipProps) {
  if (!group) return null;

  return (
    <div
      className="pointer-events-none fixed z-50 rounded-lg border px-3 py-2 shadow-lg"
      style={{
        left: position.x + 12,
        top: position.y - 8,
        backgroundColor: 'var(--pp-surface)',
        borderColor: 'var(--pp-border)',
        maxWidth: 240,
      }}
    >
      <p
        className="mb-1 text-sm font-semibold"
        style={{ color: 'var(--pp-navy)' }}
      >
        {group.label}
      </p>
      <div className="space-y-0.5 text-xs" style={{ color: 'var(--pp-text-secondary)' }}>
        <p>
          <span className="font-medium" style={{ color: 'var(--pp-text)' }}>
            {group.ofCount}
          </span>{' '}
          OF
        </p>
        <p>
          Marge moy.{' '}
          <span
            className="font-medium"
            style={{ color: getMarginColor(group.avgMargin) }}
          >
            {group.avgMargin.toFixed(1)}j
          </span>
        </p>
        <p>
          Marge min.{' '}
          <span
            className="font-medium"
            style={{ color: getMarginColor(group.minMargin) }}
          >
            {group.minMargin.toFixed(1)}j
          </span>
        </p>
        {group.alertCount > 0 && (
          <p style={{ color: 'var(--pp-red)' }}>
            {group.alertCount} alerte{group.alertCount > 1 ? 's' : ''}
          </p>
        )}
      </div>
    </div>
  );
}
