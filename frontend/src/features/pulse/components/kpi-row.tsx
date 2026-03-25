import { Spinner } from '@fli-dgtf/flow-ui';
import { useKpiQuery } from '@/providers/api/kpi';
import { KpiCard } from '@/components/shared/kpi-card';

export function KpiRow() {
  const { data: kpi, isLoading } = useKpiQuery();

  if (isLoading) {
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

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <KpiCard
        label="OF actifs"
        value={kpi.ofActifs}
        color="var(--pp-navy)"
      />
      <KpiCard
        label="En retard"
        value={kpi.ofEnRetard}
        color={retardColor}
      />
      <KpiCard
        label="Tension"
        value={`${kpi.tension} %`}
        color={tensionColor}
      />
      <KpiCard
        label="Couverture achats"
        value={`${kpi.couvertureAchats} %`}
        color={couvertureColor}
      />
    </div>
  );
}
