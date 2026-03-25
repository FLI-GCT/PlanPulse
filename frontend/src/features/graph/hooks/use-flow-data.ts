import { useFlowsQuery } from '@/providers/api/graph';

export function useFlowData() {
  return useFlowsQuery();
}
