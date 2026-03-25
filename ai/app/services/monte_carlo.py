"""
Monte Carlo simulation service using PERT distributions.

For each node, the duration is sampled from a PERT (modified Beta) distribution:
  - min  = 0.7 * nominal_duration
  - mode = nominal_duration
  - max  = 1.5 * nominal_duration

A forward pass through the DAG (topological order) computes the finish date
of every node for each simulation run. Results are aggregated into P50, P80,
P95 percentiles and on-time probability.
"""

import numpy as np
from datetime import datetime, timedelta
from typing import Optional

from ..models.schemas import (
    GraphNodeInput,
    GraphEdgeInput,
    MonteCarloResult,
    MonteCarloNodeResult,
)
from .graph_builder import build_graph, get_topological_order, find_critical_path


def _pert_sample(
    minimum: float,
    mode: float,
    maximum: float,
    size: int,
    lambd: float = 4.0,
) -> np.ndarray:
    """
    Sample from a PERT distribution using the Beta distribution transformation.

    PERT parameters:
      a = minimum, b = mode (most likely), c = maximum
      alpha1 = 1 + lambd * (b - a) / (c - a)
      alpha2 = 1 + lambd * (c - b) / (c - a)

    The result is scaled back from Beta(0,1) to the [a, c] range.
    """
    if maximum <= minimum:
        return np.full(size, mode)

    range_val = maximum - minimum
    if range_val == 0:
        return np.full(size, minimum)

    # Clamp mode to be within [min, max]
    mode = max(minimum, min(mode, maximum))

    alpha1 = 1.0 + lambd * (mode - minimum) / range_val
    alpha2 = 1.0 + lambd * (maximum - mode) / range_val

    samples = np.random.beta(alpha1, alpha2, size=size)
    return minimum + samples * range_val


def run_monte_carlo(
    nodes: list[GraphNodeInput],
    edges: list[GraphEdgeInput],
    simulations: int = 5000,
) -> MonteCarloResult:
    """
    Run Monte Carlo simulation on the production graph.

    Returns percentile finish dates and on-time probability for each node,
    plus the list of nodes that appear most frequently on the critical path.
    """
    if not nodes:
        return MonteCarloResult(node_results=[], critical_nodes=[])

    G = build_graph(nodes, edges)
    topo_order = get_topological_order(G)

    # Map node IDs to indices for array operations
    node_ids = [n for n in topo_order if n in G.nodes()]
    node_idx = {nid: i for i, nid in enumerate(node_ids)}
    n_nodes = len(node_ids)

    if n_nodes == 0:
        return MonteCarloResult(node_results=[], critical_nodes=[])

    # Extract nominal durations and start dates
    nominal_durations = np.zeros(n_nodes)
    start_dates = []
    deadline_dates = []

    for i, nid in enumerate(node_ids):
        ndata = G.nodes[nid]
        duration = ndata.get("_duration_days", 0) or 0
        nominal_durations[i] = max(duration, 0.1)  # at least 0.1 day
        start_dates.append(ndata.get("_date_debut"))
        deadline_dates.append(ndata.get("_date_fin"))

    # PERT parameters per node
    min_durations = 0.7 * nominal_durations
    max_durations = 1.5 * nominal_durations

    # Sample durations: shape (simulations, n_nodes)
    sampled_durations = np.zeros((simulations, n_nodes))
    for i in range(n_nodes):
        sampled_durations[:, i] = _pert_sample(
            minimum=min_durations[i],
            mode=nominal_durations[i],
            maximum=max_durations[i],
            size=simulations,
        )

    # Forward pass: compute earliest finish time for each node per simulation
    # finish_time[sim, node] = earliest start + sampled duration
    # earliest start = max(own start, max(predecessor finish + edge delay))
    earliest_start = np.zeros((simulations, n_nodes))
    finish_time = np.zeros((simulations, n_nodes))

    # Use the first node's start date as the reference (time=0)
    reference_date: Optional[datetime] = None
    for sd in start_dates:
        if sd is not None:
            reference_date = sd
            break
    if reference_date is None:
        reference_date = datetime.now()

    # Convert start dates to offset days from reference
    start_offsets = np.zeros(n_nodes)
    for i, sd in enumerate(start_dates):
        if sd is not None:
            start_offsets[i] = (sd - reference_date).total_seconds() / 86400
        else:
            start_offsets[i] = 0

    for i, nid in enumerate(node_ids):
        # Base earliest start is the node's own scheduled start
        earliest_start[:, i] = start_offsets[i]

        # Check all predecessors
        for pred in G.predecessors(nid):
            if pred not in node_idx:
                continue
            pred_i = node_idx[pred]
            edge_delay = G.edges[pred, nid].get("delai_minimum", 0)
            # Earliest start = max of current and predecessor finish + delay
            pred_finish_plus_delay = finish_time[:, pred_i] + edge_delay
            earliest_start[:, i] = np.maximum(earliest_start[:, i], pred_finish_plus_delay)

        finish_time[:, i] = earliest_start[:, i] + sampled_durations[:, i]

    # Compute deadline offsets for on-time probability
    deadline_offsets = np.zeros(n_nodes)
    for i, dd in enumerate(deadline_dates):
        if dd is not None:
            deadline_offsets[i] = (dd - reference_date).total_seconds() / 86400
        else:
            # No deadline -- consider always on time
            deadline_offsets[i] = 1e9

    # Aggregate results per node
    node_results: list[MonteCarloNodeResult] = []
    for i, nid in enumerate(node_ids):
        ft = finish_time[:, i]

        p50_offset = float(np.percentile(ft, 50))
        p80_offset = float(np.percentile(ft, 80))
        p95_offset = float(np.percentile(ft, 95))

        p50_date = reference_date + timedelta(days=p50_offset)
        p80_date = reference_date + timedelta(days=p80_offset)
        p95_date = reference_date + timedelta(days=p95_offset)

        on_time_count = np.sum(ft <= deadline_offsets[i])
        prob_on_time = float(on_time_count / simulations)

        node_results.append(
            MonteCarloNodeResult(
                node_id=nid,
                p50_date=p50_date.strftime("%Y-%m-%d"),
                p80_date=p80_date.strftime("%Y-%m-%d"),
                p95_date=p95_date.strftime("%Y-%m-%d"),
                prob_on_time=round(prob_on_time, 4),
            )
        )

    # Determine critical nodes: for each simulation, find the longest path
    # and count how often each node appears on it.
    # Simplified: nodes whose finish time equals the overall project finish time
    # (within tolerance) are considered critical in that simulation.
    project_finish = np.max(finish_time, axis=1)  # shape (simulations,)
    critical_counts = np.zeros(n_nodes)
    tolerance = 0.01  # days

    for i in range(n_nodes):
        # A node is critical if removing its slack would delay the project
        # Approximation: node is critical if its finish time + downstream
        # propagation matches the project finish
        # Simpler heuristic: check if the node's finish time is close to
        # the maximum finish in at least some simulations
        successors = list(G.successors(node_ids[i]))
        if not successors:
            # Leaf nodes: critical if they determine project finish
            critical_counts[i] = np.sum(np.abs(finish_time[:, i] - project_finish) < tolerance)
        else:
            # Non-leaf: critical if any successor depends tightly on it
            for succ in successors:
                if succ not in node_idx:
                    continue
                succ_i = node_idx[succ]
                edge_delay = G.edges[node_ids[i], succ].get("delai_minimum", 0)
                # Node is critical if successor's start equals this node's finish + delay
                is_binding = np.abs(
                    earliest_start[:, succ_i] - (finish_time[:, i] + edge_delay)
                ) < tolerance
                critical_counts[i] += np.sum(is_binding)

    # Normalize and pick nodes that are critical in >50% of simulations
    critical_freq = critical_counts / simulations
    critical_threshold = 0.3
    critical_nodes = [
        node_ids[i]
        for i in range(n_nodes)
        if critical_freq[i] >= critical_threshold
    ]

    # If nothing passed threshold, take the top 3
    if not critical_nodes and n_nodes > 0:
        top_indices = np.argsort(-critical_freq)[:min(3, n_nodes)]
        critical_nodes = [node_ids[i] for i in top_indices if critical_freq[i] > 0]

    return MonteCarloResult(
        node_results=node_results,
        critical_nodes=critical_nodes,
    )
