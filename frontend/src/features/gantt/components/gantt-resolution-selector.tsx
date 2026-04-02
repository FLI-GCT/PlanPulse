import { Button } from '@fli-dgtf/flow-ui';
import { FactoryIcon, PackageIcon, ListIcon } from 'lucide-react';
import { useUiStore } from '@/providers/state/ui-store';
import type { GanttResolution } from '@/providers/state/ui-store';

const RESOLUTIONS: Array<{
  value: GanttResolution;
  label: string;
  icon: typeof FactoryIcon;
}> = [
  { value: 'macro', label: 'Macro', icon: FactoryIcon },
  { value: 'segment', label: 'Segment', icon: PackageIcon },
  { value: 'of', label: 'OF', icon: ListIcon },
];

export function GanttResolutionSelector() {
  const ganttResolution = useUiStore((s) => s.ganttResolution);
  const setGanttResolution = useUiStore((s) => s.setGanttResolution);

  return (
    <div className="flex items-center gap-1">
      {RESOLUTIONS.map((res) => {
        const Icon = res.icon;
        const isActive = ganttResolution === res.value;
        return (
          <Button
            key={res.value}
            size="sm"
            variant={isActive ? 'default' : 'outline'}
            onClick={() => setGanttResolution(res.value)}
            style={
              isActive
                ? {
                    backgroundColor: 'var(--pp-blue)',
                    borderColor: 'var(--pp-blue)',
                  }
                : undefined
            }
          >
            <Icon className="mr-1 h-3.5 w-3.5" />
            {res.label}
          </Button>
        );
      })}
    </div>
  );
}
