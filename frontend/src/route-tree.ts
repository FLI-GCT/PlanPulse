import { layout, rootRoute, route } from '@tanstack/virtual-file-routes';

export const virtualRouteConfig = rootRoute('root.tsx', [
  layout('_layout.tsx', [
    route('/', 'pulse/_pulse.route.tsx'),
    route('/gantt', 'gantt/_gantt.route.tsx'),
    route('/graph', 'graph/_graph.route.tsx'),
    route('/heatmap', 'heatmap/_heatmap.route.tsx'),
    route('/scenarios', 'scenarios/_scenarios.route.tsx'),
  ]),
]);
