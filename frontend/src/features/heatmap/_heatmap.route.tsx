import { useState } from 'react';
import { createFileRoute } from '@tanstack/react-router';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Card,
  CardContent,
  Spinner,
} from '@fli-dgtf/flow-ui';
import { ThermometerIcon } from 'lucide-react';
import { useGraphInitialLoad } from '@/providers/state/use-graph-initial-load';
import { useGraphStore } from '@/providers/state/graph-store';
import {
  HeatmapGrid,
  type TimeBucket,
  type GroupBy,
} from './components/heatmap-grid';

export const Route = createFileRoute('/_layout/heatmap')({
  component: HeatmapView,
});

function HeatmapView() {
  const { isLoading, error } = useGraphInitialLoad();
  const nodes = useGraphStore((s) => s.nodes);
  const margins = useGraphStore((s) => s.margins);

  const [timeBucket, setTimeBucket] = useState<TimeBucket>('week');
  const [groupBy, setGroupBy] = useState<GroupBy>('client');

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <Spinner />
        <span className="ml-3" style={{ color: "var(--pp-text-secondary)" }}>
          Chargement du graphe...
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col gap-4 p-6">
        <h1 className="text-2xl font-bold" style={{ color: "var(--pp-navy)" }}>
          Heatmap de risque
        </h1>
        <div
          className="rounded-lg border p-4"
          style={{
            borderColor: 'var(--pp-red)',
            backgroundColor: 'var(--pp-surface)',
            color: 'var(--pp-red)',
          }}
        >
          Erreur lors du chargement des donnees : {(error as Error).message}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-6">
      {/* ---- Header ---- */}
      <div className="flex items-center gap-3">
        <ThermometerIcon className="h-6 w-6" style={{ color: "var(--pp-coral)" }} />
        <h1 className="text-2xl font-bold" style={{ color: "var(--pp-navy)" }}>
          Heatmap de risque
        </h1>
      </div>

      {/* ---- Toolbar ---- */}
      <div className="flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: "var(--pp-text-secondary)" }}>
            Periode :
          </span>
          <Select
            value={timeBucket}
            onValueChange={(v: string) => setTimeBucket(v as TimeBucket)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="week">Par semaine</SelectItem>
              <SelectItem value="day">Par jour</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-sm" style={{ color: "var(--pp-text-secondary)" }}>
            Grouper par :
          </span>
          <Select
            value={groupBy}
            onValueChange={(v: string) => setGroupBy(v as GroupBy)}
          >
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="client">Par article</SelectItem>
              <SelectItem value="priorite">Par priorite</SelectItem>
              <SelectItem value="statut">Par statut</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Legend */}
        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs" style={{ color: "var(--pp-text-secondary)" }}>
            Legende :
          </span>
          {[
            { label: '> 5j', color: 'var(--pp-green)' },
            { label: '2-5j', color: 'var(--pp-amber)' },
            { label: '0-1j', color: 'var(--pp-coral)' },
            { label: '< 0j', color: 'var(--pp-red)' },
            { label: 'Vide', color: '#E5E3DC' },
          ].map((item) => (
            <div key={item.label} className="flex items-center gap-1">
              <div
                className="h-3 w-3 rounded-sm"
                style={{ backgroundColor: item.color }}
              />
              <span className="text-xs" style={{ color: "var(--pp-text-secondary)" }}>
                {item.label}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* ---- Grid ---- */}
      <Card>
        <CardContent className="relative p-4">
          <HeatmapGrid
            nodes={nodes}
            margins={margins}
            timeBucket={timeBucket}
            groupBy={groupBy}
          />
        </CardContent>
      </Card>
    </div>
  );
}
