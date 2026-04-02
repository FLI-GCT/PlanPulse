import { Card, CardContent } from '@fli-dgtf/flow-ui';

interface CurrentKpi {
  ofActifs: number;
  ofEnRetard: number;
  tension: number;
  couvertureAchats: number;
}

interface ScenarioKpi {
  activeOfs: number;
  lateOfs: number;
  tensionPct: number;
  coveragePct: number;
}

interface DeltaKpiProps {
  currentKpi: CurrentKpi;
  scenarioKpi: ScenarioKpi | null;
}

interface KpiRow {
  label: string;
  current: number;
  scenario: number | null;
  suffix: string;
  /** true = higher scenario value is good (green), false = lower is good */
  higherIsGood: boolean;
}

function DeltaIndicator({
  delta,
  higherIsGood,
}: {
  delta: number;
  higherIsGood: boolean;
}) {
  if (delta === 0) {
    return (
      <span className="text-sm font-medium" style={{ color: 'var(--pp-text-secondary)' }}>
        =
      </span>
    );
  }

  const isPositive = delta > 0;
  const arrow = isPositive ? '\u25B2' : '\u25BC';
  const isGood = higherIsGood ? isPositive : !isPositive;
  const color = isGood ? 'var(--pp-green)' : 'var(--pp-red)';

  return (
    <span className="text-sm font-semibold" style={{ color }}>
      {arrow} {isPositive ? '+' : ''}
      {delta}
    </span>
  );
}

export function DeltaKpi({ currentKpi, scenarioKpi }: DeltaKpiProps) {
  const rows: KpiRow[] = [
    {
      label: 'OF actifs',
      current: currentKpi.ofActifs,
      scenario: scenarioKpi?.activeOfs ?? null,
      suffix: '',
      higherIsGood: true,
    },
    {
      label: 'En retard',
      current: currentKpi.ofEnRetard,
      scenario: scenarioKpi?.lateOfs ?? null,
      suffix: '',
      higherIsGood: false,
    },
    {
      label: 'Tension',
      current: currentKpi.tension,
      scenario: scenarioKpi?.tensionPct ?? null,
      suffix: ' %',
      higherIsGood: false,
    },
    {
      label: 'Couverture achats',
      current: currentKpi.couvertureAchats,
      scenario: scenarioKpi?.coveragePct ?? null,
      suffix: ' %',
      higherIsGood: true,
    },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {rows.map((row) => {
        const delta =
          row.scenario !== null ? row.scenario - row.current : null;

        return (
          <Card key={row.label} className="min-w-0">
            <CardContent className="p-4">
              <div
                className="mb-2 text-sm font-medium"
                style={{ color: 'var(--pp-text-secondary)' }}
              >
                {row.label}
              </div>

              <div className="flex items-end justify-between gap-2">
                {/* Plan actuel */}
                <div>
                  <div
                    className="text-xs"
                    style={{ color: 'var(--pp-text-secondary)' }}
                  >
                    Plan actuel
                  </div>
                  <div
                    className="text-2xl font-bold tabular-nums"
                    style={{ color: 'var(--pp-navy)' }}
                  >
                    {row.current}
                    {row.suffix}
                  </div>
                </div>

                {/* Scenario */}
                <div>
                  <div
                    className="text-xs"
                    style={{ color: 'var(--pp-text-secondary)' }}
                  >
                    Scenario
                  </div>
                  <div
                    className="text-2xl font-bold tabular-nums"
                    style={{ color: 'var(--pp-blue, var(--pp-navy))' }}
                  >
                    {row.scenario !== null
                      ? `${row.scenario}${row.suffix}`
                      : '--'}
                  </div>
                </div>

                {/* Delta */}
                <div className="text-right">
                  <div
                    className="text-xs"
                    style={{ color: 'var(--pp-text-secondary)' }}
                  >
                    Delta
                  </div>
                  {delta !== null ? (
                    <DeltaIndicator
                      delta={delta}
                      higherIsGood={row.higherIsGood}
                    />
                  ) : (
                    <span
                      className="text-sm"
                      style={{ color: 'var(--pp-text-secondary)' }}
                    >
                      --
                    </span>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
