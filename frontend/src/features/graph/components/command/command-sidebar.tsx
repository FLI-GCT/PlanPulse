import { useMemo, useState } from 'react';
import { Badge, cn } from '@fli-dgtf/flow-ui';
import { SearchIcon, AlertTriangleIcon, PackageIcon } from 'lucide-react';

import { useCommandesClientsQuery } from '@/providers/api/graph';
import { useGraphNavigation } from '../../hooks/use-graph-navigation';
import { getMarginColor, getMarginBg, getTensionLevel } from '../../utils/margin-color';
import { OfStatusBadge } from '@/components/shared/of-status-badge';
import { DateDisplay } from '@/components/shared/date-display';

interface CommandeClient {
  ofFinalId: string;
  clientNom: string;
  clientRef: string;
  articleLabel: string;
  dateDebut: string;
  dateFin: string;
  status: string;
  margin: number;
  alertCount: number;
  sousOfCount: number;
  achatCount: number;
}

const tensionLabels: Record<string, string> = {
  ok: 'OK',
  warning: 'Tendu',
  critical: 'Critique',
  late: 'En retard',
};

export function CommandSidebar() {
  const { data: rawData, isLoading } = useCommandesClientsQuery();
  const { graphNav, goToCommand } = useGraphNavigation();
  const [search, setSearch] = useState('');

  // L'API retourne { data: [...] } - extraire le tableau
  const commandes: CommandeClient[] = useMemo(() => {
    if (!rawData) return [];
    if (Array.isArray(rawData)) return rawData;
    if (rawData.data && Array.isArray(rawData.data)) return rawData.data;
    return [];
  }, [rawData]);

  const filtered = useMemo(() => {
    if (!search.trim()) return commandes;
    const lower = search.toLowerCase();
    return commandes.filter(
      (c) =>
        (c.clientNom ?? '').toLowerCase().includes(lower) ||
        (c.articleLabel ?? '').toLowerCase().includes(lower) ||
        c.ofFinalId.toLowerCase().includes(lower),
    );
  }, [commandes, search]);

  return (
    <aside
      className="flex w-[240px] shrink-0 flex-col border-r"
      style={{
        borderColor: 'var(--pp-border)',
        backgroundColor: 'var(--pp-surface)',
      }}
    >
      {/* Search */}
      <div className="p-3">
        <div
          className="flex items-center gap-2 rounded-lg border px-3 py-1.5"
          style={{
            borderColor: 'var(--pp-border)',
            backgroundColor: 'var(--pp-bg)',
          }}
        >
          <SearchIcon
            className="h-3.5 w-3.5 shrink-0"
            style={{ color: 'var(--pp-text-secondary)' }}
          />
          <input
            type="text"
            placeholder="Rechercher un client..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full border-none bg-transparent text-xs outline-none placeholder:text-gray-400"
            style={{ color: 'var(--pp-navy)' }}
          />
        </div>
      </div>

      {/* Header */}
      <div className="px-3 pb-2">
        <span
          className="text-[10px] font-semibold uppercase tracking-wider"
          style={{ color: 'var(--pp-text-secondary)' }}
        >
          Commandes clients ({filtered.length})
        </span>
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto px-2 pb-2">
        {isLoading && (
          <div
            className="py-6 text-center text-xs"
            style={{ color: 'var(--pp-text-secondary)' }}
          >
            Chargement...
          </div>
        )}

        {!isLoading && filtered.length === 0 && (
          <div
            className="py-6 text-center text-xs"
            style={{ color: 'var(--pp-text-secondary)' }}
          >
            Aucune commande trouvee
          </div>
        )}

        {filtered.map((cmd) => {
          const isSelected = graphNav.commandOfFinalId === cmd.ofFinalId;
          const margin = cmd.margin ?? 0;
          const tension = getTensionLevel(margin);

          return (
            <button
              key={cmd.ofFinalId}
              onClick={() => goToCommand(cmd.ofFinalId, cmd.clientNom ?? cmd.ofFinalId)}
              className={cn(
                'mb-1 w-full cursor-pointer rounded-lg border-l-4 p-2.5 text-left transition-colors',
                isSelected ? 'border-l-4' : 'border-l-transparent',
              )}
              style={{
                backgroundColor: isSelected ? 'var(--pp-bg)' : 'transparent',
                borderLeftColor: isSelected ? 'var(--pp-blue)' : 'transparent',
              }}
            >
              {/* Client name */}
              <div className="flex items-center justify-between">
                <span
                  className="truncate text-xs font-semibold"
                  style={{ color: 'var(--pp-navy)' }}
                >
                  {cmd.clientNom ?? cmd.ofFinalId}
                </span>
                {cmd.alertCount > 0 && (
                  <span className="flex items-center gap-0.5">
                    <AlertTriangleIcon
                      className="h-3 w-3"
                      style={{ color: 'var(--pp-amber)' }}
                    />
                    <span
                      className="text-[10px] font-semibold"
                      style={{ color: 'var(--pp-amber)' }}
                    >
                      {cmd.alertCount}
                    </span>
                  </span>
                )}
              </div>

              {/* Article label */}
              <div className="mt-0.5 flex items-center gap-1">
                <PackageIcon
                  className="h-3 w-3 shrink-0"
                  style={{ color: 'var(--pp-text-secondary)' }}
                />
                <span
                  className="truncate text-[10px]"
                  style={{ color: 'var(--pp-text-secondary)' }}
                >
                  {cmd.articleLabel}
                </span>
              </div>

              {/* Dates */}
              <div
                className="mt-1 flex items-center gap-1 text-[10px]"
                style={{ color: 'var(--pp-text-secondary)' }}
              >
                <DateDisplay date={cmd.dateDebut} />
                <span>-</span>
                <DateDisplay date={cmd.dateFin} />
              </div>

              {/* Footer: status + margin */}
              <div className="mt-1.5 flex items-center gap-1.5">
                <OfStatusBadge statut={cmd.status} />
                <Badge
                  className="text-[10px]"
                  style={{
                    backgroundColor: getMarginBg(margin),
                    color: getMarginColor(margin),
                    borderColor: 'transparent',
                  }}
                >
                  {tensionLabels[tension]}
                </Badge>
              </div>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
