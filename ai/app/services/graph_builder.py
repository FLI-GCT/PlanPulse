"""
Reusable NetworkX graph construction from PlanPulse graph inputs.
"""

import networkx as nx
from datetime import datetime
from ..models.schemas import GraphNodeInput, GraphEdgeInput


DATE_FORMAT = "%Y-%m-%dT%H:%M:%S.%fZ"
DATE_FORMAT_SHORT = "%Y-%m-%d"


def parse_date(date_str: str) -> datetime:
    """Parse a date string, trying ISO with milliseconds first, then plain date."""
    for fmt in (DATE_FORMAT, DATE_FORMAT_SHORT, "%Y-%m-%dT%H:%M:%SZ", "%Y-%m-%dT%H:%M:%S"):
        try:
            return datetime.strptime(date_str, fmt)
        except ValueError:
            continue
    # Last resort: use fromisoformat which handles many variants
    return datetime.fromisoformat(date_str.replace("Z", "+00:00").replace("+00:00", ""))


def build_graph(
    nodes: list[GraphNodeInput],
    edges: list[GraphEdgeInput],
) -> nx.DiGraph:
    """
    Build a NetworkX DiGraph from PlanPulse node/edge inputs.
    Node attributes include parsed dates and all original fields.
    Edge attributes include delai_minimum and type_lien.
    """
    G = nx.DiGraph()

    for node in nodes:
        data = node.model_dump()
        try:
            data["_date_debut"] = parse_date(node.date_debut)
            data["_date_fin"] = parse_date(node.date_fin)
            data["_duration_days"] = (data["_date_fin"] - data["_date_debut"]).total_seconds() / 86400
        except Exception:
            data["_date_debut"] = None
            data["_date_fin"] = None
            data["_duration_days"] = 0
        G.add_node(node.id, **data)

    for edge in edges:
        G.add_edge(
            edge.source_id,
            edge.target_id,
            type_lien=edge.type_lien,
            delai_minimum=edge.delai_minimum,
        )

    return G


def get_topological_order(G: nx.DiGraph) -> list[str]:
    """
    Return topological order of nodes. If the graph has cycles, fall back
    to a best-effort ordering using the nodes as-is.
    """
    try:
        return list(nx.topological_sort(G))
    except nx.NetworkXUnfeasible:
        # Graph has cycles -- return nodes in insertion order
        return list(G.nodes())


def find_critical_path(G: nx.DiGraph) -> list[str]:
    """
    Compute the critical path (longest path) in the DAG using node durations
    as weights. Returns the list of node IDs on the critical path.
    If the graph has cycles or is empty, returns an empty list.
    """
    if len(G.nodes()) == 0:
        return []

    try:
        topo_order = list(nx.topological_sort(G))
    except nx.NetworkXUnfeasible:
        return []

    # Longest path via dynamic programming
    dist: dict[str, float] = {n: 0.0 for n in G.nodes()}
    predecessor: dict[str, str | None] = {n: None for n in G.nodes()}

    for u in topo_order:
        u_duration = G.nodes[u].get("_duration_days", 0) or 0
        for v in G.successors(u):
            edge_delay = G.edges[u, v].get("delai_minimum", 0)
            new_dist = dist[u] + u_duration + edge_delay
            if new_dist > dist[v]:
                dist[v] = new_dist
                predecessor[v] = u

    if not dist:
        return []

    # Find the end node with the longest distance
    end_node = max(dist, key=lambda n: dist[n] + (G.nodes[n].get("_duration_days", 0) or 0))

    # Trace back
    path = [end_node]
    current = end_node
    while predecessor[current] is not None:
        current = predecessor[current]
        path.append(current)

    path.reverse()
    return path
