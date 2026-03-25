"""
Risk scoring service: assigns a 0-100 risk score to each node in the production graph.

Weights:
  - Float/margin (lower margin = higher risk):    30%
  - Predecessors en retard:                       25%
  - Position on critical path (betweenness):      20%
  - Dependency density:                           15%
  - Supplier reliability (achat late history):    10%
"""

import networkx as nx
from datetime import datetime

from ..models.schemas import GraphInput, RiskScoreResult
from .graph_builder import build_graph, find_critical_path


def compute_risk_scores(graph_input: GraphInput) -> list[RiskScoreResult]:
    """Compute a risk score (0-100) for every node in the graph."""
    if not graph_input.nodes:
        return []

    G = build_graph(graph_input.nodes, graph_input.edges)

    # Pre-compute graph-wide metrics
    betweenness = nx.betweenness_centrality(G) if len(G.nodes()) > 1 else {}
    critical_path_set = set(find_critical_path(G))

    # Track which supplier nodes (achat) are late -- used for downstream risk
    late_supplier_ids: set[str] = set()
    for node in graph_input.nodes:
        if node.type == "achat" and node.statut in ("EN_RETARD", "BLOQUE"):
            late_supplier_ids.add(node.id)

    results: list[RiskScoreResult] = []

    for node in graph_input.nodes:
        ndata = G.nodes[node.id]
        factors: dict = {}

        # ── Factor 1: Margin / Float (30%) ──────────────────────────
        # How many days remain between now and the deadline.
        # Fewer days = higher risk.
        margin_score = 0
        date_fin = ndata.get("_date_fin")
        if date_fin is not None:
            remaining_days = (date_fin - datetime.now()).total_seconds() / 86400
            if remaining_days <= 0:
                margin_score = 100
            elif remaining_days <= 1:
                margin_score = 90
            elif remaining_days <= 3:
                margin_score = 70
            elif remaining_days <= 7:
                margin_score = 50
            elif remaining_days <= 14:
                margin_score = 30
            else:
                margin_score = max(0, int(100 - remaining_days * 2))
        # If already late by status, override to max
        if node.statut in ("EN_RETARD", "BLOQUE"):
            margin_score = 100
        factors["margin_days"] = round((date_fin - datetime.now()).total_seconds() / 86400, 1) if date_fin else None
        factors["margin_score"] = margin_score

        # ── Factor 2: Predecessors en retard (25%) ──────────────────
        predecessors = list(G.predecessors(node.id))
        late_predecessors = sum(
            1 for p in predecessors
            if G.nodes[p].get("statut") in ("EN_RETARD", "BLOQUE")
        )
        total_predecessors = len(predecessors)
        if total_predecessors > 0:
            pred_score = min(int((late_predecessors / total_predecessors) * 100) + late_predecessors * 15, 100)
        else:
            pred_score = 0
        factors["predecessors_total"] = total_predecessors
        factors["predecessors_en_retard"] = late_predecessors
        factors["predecessors_score"] = pred_score

        # ── Factor 3: Critical path position / betweenness (20%) ────
        raw_centrality = betweenness.get(node.id, 0)
        centrality_score = int(raw_centrality * 100)
        # Boost if node is on the critical path
        if node.id in critical_path_set:
            centrality_score = max(centrality_score, 60)
            centrality_score = min(centrality_score + 30, 100)
        factors["centrality"] = round(raw_centrality, 4)
        factors["on_critical_path"] = node.id in critical_path_set
        factors["centrality_score"] = centrality_score

        # ── Factor 4: Dependency density (15%) ──────────────────────
        in_degree = G.in_degree(node.id)
        out_degree = G.out_degree(node.id)
        total_degree = in_degree + out_degree
        density_score = min(total_degree * 10, 100)
        factors["dependency_density"] = total_degree
        factors["density_score"] = density_score

        # ── Factor 5: Supplier reliability (10%) ────────────────────
        # If this node depends on a late supplier (achat), it inherits risk
        supplier_risk = 0
        late_supplier_predecessors = [p for p in predecessors if p in late_supplier_ids]
        if late_supplier_predecessors:
            supplier_risk = min(len(late_supplier_predecessors) * 40, 100)
        # If this node itself is a late achat
        if node.id in late_supplier_ids:
            supplier_risk = 100
        factors["late_suppliers"] = len(late_supplier_predecessors)
        factors["supplier_score"] = supplier_risk

        # ── Weighted average ────────────────────────────────────────
        score = int(
            0.30 * margin_score
            + 0.25 * pred_score
            + 0.20 * centrality_score
            + 0.15 * density_score
            + 0.10 * supplier_risk
        )
        score = max(0, min(100, score))

        results.append(RiskScoreResult(node_id=node.id, score=score, factors=factors))

    return results
