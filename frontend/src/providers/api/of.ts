import { useQuery, useMutation } from '@tanstack/react-query';
import { fetcher } from './fetcher';

export const ofKeys = {
  all: ['of'] as const,
  list: (params?: Record<string, unknown>) =>
    [...ofKeys.all, 'list', params] as const,
  detail: (id: string) => [...ofKeys.all, 'detail', id] as const,
};

export const useOfsQuery = (params?: {
  page?: number;
  pageSize?: number;
  statut?: string;
  client?: string;
}) =>
  useQuery({
    queryKey: ofKeys.list(params),
    queryFn: () => fetcher.get('/of', { params }).then((r) => r.data),
  });

export const useOfQuery = (id: string) =>
  useQuery({
    queryKey: ofKeys.detail(id),
    queryFn: () => fetcher.get(`/of/${id}`).then((r) => r.data),
    enabled: !!id,
  });

export const useMoveOfMutation = () =>
  useMutation({
    mutationFn: ({
      id,
      newDateDebut,
    }: {
      id: string;
      newDateDebut: string;
    }) =>
      fetcher.patch(`/of/${id}/move`, { newDateDebut }).then((r) => r.data),
  });

export const useBulkMoveMutation = () =>
  useMutation({
    mutationFn: (body: { ofIds: string[]; deltaJours: number }) =>
      fetcher
        .post<{ movedCount: number; impactedCount: number }>(
          '/of/bulk-move',
          body,
        )
        .then((r) => r.data),
  });

export const useBulkMovePreviewMutation = () =>
  useMutation({
    mutationFn: (body: { ofIds: string[]; deltaJours: number }) =>
      fetcher
        .post<{ affectedNodes: unknown[]; impactedCommandCount: number }>(
          '/of/bulk-move-preview',
          body,
        )
        .then((r) => r.data),
  });

export const useBulkBlockMutation = () =>
  useMutation({
    mutationFn: (body: { ofIds: string[] }) =>
      fetcher
        .post<{ blockedCount: number }>('/of/bulk-block', body)
        .then((r) => r.data),
  });
