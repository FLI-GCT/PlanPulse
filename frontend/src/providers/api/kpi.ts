import { useQuery } from '@tanstack/react-query';
import { fetcher } from './fetcher';

export const kpiKeys = {
  all: ['kpi'] as const,
  summary: () => [...kpiKeys.all, 'summary'] as const,
};

export const useKpiQuery = () =>
  useQuery({
    queryKey: kpiKeys.summary(),
    queryFn: () => fetcher.get('/kpi').then((r) => r.data),
    refetchInterval: 30000, // Fallback polling every 30s
  });

export const useKpiTrendQuery = (days = 7) =>
  useQuery({
    queryKey: [...kpiKeys.all, 'trend', days],
    queryFn: () => fetcher.get(`/kpi/trend?days=${days}`).then((r) => r.data),
    refetchInterval: 60000,
  });

export const useRootCausesQuery = () =>
  useQuery({
    queryKey: ['alert', 'root-causes'],
    queryFn: () => fetcher.get('/alert/root-causes').then((r) => r.data),
    refetchInterval: 30000,
  });
