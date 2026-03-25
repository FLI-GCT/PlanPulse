import {
  Tabs,
  TabsList,
  TabsTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@fli-dgtf/flow-ui';
import { CircleIcon, WavesIcon } from 'lucide-react';
import { useUiStore, type StrategicGroupBy, type StrategicVariant } from '@/providers/state/ui-store';

const GROUP_BY_OPTIONS: Array<{ value: StrategicGroupBy; label: string }> = [
  { value: 'client', label: 'Par client' },
  { value: 'semaine', label: 'Par semaine' },
  { value: 'article', label: 'Par article' },
  { value: 'priorite', label: 'Par priorite' },
];

const LEGEND_ITEMS = [
  { label: 'OK', color: 'var(--pp-green)' },
  { label: 'Attention', color: 'var(--pp-amber)' },
  { label: 'Critique', color: 'var(--pp-red)' },
];

export function StrategicToolbar() {
  const variant = useUiStore((s) => s.graphNav.strategicVariant);
  const groupBy = useUiStore((s) => s.graphNav.strategicGroupBy);
  const setGraphNav = useUiStore((s) => s.setGraphNav);

  const handleVariantChange = (value: string) => {
    setGraphNav({ strategicVariant: value as StrategicVariant });
  };

  const handleGroupByChange = (value: string) => {
    setGraphNav({ strategicGroupBy: value as StrategicGroupBy });
  };

  return (
    <div
      className="flex flex-wrap items-center gap-4 rounded-lg border px-4 py-2.5"
      style={{
        backgroundColor: 'var(--pp-surface)',
        borderColor: 'var(--pp-border)',
      }}
    >
      {/* Variant tabs */}
      <Tabs value={variant} onValueChange={handleVariantChange}>
        <TabsList>
          <TabsTrigger value="bubbles">
            <CircleIcon className="mr-1.5 h-3.5 w-3.5" />
            Bulles
          </TabsTrigger>
          <TabsTrigger value="flows">
            <WavesIcon className="mr-1.5 h-3.5 w-3.5" />
            Flux
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Separator */}
      <div
        className="mx-1 h-6 w-px"
        style={{ backgroundColor: 'var(--pp-border)' }}
      />

      {/* GroupBy selector (only for bubbles variant) */}
      {variant === 'bubbles' && (
        <div className="flex items-center gap-2">
          <span
            className="text-sm"
            style={{ color: 'var(--pp-text-secondary)' }}
          >
            Grouper :
          </span>
          <Select value={groupBy} onValueChange={handleGroupByChange}>
            <SelectTrigger className="w-[150px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {GROUP_BY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Legend */}
      <div className="ml-auto flex items-center gap-3">
        <span
          className="text-xs"
          style={{ color: 'var(--pp-text-secondary)' }}
        >
          Legende :
        </span>
        {LEGEND_ITEMS.map((item) => (
          <div key={item.label} className="flex items-center gap-1">
            <div
              className="h-3 w-3 rounded-full"
              style={{ backgroundColor: item.color }}
            />
            <span
              className="text-xs"
              style={{ color: 'var(--pp-text-secondary)' }}
            >
              {item.label}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
