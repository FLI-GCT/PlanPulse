import { useCallback, useMemo } from 'react';
import { addWeeks } from 'date-fns';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@fli-dgtf/flow-ui';
import {
  ZoomInIcon,
  RouteIcon,
  FilterIcon,
} from 'lucide-react';
import { useUiStore } from '@/providers/state/ui-store';
import { useGraphStore } from '@/providers/state/graph-store';

// ---------------------------------------------------------------------------
// Zoom presets
// ---------------------------------------------------------------------------

interface ZoomPreset {
  label: string;
  weeks: number;
}

const ZOOM_PRESETS: ZoomPreset[] = [
  { label: '1 sem', weeks: 1 },
  { label: '2 sem', weeks: 2 },
  { label: '4 sem', weeks: 4 },
  { label: '6 sem', weeks: 6 },
];

// ---------------------------------------------------------------------------
// Status options
// ---------------------------------------------------------------------------

const STATUT_OPTIONS = [
  { value: '__all__', label: 'Tous les statuts' },
  { value: 'PLANIFIE', label: 'Planifie' },
  { value: 'EN_COURS', label: 'En cours' },
  { value: 'TERMINE', label: 'Termine' },
  { value: 'EN_RETARD', label: 'En retard' },
  { value: 'ANNULE', label: 'Annule' },
];

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function GanttToolbar() {
  const filters = useUiStore((s) => s.filters);
  const setFilters = useUiStore((s) => s.setFilters);
  const ganttZoom = useUiStore((s) => s.ganttZoom);
  const setGanttZoom = useUiStore((s) => s.setGanttZoom);
  const criticalPath = useGraphStore((s) => s.criticalPath);

  // Determine current zoom level in weeks
  const currentWeeks = useMemo(() => {
    const start = new Date(ganttZoom.startDate);
    const end = new Date(ganttZoom.endDate);
    const diffMs = end.getTime() - start.getTime();
    const diffWeeks = Math.round(diffMs / (7 * 24 * 60 * 60 * 1000));
    return diffWeeks;
  }, [ganttZoom]);

  // Is critical path filter active?
  const isCriticalFilterActive = filters.statuts.includes('__critical__');

  const handleZoomPreset = useCallback(
    (weeks: number) => {
      const now = new Date();
      setGanttZoom({
        startDate: now.toISOString(),
        endDate: addWeeks(now, weeks).toISOString(),
      });
    },
    [setGanttZoom],
  );

  const handleStatutChange = useCallback(
    (value: string) => {
      if (value === '__all__') {
        // Clear statut filters (but keep critical filter if active)
        setFilters({
          statuts: isCriticalFilterActive ? ['__critical__'] : [],
        });
      } else {
        // Set single statut filter (preserve critical filter)
        const newStatuts = isCriticalFilterActive
          ? ['__critical__', value]
          : [value];
        setFilters({ statuts: newStatuts });
      }
    },
    [setFilters, isCriticalFilterActive],
  );

  const handleToggleCritical = useCallback(() => {
    if (isCriticalFilterActive) {
      // Remove critical flag
      setFilters({
        statuts: filters.statuts.filter((s) => s !== '__critical__'),
      });
    } else {
      // Add critical flag
      setFilters({
        statuts: [...filters.statuts, '__critical__'],
      });
    }
  }, [setFilters, filters.statuts, isCriticalFilterActive]);

  // Current statut filter value (excluding __critical__)
  const currentStatut = useMemo(() => {
    const real = filters.statuts.filter((s) => s !== '__critical__');
    return real.length === 1 ? real[0] : '__all__';
  }, [filters.statuts]);

  return (
    <div
      className="flex flex-wrap items-center gap-3 rounded-lg border px-4 py-2.5"
      style={{
        backgroundColor: 'var(--pp-surface)',
        borderColor: 'var(--pp-border)',
      }}
    >
      {/* ---- Zoom presets ---- */}
      <div className="flex items-center gap-1.5">
        <ZoomInIcon
          className="mr-1 h-4 w-4"
          style={{ color: 'var(--pp-text-secondary)' }}
        />
        {ZOOM_PRESETS.map((preset) => (
          <Button
            key={preset.weeks}
            size="sm"
            variant={currentWeeks === preset.weeks ? 'default' : 'outline'}
            onClick={() => handleZoomPreset(preset.weeks)}
          >
            {preset.label}
          </Button>
        ))}
      </div>

      {/* Separator */}
      <div
        className="mx-1 h-6 w-px"
        style={{ backgroundColor: 'var(--pp-border)' }}
      />

      {/* ---- Statut filter ---- */}
      <div className="flex items-center gap-2">
        <FilterIcon
          className="h-4 w-4"
          style={{ color: 'var(--pp-text-secondary)' }}
        />
        <Select value={currentStatut} onValueChange={handleStatutChange}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Statut" />
          </SelectTrigger>
          <SelectContent>
            {STATUT_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {/* Separator */}
      <div
        className="mx-1 h-6 w-px"
        style={{ backgroundColor: 'var(--pp-border)' }}
      />

      {/* ---- Critical path toggle ---- */}
      <Button
        size="sm"
        variant={isCriticalFilterActive ? 'default' : 'outline'}
        onClick={handleToggleCritical}
        className={cn(
          isCriticalFilterActive && 'ring-2',
        )}
        style={
          isCriticalFilterActive
            ? { backgroundColor: 'var(--pp-red)', borderColor: 'var(--pp-red)' }
            : undefined
        }
      >
        <RouteIcon className="mr-1.5 h-3.5 w-3.5" />
        Chemin critique
        {criticalPath.length > 0 && (
          <span className="ml-1 tabular-nums">({criticalPath.length})</span>
        )}
      </Button>
    </div>
  );
}
