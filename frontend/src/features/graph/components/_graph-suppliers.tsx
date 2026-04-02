import { useState } from 'react';
import { Spinner } from '@fli-dgtf/flow-ui';
import { TruckIcon, AlertTriangleIcon } from 'lucide-react';
import {
  useFournisseursRiskQuery,
  type SupplierRisk,
} from '@/providers/api/achat';
import { SupplierDetailPanel } from './_graph-supplier-detail';

function riskColor(supplier: SupplierRisk): string {
  const ratio = supplier.achatsEnRetard / Math.max(supplier.totalAchats, 1);
  if (ratio > 0.5 || supplier.penuriesActives > 0) return 'var(--pp-red)';
  if (ratio > 0.2) return 'var(--pp-amber)';
  return 'var(--pp-green)';
}

export function SuppliersView() {
  const { data, isLoading } = useFournisseursRiskQuery();
  const [selectedSupplier, setSelectedSupplier] =
    useState<SupplierRisk | null>(null);

  if (isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Spinner />
      </div>
    );
  }

  const suppliers = data?.suppliers ?? [];
  const maxDeps = Math.max(1, ...suppliers.map((s) => s.dependentOfIds.length));

  return (
    <>
      <div className="flex flex-1 flex-col gap-1 overflow-y-auto px-6 py-4">
        {suppliers.length === 0 && (
          <p
            className="py-8 text-center text-sm"
            style={{ color: 'var(--pp-text-secondary)' }}
          >
            Aucun fournisseur trouve.
          </p>
        )}

        {suppliers.map((supplier) => {
          const barWidth =
            (supplier.dependentOfIds.length / maxDeps) * 100;
          const color = riskColor(supplier);

          return (
            <button
              key={supplier.name}
              type="button"
              onClick={() => setSelectedSupplier(supplier)}
              className="flex items-center gap-4 rounded-lg border px-4 py-3 text-left transition-colors hover:bg-[var(--pp-bg)]"
              style={{ borderColor: 'var(--pp-border)' }}
            >
              {/* Icon */}
              <TruckIcon
                className="h-5 w-5 shrink-0"
                style={{ color }}
              />

              {/* Name + bar */}
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <span
                  className="truncate text-sm font-bold"
                  style={{ color: 'var(--pp-navy)' }}
                >
                  {supplier.name}
                </span>
                <div
                  className="h-2 rounded-full"
                  style={{ backgroundColor: 'var(--pp-border)' }}
                >
                  <div
                    className="h-full rounded-full transition-all"
                    style={{
                      width: `${barWidth}%`,
                      backgroundColor: color,
                    }}
                  />
                </div>
              </div>

              {/* Stats */}
              <div
                className="flex shrink-0 items-center gap-2 text-xs tabular-nums"
                style={{ color: 'var(--pp-text-secondary)' }}
              >
                <span>{supplier.dependentOfIds.length} OF</span>
                <span className="text-[var(--pp-border)]">·</span>
                <span
                  style={{
                    color:
                      supplier.achatsEnRetard > 0
                        ? 'var(--pp-red)'
                        : undefined,
                  }}
                >
                  {supplier.achatsEnRetard} retard
                  {supplier.achatsEnRetard !== 1 ? 's' : ''}
                </span>
                {supplier.penuriesActives > 0 && (
                  <>
                    <span className="text-[var(--pp-border)]">·</span>
                    <span className="flex items-center gap-0.5">
                      <AlertTriangleIcon className="h-3 w-3 text-[var(--pp-red)]" />
                      {supplier.penuriesActives} penurie
                      {supplier.penuriesActives !== 1 ? 's' : ''}
                    </span>
                  </>
                )}
              </div>

              {/* Risk score */}
              <div
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
                style={{ backgroundColor: color }}
              >
                {supplier.riskScore}
              </div>
            </button>
          );
        })}
      </div>

      {selectedSupplier && (
        <SupplierDetailPanel
          supplier={selectedSupplier}
          onClose={() => setSelectedSupplier(null)}
        />
      )}
    </>
  );
}
