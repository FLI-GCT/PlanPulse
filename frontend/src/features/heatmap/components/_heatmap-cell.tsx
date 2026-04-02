// ---------------------------------------------------------------------------
// HeatmapCell – cellule enrichie pour la heatmap de risque
// ---------------------------------------------------------------------------

export interface HeatmapCellProps {
  ofCount: number;
  criticalCount: number;
  avgMargin: number;
  trend: 'up' | 'down' | 'stable';
  onClick?: () => void;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function marginToBackground(avgMargin: number): string {
  if (avgMargin < 0) return 'var(--pp-red)';
  if (avgMargin <= 1) return 'var(--pp-coral)';
  if (avgMargin <= 5) return 'var(--pp-amber)';
  return 'var(--pp-green)';
}

const TREND_MAP: Record<HeatmapCellProps['trend'], { symbol: string; color: string }> = {
  up: { symbol: '\u2191', color: '#22c55e' },   // ↑ green
  down: { symbol: '\u2193', color: '#ef4444' },  // ↓ red
  stable: { symbol: '=', color: '#9ca3af' },     // = gray
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function HeatmapCell({
  ofCount,
  criticalCount,
  avgMargin,
  trend,
  onClick,
}: HeatmapCellProps) {
  const bg = marginToBackground(avgMargin);
  const { symbol, color } = TREND_MAP[trend];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onClick?.();
      }}
      className="relative flex h-full w-full cursor-pointer items-center justify-center select-none"
      style={{
        backgroundColor: bg,
        borderRadius: 3,
        opacity: 1,
      }}
    >
      {/* Centre : nombre d'OFs */}
      <span
        style={{
          fontSize: 16,
          fontWeight: 700,
          color: 'rgba(255,255,255,0.95)',
          lineHeight: 1,
        }}
      >
        {ofCount}
      </span>

      {/* Coin haut-droit : tendance */}
      <span
        className="absolute top-0.5 right-0.5"
        style={{
          fontSize: 10,
          fontWeight: 600,
          lineHeight: 1,
          color,
        }}
      >
        {symbol}
      </span>

      {/* Coin bas-droit : OFs critiques */}
      {criticalCount > 0 && (
        <span
          className="absolute right-0.5 bottom-0.5"
          style={{
            fontSize: 10,
            fontWeight: 500,
            lineHeight: 1,
            color: 'rgba(255,255,255,0.95)',
          }}
        >
          {criticalCount}
        </span>
      )}
    </div>
  );
}
