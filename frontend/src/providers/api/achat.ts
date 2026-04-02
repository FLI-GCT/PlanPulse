import { useQuery, useMutation } from '@tanstack/react-query';
import { fetcher } from './fetcher';

export const achatKeys = {
  all: ['achat'] as const,
  list: (params?: Record<string, unknown>) =>
    [...achatKeys.all, 'list', params] as const,
  detail: (id: string) => [...achatKeys.all, 'detail', id] as const,
  alertes: () => [...achatKeys.all, 'alertes'] as const,
};

export const useAchatsQuery = (params?: {
  page?: number;
  pageSize?: number;
  statut?: string;
}) =>
  useQuery({
    queryKey: achatKeys.list(params),
    queryFn: () => fetcher.get('/achat', { params }).then((r) => r.data),
  });

export const useAchatAlertesQuery = () =>
  useQuery({
    queryKey: achatKeys.alertes(),
    queryFn: () => fetcher.get('/achat/alertes').then((r) => r.data),
  });

export interface SupplierRisk {
  name: string;
  totalAchats: number;
  achatsEnRetard: number;
  penuriesActives: number;
  dependentOfIds: string[];
  dependentCommandCount: number;
  riskScore: number;
}

export const useFournisseursRiskQuery = () =>
  useQuery<{ suppliers: SupplierRisk[] }>({
    queryKey: [...achatKeys.all, 'fournisseurs-risk'],
    queryFn: () =>
      fetcher.get('/achat/fournisseurs-risk').then((r) => r.data),
  });

export const useBulkMovePreviewMutation = () =>
  useMutation({
    mutationFn: (data: { ofIds: string[]; deltaJours: number }) =>
      fetcher.post('/of/bulk-move-preview', data).then((r) => r.data),
  });
