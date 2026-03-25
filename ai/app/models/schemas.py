from pydantic import BaseModel
from typing import Optional


class GraphNodeInput(BaseModel):
    id: str
    type: str  # 'of' | 'achat'
    date_debut: str
    date_fin: str
    statut: str
    priorite: Optional[int] = None
    quantite: float = 1


class GraphEdgeInput(BaseModel):
    source_id: str
    target_id: str
    type_lien: str
    delai_minimum: float = 0


class GraphInput(BaseModel):
    nodes: list[GraphNodeInput]
    edges: list[GraphEdgeInput]


class RiskScoreResult(BaseModel):
    node_id: str
    score: int  # 0-100
    factors: dict


class MonteCarloInput(BaseModel):
    nodes: list[GraphNodeInput]
    edges: list[GraphEdgeInput]
    simulations: int = 5000


class MonteCarloNodeResult(BaseModel):
    node_id: str
    p50_date: str
    p80_date: str
    p95_date: str
    prob_on_time: float


class MonteCarloResult(BaseModel):
    node_results: list[MonteCarloNodeResult]
    critical_nodes: list[str]


class OptimizeSuggestion(BaseModel):
    node_id: str
    current_start: str
    suggested_start: str
    improvement_days: float
    reason: str
