import { useNavigate } from '@tanstack/react-router';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
} from '@fli-dgtf/flow-ui';
import { ShieldAlertIcon, ChevronRightIcon } from 'lucide-react';
import { useRootCausesQuery } from '@/providers/api/kpi';

interface RootCauseGroup {
  id: string;
  type: string;
  label: string;
  relatedEntityId: string;
  relatedEntityType: string;
  alertCount: number;
  affectedOfIds: string[];
  affectedCommandCount: number;
  severity: 'critical' | 'warning' | 'info';
}

function severityDotColor(severity: string): string {
  switch (severity) {
    case 'critical':
      return 'var(--pp-red)';
    case 'warning':
      return 'var(--pp-amber)';
    default:
      return 'var(--pp-text-secondary)';
  }
}

export function PulseRootCausePanel() {
  const { data, isLoading } = useRootCausesQuery();
  const navigate = useNavigate();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <ShieldAlertIcon
            className="h-4 w-4"
            style={{ color: 'var(--pp-coral)' }}
          />
          Causes racines
        </CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading && (
          <div className="flex items-center justify-center py-6">
            <Spinner />
          </div>
        )}

        {!isLoading && (!data?.groups || data.groups.length === 0) && (
          <p
            className="py-6 text-center text-sm"
            style={{ color: 'var(--pp-text-secondary)' }}
          >
            Aucune cause racine detectee
          </p>
        )}

        {!isLoading && data?.groups && data.groups.length > 0 && (
          <div className="flex flex-col gap-2">
            {(data.groups as RootCauseGroup[]).slice(0, 5).map((group) => (
              <button
                key={group.id}
                onClick={() => navigate({ to: '/gantt' } as never)}
                className="flex items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-gray-50"
                style={{ borderColor: 'var(--pp-border)' }}
              >
                {/* Severity dot */}
                <span
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: severityDotColor(group.severity) }}
                />

                {/* Content */}
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium">
                    {group.label.length > 60
                      ? `${group.label.slice(0, 60)}...`
                      : group.label}
                  </div>
                  <div
                    className="text-xs"
                    style={{ color: 'var(--pp-text-secondary)' }}
                  >
                    &rarr; {group.affectedCommandCount} commandes impactees
                  </div>
                </div>

                {/* OF count */}
                <span
                  className="shrink-0 text-sm font-semibold tabular-nums"
                  style={{ color: 'var(--pp-navy)' }}
                >
                  {group.affectedOfIds.length} OF
                </span>

                <ChevronRightIcon
                  className="h-4 w-4 shrink-0"
                  style={{ color: 'var(--pp-text-secondary)' }}
                />
              </button>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
