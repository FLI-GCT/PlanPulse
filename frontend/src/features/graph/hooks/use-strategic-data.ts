import { useStrategicQuery } from '@/providers/api/graph';
import { useUiStore } from '@/providers/state/ui-store';

export function useStrategicData() {
  const groupBy = useUiStore((s) => s.graphNav.strategicGroupBy);
  const query = useStrategicQuery(groupBy);
  return { ...query, groupBy };
}
