import { useQuery, useMutation } from '@tanstack/react-query';
import { fetcher } from './fetcher';
import type { StrategicGroupBy } from '@/providers/state/ui-store';

// ── Types ─────────────────────────────────────────────────────────
export interface StrategicGroup {
  id: string;
  label: string;
  ofCount: number;
  avgMargin: number;
  minMargin: number;
  alertCount: number;
  hasCriticalPath: boolean;
  ofIds: string[];
  temporalCenter: string; // ISO date
}

export interface StrategicLink {
  sourceGroupId: string;
  targetGroupId: string;
  sharedDependencyCount: number;
  hasDelayedDependency: boolean;
}

export interface StrategicData {
  groups: StrategicGroup[];
  links: StrategicLink[];
}

export interface FlowWaypoint {
  id: string;
  type: 'achat' | 'sous_of' | 'assemblage' | 'jalon';
  label: string;
  date: string; // ISO date
  margin: number;
  status: string;
}

export interface Flow {
  clientName: string;
  clientRef: string;
  ofFinalId: string;
  componentCount: number;
  tension: number;
  margin: number;
  waypoints: FlowWaypoint[];
}

export interface SharedPurchase {
  achatId: string;
  articleLabel: string;
  status: string;
  flowsConnected: string[]; // ofFinalId[]
  isDelayed: boolean;
  isPenury: boolean;
}

export interface FlowsData {
  flows: Flow[];
  sharedPurchases: SharedPurchase[];
}

// ── Query keys ────────────────────────────────────────────────────
export const graphKeys = {
  all: ['graph'] as const,
  full: () => [...graphKeys.all, 'full'] as const,
  criticalPath: () => [...graphKeys.all, 'critical-path'] as const,
  impactZone: (nodeId: string) =>
    [...graphKeys.all, 'impact-zone', nodeId] as const,
  subgraph: (rootId: string | null, depth: number, direction: string) =>
    [...graphKeys.all, 'subgraph', rootId, depth, direction] as const,
  commandesClients: () =>
    [...graphKeys.all, 'commandes-clients'] as const,
  strategic: (groupBy: StrategicGroupBy) =>
    [...graphKeys.all, 'strategic', groupBy] as const,
  flows: () => [...graphKeys.all, 'flows'] as const,
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

export const useStrategicQuery = (groupBy: StrategicGroupBy) =>
  useQuery<StrategicData>({
    queryKey: graphKeys.strategic(groupBy),
    queryFn: () =>
      fetcher
        .get('/graph/strategic', { params: { groupBy } })
        .then((r) => r.data),
  });

export const useFlowsQuery = () =>
  useQuery<FlowsData>({
    queryKey: graphKeys.flows(),
    queryFn: () => fetcher.get('/graph/flows').then((r) => r.data),
  });

export const useSubgraphQuery = (
  rootId: string | null,
  depth = 3,
  direction = 'both',
) =>
  useQuery({
    queryKey: graphKeys.subgraph(rootId, depth, direction),
    queryFn: () =>
      fetcher
        .get('/graph/subgraph', { params: { rootId, depth, direction } })
        .then((r) => r.data),
    enabled: !!rootId,
  });

export const useCommandesClientsQuery = () =>
  useQuery({
    queryKey: graphKeys.commandesClients(),
    queryFn: () =>
      fetcher.get('/of/commandes-clients').then((r) => r.data),
  });

export const useQuestionMutation = () =>
  useMutation({
    mutationFn: (data: {
      type: string;
      targetId?: string;
      params?: Record<string, unknown>;
    }) => fetcher.post('/graph/question', data).then((r) => r.data),
  });
