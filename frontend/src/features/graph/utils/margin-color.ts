export function getMarginColor(floatTotal: number): string {
  if (floatTotal > 5) return 'var(--pp-green)';
  if (floatTotal > 1) return 'var(--pp-amber)';
  if (floatTotal >= 0) return 'var(--pp-coral)';
  return 'var(--pp-red)';
}

export function getMarginBg(floatTotal: number): string {
  if (floatTotal > 5) return '#E8F5E9';
  if (floatTotal > 1) return '#FFF3E0';
  if (floatTotal >= 0) return '#FBE9E7';
  return '#FFEBEE';
}

export function getTensionLevel(
  margin: number,
): 'ok' | 'warning' | 'critical' | 'late' {
  if (margin > 5) return 'ok';
  if (margin > 1) return 'warning';
  if (margin >= 0) return 'critical';
  return 'late';
}
