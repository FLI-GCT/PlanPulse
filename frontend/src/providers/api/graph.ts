import { useQuery } from '@tanstack/react-query';
import { fetcher } from './fetcher';

export const graphKeys = {
  all: ['graph'] as const,
  full: () => [...graphKeys.all, 'full'] as const,
  criticalPath: () => [...graphKeys.all, 'critical-path'] as const,
  impactZone: (nodeId: string) =>
    [...graphKeys.all, 'impact-zone', nodeId] as const,
};

export const useGraphQuery = () =>
  useQuery({
    queryKey: graphKeys.full(),
    queryFn: () => fetcher.get('/graph').then((r) => r.data),
    staleTime: Infinity, // WebSocket handles updates
  });

export const useCriticalPathQuery = () =>
  useQuery({
    queryKey: graphKeys.criticalPath(),
    queryFn: () => fetcher.get('/graph/critical-path').then((r) => r.data),
  });

export const useImpactZoneQuery = (nodeId: string | null) =>
  useQuery({
    queryKey: graphKeys.impactZone(nodeId!),
    queryFn: () =>
      fetcher.get(`/graph/impact-zone/${nodeId}`).then((r) => r.data),
    enabled: !!nodeId,
  });
