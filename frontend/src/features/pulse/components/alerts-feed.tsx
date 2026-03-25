import {
  Badge,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Spinner,
  cn,
} from '@fli-dgtf/flow-ui';
import { BellIcon, ShieldAlertIcon } from 'lucide-react';
import { useAchatAlertesQuery } from '@/providers/api/achat';

interface Alerte {
  id: number | string;
  severity: 'WARNING' | 'CRITICAL';
  message: string;
  nodeIds?: string[];
}

function SeverityBadge({ severity }: { severity: Alerte['severity'] }) {
  const isCritical = severity === 'CRITICAL';
  return (
    <Badge
      className={cn(
        'text-xs',
        isCritical
          ? 'bg-red-100 text-red-800'
          : 'bg-amber-100 text-amber-800',
      )}
    >
      {isCritical ? 'Critique' : 'Attention'}
    </Badge>
  );
}

export function AlertsFeed() {
  const { data, isLoading } = useAchatAlertesQuery();

  const alertes: Alerte[] = Array.isArray(data) ? data : [];

  return (
    <Card className="flex h-full flex-col">
      <CardHeader className="pb-3">
        <CardTitle
          className="flex items-center gap-2 text-base"
          style={{ color: 'var(--pp-navy)' }}
        >
          <BellIcon className="h-4 w-4" />
          Alertes
        </CardTitle>
      </CardHeader>
      <CardContent className="flex-1 overflow-auto pt-0">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <Spinner />
          </div>
        ) : alertes.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8">
            <ShieldAlertIcon
              className="h-8 w-8"
              style={{ color: 'var(--pp-green)' }}
            />
            <p
              className="text-sm"
              style={{ color: 'var(--pp-text-secondary)' }}
            >
              Aucune alerte active.
            </p>
          </div>
        ) : (
          <ul className="flex flex-col gap-3">
            {alertes.map((alerte) => (
              <li
                key={alerte.id}
                className="rounded-md border p-3"
                style={{
                  borderColor: 'var(--pp-border)',
                  backgroundColor: 'var(--pp-bg)',
                }}
              >
                <div className="mb-1 flex items-center gap-2">
                  <SeverityBadge severity={alerte.severity} />
                </div>
                <p className="text-sm" style={{ color: 'var(--pp-navy)' }}>
                  {alerte.message}
                </p>
                {alerte.nodeIds && alerte.nodeIds.length > 0 && (
                  <p
                    className="mt-1 font-mono text-xs"
                    style={{ color: 'var(--pp-text-secondary)' }}
                  >
                    Noeuds : {alerte.nodeIds.map((id) => id.slice(0, 8)).join(', ')}
                  </p>
                )}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
