import { createStore } from 'zustand/vanilla';
import { immer } from 'zustand/middleware/immer';
import { useStore } from 'zustand';

export type StrategicGroupBy = 'client' | 'semaine' | 'article' | 'priorite';
export type StrategicVariant = 'bubbles' | 'flows';
export type GanttResolution = 'macro' | 'segment' | 'of';

export type GraphTab = 'fournisseurs' | 'sankey' | 'reseau';

export interface GraphNav {
  level: 1 | 2 | '3a' | '3b';
  commandOfFinalId: string | null;
  focusNodeId: string | null;
  questionType: string | null;
  questionTargetId: string | null;
  strategicGroupBy: StrategicGroupBy;
  strategicVariant: StrategicVariant;
  breadcrumb: Array<{ level: string; label: string }>;
  graphTab: GraphTab;
}

interface UiState {
  selectedNodeId: string | null;
  hoveredNodeId: string | null;
  activeView: 'pulse' | 'gantt' | 'graph' | 'heatmap';
  filters: {
    statuts: string[];
    priorite: number | null;
    client: string;
    articleType: string;
  };
  ganttZoom: {
    startDate: string;
    endDate: string;
  };
  detailDrawerOpen: boolean;
  dragState: {
    isDragging: boolean;
    ofId: string;
    requestId: number;
  } | null;
  whatIfMode: boolean;
  scenarioId: string | null;
  graphNav: GraphNav;
  ganttResolution: GanttResolution;
  ganttSelection: string[];
}

interface UiActions {
  selectNode: (nodeId: string | null) => void;
  hoverNode: (nodeId: string | null) => void;
  setActiveView: (view: UiState['activeView']) => void;
  setFilters: (filters: Partial<UiState['filters']>) => void;
  setGanttZoom: (zoom: Partial<UiState['ganttZoom']>) => void;
  toggleDrawer: (open?: boolean) => void;
  startDrag: (ofId: string, requestId: number) => void;
  endDrag: () => void;
  setWhatIfMode: (enabled: boolean, scenarioId?: string | null) => void;
  setGraphNav: (nav: Partial<GraphNav>) => void;
  setGraphTab: (tab: GraphTab) => void;
  setGanttResolution: (res: GanttResolution) => void;
  setGanttSelection: (ids: string[]) => void;
  toggleGanttSelection: (id: string) => void;
}

export const uiStore = createStore<UiState & UiActions>()(
  immer((set) => ({
    selectedNodeId: null,
    hoveredNodeId: null,
    activeView: 'pulse' as const,
    filters: {
      statuts: [],
      priorite: null,
      client: '',
      articleType: '',
    },
    ganttZoom: {
      startDate: new Date().toISOString(),
      endDate: new Date(Date.now() + 42 * 24 * 60 * 60 * 1000).toISOString(),
    },
    detailDrawerOpen: false,
    dragState: null,
    whatIfMode: false,
    scenarioId: null,
    ganttResolution: 'of' as GanttResolution,
    ganttSelection: [],
    graphNav: {
      level: 1,
      commandOfFinalId: null,
      focusNodeId: null,
      questionType: null,
      questionTargetId: null,
      strategicGroupBy: 'client' as const,
      strategicVariant: 'bubbles' as const,
      breadcrumb: [{ level: '1', label: 'Vue strategique' }],
      graphTab: 'fournisseurs' as GraphTab,
    },

    selectNode: (nodeId) =>
      set((state) => {
        state.selectedNodeId = nodeId;
        if (nodeId) state.detailDrawerOpen = true;
      }),

    hoverNode: (nodeId) =>
      set((state) => {
        state.hoveredNodeId = nodeId;
      }),

    setActiveView: (view) =>
      set((state) => {
        state.activeView = view;
      }),

    setFilters: (filters) =>
      set((state) => {
        Object.assign(state.filters, filters);
      }),

    setGanttZoom: (zoom) =>
      set((state) => {
        Object.assign(state.ganttZoom, zoom);
      }),

    toggleDrawer: (open) =>
      set((state) => {
        state.detailDrawerOpen = open ?? !state.detailDrawerOpen;
      }),

    startDrag: (ofId, requestId) =>
      set((state) => {
        state.dragState = { isDragging: true, ofId, requestId };
      }),

    endDrag: () =>
      set((state) => {
        state.dragState = null;
      }),

    setWhatIfMode: (enabled, scenarioId) =>
      set((state) => {
        state.whatIfMode = enabled;
        state.scenarioId = scenarioId ?? null;
      }),

    setGraphNav: (nav) =>
      set((state) => {
        Object.assign(state.graphNav, nav);
      }),

    setGraphTab: (tab) =>
      set((state) => {
        state.graphNav.graphTab = tab;
      }),

    setGanttResolution: (res) =>
      set((state) => {
        state.ganttResolution = res;
        state.ganttSelection = [];
      }),

    setGanttSelection: (ids) =>
      set((state) => {
        state.ganttSelection = ids;
      }),

    toggleGanttSelection: (id) =>
      set((state) => {
        const idx = state.ganttSelection.indexOf(id);
        if (idx >= 0) {
          state.ganttSelection.splice(idx, 1);
        } else {
          state.ganttSelection.push(id);
        }
      }),
  })),
);

export const useUiStore = <T>(
  selector: (state: UiState & UiActions) => T,
) => useStore(uiStore, selector);
