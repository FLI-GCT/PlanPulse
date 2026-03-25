import { createFileRoute } from '@tanstack/react-router';
import { Spinner } from '@fli-dgtf/flow-ui';
import { LayoutDashboardIcon } from 'lucide-react';
import { useGraphInitialLoad } from '@/providers/state/use-graph-initial-load';
import { useGraphStore } from '@/providers/state/graph-store';
import { KpiRow } from './components/kpi-row';
import { CriticalOfsTable } from './components/critical-ofs-table';
import { AlertsFeed } from './components/alerts-feed';

export const Route = createFileRoute('/_layout/')({
  component: PulseDashboard,
});

function SummaryBar() {
  const kpis = useGraphStore((s) => s.kpis);

  if (!kpis) return null;

  const items = [
    { label: 'Total OFs', value: kpis.totalOfs },
    { label: 'Total achats', value: kpis.totalAchats },
    { label: 'Total aretes', value: kpis.totalAretes },
  ];

  return (
    <div
      className="flex items-center gap-6 rounded-lg border px-4 py-2 text-sm"
      style={{
        backgroundColor: 'var(--pp-surface)',
        borderColor: 'var(--pp-border)',
      }}
    >
      {items.map(({ label, value }) => (
        <span key={label}>
          <span style={{ color: 'var(--pp-text-secondary)' }}>{label} : </span>
          <span
            className="font-semibold tabular-nums"
            style={{ color: 'var(--pp-navy)' }}
          >
            {value}
          </span>
        </span>
      ))}
    </div>
  );
}

function PulseDashboard() {
  const { isLoading: graphLoading } = useGraphInitialLoad();

  return (
    <div className="flex flex-col gap-6 p-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <LayoutDashboardIcon
          className="h-6 w-6"
          style={{ color: 'var(--pp-navy)' }}
        />
        <h1
          className="text-2xl font-bold"
          style={{ color: 'var(--pp-navy)' }}
        >
          Tableau de bord
        </h1>
      </div>

      {/* Zone haute - KPIs */}
      <KpiRow />

      {/* Zone centrale - Table + Alertes */}
      {graphLoading ? (
        <div className="flex items-center justify-center py-12">
          <Spinner />
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <CriticalOfsTable />
          </div>
          <div className="lg:col-span-1">
            <AlertsFeed />
          </div>
        </div>
      )}

      {/* Zone basse - Summary stats */}
      <SummaryBar />
    </div>
  );
}
