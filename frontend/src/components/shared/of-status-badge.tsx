import { Badge } from '@fli-dgtf/flow-ui';
import { cn } from '@fli-dgtf/flow-ui';

const statusConfig: Record<string, { label: string; className: string }> = {
  PLANIFIE: { label: 'Planifie', className: 'bg-blue-100 text-blue-800' },
  EN_COURS: { label: 'En cours', className: 'bg-amber-100 text-amber-800' },
  TERMINE: { label: 'Termine', className: 'bg-green-100 text-green-800' },
  EN_RETARD: { label: 'En retard', className: 'bg-red-100 text-red-800' },
  ANNULE: { label: 'Annule', className: 'bg-gray-100 text-gray-500' },
  COMMANDE: { label: 'Commande', className: 'bg-blue-100 text-blue-800' },
  EN_TRANSIT: {
    label: 'En transit',
    className: 'bg-purple-100 text-purple-800',
  },
  RECEPTIONNE: {
    label: 'Receptionne',
    className: 'bg-green-100 text-green-800',
  },
};

export function OfStatusBadge({ statut }: { statut: string }) {
  const config = statusConfig[statut] ?? {
    label: statut,
    className: 'bg-gray-100 text-gray-600',
  };
  return (
    <Badge className={cn('text-xs', config.className)}>{config.label}</Badge>
  );
}
