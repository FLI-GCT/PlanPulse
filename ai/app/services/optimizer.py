"""
Greedy optimization service: suggests earlier start dates for production orders
when predecessors allow it, prioritizing high-priority and critical-path nodes.
"""

from datetime import timedelta

from ..models.schemas import (
    GraphNodeInput,
    GraphEdgeInput,
    OptimizeSuggestion,
)
from .graph_builder import build_graph, get_topological_order, find_critical_path


def suggest_optimization(
    nodes: list[GraphNodeInput],
    edges: list[GraphEdgeInput],
) -> list[OptimizeSuggestion]:
    """
    Analyze the production graph and suggest earlier start dates for nodes
    that have slack in their schedule.

    Strategy:
    1. Build the DAG and compute topological order.
    2. For each node (sorted by priority desc, then criticality):
       - Compute the earliest possible start = max(predecessor finish + delay)
       - If earliest possible start < current start, suggest moving it.
    3. Return suggestions sorted by improvement magnitude.
    """
    if not nodes:
        return []

    G = build_graph(nodes, edges)
    topo_order = get_topological_order(G)
    critical_path_set = set(find_critical_path(G))

    suggestions: list[OptimizeSuggestion] = []

    for nid in topo_order:
        if nid not in G.nodes():
            continue

        ndata = G.nodes[nid]
        current_start = ndata.get("_date_debut")
        current_end = ndata.get("_date_fin")

        if current_start is None or current_end is None:
            continue

        # Skip nodes that are already completed
        if ndata.get("statut") in ("TERMINE", "ANNULE"):
            continue

        duration_days = ndata.get("_duration_days", 0) or 0

        # Compute the earliest possible start based on predecessors
        predecessors = list(G.predecessors(nid))
        if not predecessors:
            # Root node: cannot move earlier than its own start (no predecessor constraint)
            continue

        earliest_possible_start = None
        all_predecessors_have_dates = True

        for pred in predecessors:
            pred_data = G.nodes.get(pred)
            if pred_data is None:
                all_predecessors_have_dates = False
                continue

            pred_finish = pred_data.get("_date_fin")
            if pred_finish is None:
                all_predecessors_have_dates = False
                continue

            edge_delay = G.edges[pred, nid].get("delai_minimum", 0)
            pred_earliest_release = pred_finish + timedelta(days=edge_delay)

            if earliest_possible_start is None:
                earliest_possible_start = pred_earliest_release
            else:
                earliest_possible_start = max(earliest_possible_start, pred_earliest_release)

        if not all_predecessors_have_dates or earliest_possible_start is None:
            continue

        # Check if we can move this node earlier
        improvement_days = (current_start - earliest_possible_start).total_seconds() / 86400

        if improvement_days >= 0.5:
            # Determine reason
            reason_parts = []
            if nid in critical_path_set:
                reason_parts.append("noeud sur le chemin critique")
            if ndata.get("priorite") is not None and ndata["priorite"] >= 8:
                reason_parts.append(f"priorite haute ({ndata['priorite']})")
            reason_parts.append(
                f"predecesseurs terminent {improvement_days:.1f}j avant le debut prevu"
            )

            reason = "; ".join(reason_parts)

            suggestions.append(
                OptimizeSuggestion(
                    node_id=nid,
                    current_start=current_start.strftime("%Y-%m-%d"),
                    suggested_start=earliest_possible_start.strftime("%Y-%m-%d"),
                    improvement_days=round(improvement_days, 1),
                    reason=reason,
                )
            )

    # Sort by improvement (biggest gains first), then by priority
    suggestions.sort(key=lambda s: -s.improvement_days)

    return suggestions
