import { useMemo } from 'react';
import { useNavigate } from '@tanstack/react-router';
import { Card, CardContent, CardHeader, CardTitle } from '@fli-dgtf/flow-ui';
import { CalendarIcon } from 'lucide-react';
import {
  getISOWeek,
  startOfISOWeek,
  addWeeks,
  isWithinInterval,
  parseISO,
  endOfISOWeek,
} from 'date-fns';
import { useGraphStore } from '@/providers/state/graph-store';

interface WeekCell {
  label: string;
  weekNumber: number;
  start: Date;
  end: Date;
  isCurrent: boolean;
  problematicCount: number;
  hasEnRetard: boolean;
}

function getWeekColor(cell: WeekCell): string {
  if (cell.hasEnRetard || cell.problematicCount > 5) return 'var(--pp-red)';
  if (cell.problematicCount >= 2) return 'var(--pp-amber)';
  return 'var(--pp-green)';
}

export function PulseRiskTimeline() {
  const nodes = useGraphStore((s) => s.nodes);
  const margins = useGraphStore((s) => s.margins);
  const navigate = useNavigate();

  const weeks = useMemo(() => {
    const now = new Date();
    const currentWeekStart = startOfISOWeek(now);

    const marginMap = new Map(margins.map((m) => [m.nodeId, m]));

    const result: WeekCell[] = [];

    for (let i = 0; i < 8; i++) {
      const weekStart = addWeeks(currentWeekStart, i);
      const weekEnd = endOfISOWeek(weekStart);
      const weekNum = getISOWeek(weekStart);
      const label = `S${weekNum}`;

      let problematicCount = 0;
      let hasEnRetard = false;

      for (const node of nodes) {
        if (!node.dateFin) continue;

        const dateFin = parseISO(node.dateFin);
        const inWeek = isWithinInterval(dateFin, {
          start: weekStart,
          end: weekEnd,
        });

        if (!inWeek) continue;

        const margin = marginMap.get(node.id);
        if (margin && margin.floatTotal <= 1) {
          problematicCount++;
        }

        if (node.statut === 'EN_RETARD') {
          hasEnRetard = true;
        }
      }

      result.push({
        label,
        weekNumber: weekNum,
        start: weekStart,
        end: weekEnd,
        isCurrent: i === 0,
        problematicCount,
        hasEnRetard,
      });
    }

    return result;
  }, [nodes, margins]);

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <CalendarIcon
            className="h-4 w-4"
            style={{ color: 'var(--pp-navy)' }}
          />
          Horizon 8 semaines
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex gap-2 overflow-x-auto">
          {weeks.map((week) => {
            const bgColor = getWeekColor(week);
            return (
              <button
                key={week.label}
                onClick={() =>
                  navigate({
                    to: '/gantt',
                    search: { semaine: week.label },
                  } as never)
                }
                className="flex min-w-[100px] flex-col items-center rounded-lg px-3 py-3 text-white transition-opacity hover:opacity-80"
                style={{ backgroundColor: bgColor }}
              >
                <span className="text-xs font-medium opacity-80">
                  {week.isCurrent ? 'Auj.' : ''}
                </span>
                <span className="text-lg font-bold">{week.label}</span>
                {week.problematicCount > 0 && (
                  <span className="text-xs font-medium">
                    {week.problematicCount} OF
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
