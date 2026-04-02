import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { fetcher } from './fetcher';

const scenarioKeys = {
  all: ['scenario'] as const,
  list: () => [...scenarioKeys.all, 'list'] as const,
  detail: (id: string) => [...scenarioKeys.all, 'detail', id] as const,
  kpi: (id: string) => [...scenarioKeys.all, 'kpi', id] as const,
};

export const useScenariosQuery = () =>
  useQuery({
    queryKey: scenarioKeys.list(),
    queryFn: () => fetcher.get('/scenario').then((r) => r.data),
  });

export const useScenarioKpiQuery = (id: string | null) =>
  useQuery({
    queryKey: scenarioKeys.kpi(id!),
    queryFn: () => fetcher.get(`/scenario/${id}/kpi`).then((r) => r.data),
    enabled: !!id,
  });

export const useCreateScenarioMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (nom?: string) =>
      fetcher.post('/scenario', { nom }).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: scenarioKeys.list() }),
  });
};

export const useApplyActionMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      action,
    }: {
      id: string;
      action: Record<string, unknown>;
    }) => fetcher.patch(`/scenario/${id}/apply-action`, action).then((r) => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: scenarioKeys.kpi(vars.id) });
    },
  });
};

export const useCommitScenarioMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetcher.post(`/scenario/${id}/commit`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: scenarioKeys.list() }),
  });
};

export const useDeleteScenarioMutation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      fetcher.delete(`/scenario/${id}`).then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: scenarioKeys.list() }),
  });
};
