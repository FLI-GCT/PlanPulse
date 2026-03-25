import { createStore } from 'zustand/vanilla';
import { immer } from 'zustand/middleware/immer';
import { useStore } from 'zustand';

export interface GraphNode {
  id: string;
  type: 'of' | 'achat';
  label: string;
  articleId: string | null;
  dateDebut: string;
  dateFin: string;
  statut: string;
  priorite: number | null;
  quantite: number;
}

export interface GraphEdge {
  sourceId: string;
  sourceType: string;
  targetId: string;
  targetType: string;
  typeLien: string;
  quantite: number | null;
  delaiMinimum: number;
}

export interface MarginResult {
  nodeId: string;
  earlyStart: string;
  earlyFinish: string;
  lateStart: string;
  lateFinish: string;
  floatTotal: number;
  floatLibre: number;
  estCritique: boolean;
}

export interface PropagationResult {
  nodeId: string;
  oldDateDebut: string;
  newDateDebut: string;
  oldDateFin: string;
  newDateFin: string;
  deltaJours: number;
}

export interface GraphKpis {
  totalOfs: number;
  totalAchats: number;
  totalAretes: number;
  ofsEnRetard: number;
  ofsCritiques: number;
  tauxCritique: number;
}

interface GraphState {
  nodes: GraphNode[];
  edges: GraphEdge[];
  criticalPath: string[];
  margins: MarginResult[];
  kpis: GraphKpis | null;
  alerts: unknown[];
  propagationPreview: PropagationResult[] | null;
  isLoaded: boolean;
}

interface GraphActions {
  hydrateFromServer: (data: {
    nodes: GraphNode[];
    edges: GraphEdge[];
    criticalPath: string[];
    margins: MarginResult[];
    kpis: GraphKpis;
  }) => void;
  applyPreview: (preview: PropagationResult[]) => void;
  clearPreview: () => void;
  updateCriticalPath: (criticalNodes: string[]) => void;
  updateKpis: (kpis: GraphKpis) => void;
  addAlert: (alert: unknown) => void;
  removeAlert: (alertId: number) => void;
}

export const graphStore = createStore<GraphState & GraphActions>()(
  immer((set) => ({
    nodes: [],
    edges: [],
    criticalPath: [],
    margins: [],
    kpis: null,
    alerts: [],
    propagationPreview: null,
    isLoaded: false,

    hydrateFromServer: (data) =>
      set((state) => {
        state.nodes = data.nodes;
        state.edges = data.edges;
        state.criticalPath = data.criticalPath;
        state.margins = data.margins;
        state.kpis = data.kpis;
        state.isLoaded = true;
      }),

    applyPreview: (preview) =>
      set((state) => {
        state.propagationPreview = preview;
      }),

    clearPreview: () =>
      set((state) => {
        state.propagationPreview = null;
      }),

    updateCriticalPath: (criticalNodes) =>
      set((state) => {
        state.criticalPath = criticalNodes;
      }),

    updateKpis: (kpis) =>
      set((state) => {
        state.kpis = kpis;
      }),

    addAlert: (alert) =>
      set((state) => {
        state.alerts.push(alert);
      }),

    removeAlert: (alertId) =>
      set((state) => {
        state.alerts = state.alerts.filter(
          (a) => (a as { id: number }).id !== alertId,
        );
      }),
  })),
);

export const useGraphStore = <T>(
  selector: (state: GraphState & GraphActions) => T,
) => useStore(graphStore, selector);
