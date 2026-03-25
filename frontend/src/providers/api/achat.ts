import { useQuery } from '@tanstack/react-query';
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
