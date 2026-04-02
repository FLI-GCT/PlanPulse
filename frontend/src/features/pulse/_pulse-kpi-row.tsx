import { Spinner, Card, CardContent } from '@fli-dgtf/flow-ui';
import { useKpiQuery, useKpiTrendQuery } from '@/providers/api/kpi';

interface SparklineProps {
  data: number[];
  color: string;
}

function Sparkline({ data, color }: SparklineProps) {
  if (!data || data.length === 0) return null;

  const max = Math.max(...data, 1);
  const barWidth = 6;
  const gap = 2;
  const height = 16;
  const width = data.length * (barWidth + gap) - gap;

  return (
    <svg width={width} height={height} className="mt-2">
      {data.map((val, i) => {
        const barHeight = Math.max(1, (val / max) * height);
        return (
          <rect
            key={i}
            x={i * (barWidth + gap)}
            y={height - barHeight}
            width={barWidth}
            height={barHeight}
            rx={1}
            fill={color}
            opacity={0.7}
          />
        );
      })}
    </svg>
  );
}

interface KpiDef {
  label: string;
  value: string | number;
  color: string;
  trend: number[] | undefined;
}

export function PulseKpiRow() {
  const { data: kpi, isLoading: kpiLoading } = useKpiQuery();
  const { data: trend } = useKpiTrendQuery();

  if (kpiLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Spinner />
      </div>
    );
  }

  if (!kpi) return null;

  const retardColor =
    kpi.ofEnRetard > 0 ? 'var(--pp-red)' : 'var(--pp-green)';

  const tensionColor =
    kpi.tension > 10 ? 'var(--pp-amber)' : 'var(--pp-green)';

  const couvertureColor =
    kpi.couvertureAchats >= 80
      ? 'var(--pp-green)'
      : kpi.couvertureAchats >= 50
        ? 'var(--pp-amber)'
        : 'var(--pp-red)';

  const kpis: KpiDef[] = [
    {
      label: 'OF actifs',
      value: kpi.ofActifs,
      color: 'var(--pp-navy)',
      trend: trend?.activeOfs,
    },
    {
      label: 'En retard',
      value: kpi.ofEnRetard,
      color: retardColor,
      trend: trend?.lateOfs,
    },
    {
      label: 'Tension',
      value: `${kpi.tension} %`,
      color: tensionColor,
      trend: trend?.tensionPct,
    },
    {
      label: 'Couverture achats',
      value: `${kpi.couvertureAchats} %`,
      color: couvertureColor,
      trend: trend?.coveragePct,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpis.map((k) => (
        <Card key={k.label} className="min-w-0">
          <CardContent className="p-4">
            <div
              className="text-sm"
              style={{ color: 'var(--pp-text-secondary)' }}
            >
              {k.label}
            </div>
            <div
              className="text-3xl font-bold tabular-nums"
              style={{ color: k.color }}
            >
              {k.value}
            </div>
            {k.trend && <Sparkline data={k.trend} color={k.color} />}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
