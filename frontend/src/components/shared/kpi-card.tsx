import { Card, CardContent } from '@fli-dgtf/flow-ui';

interface KpiCardProps {
  label: string;
  value: number | string;
  trend?: 'up' | 'down' | 'neutral';
  color?: string;
}

export function KpiCard({ label, value, color }: KpiCardProps) {
  return (
    <Card className="min-w-0">
      <CardContent className="p-4">
        <div
          className="text-sm"
          style={{ color: 'var(--pp-text-secondary)' }}
        >
          {label}
        </div>
        <div
          className="text-3xl font-bold tabular-nums"
          style={{ color: color ?? 'var(--pp-navy)' }}
        >
          {value}
        </div>
      </CardContent>
    </Card>
  );
}
