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
