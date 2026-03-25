from fastapi import APIRouter

from ..models.schemas import GraphInput, MonteCarloInput
from ..services.risk_scoring import compute_risk_scores
from ..services.monte_carlo import run_monte_carlo
from ..services.optimizer import suggest_optimization

router = APIRouter(prefix="/analyze")


@router.post("/risk-scoring")
def risk_scoring(data: GraphInput):
    results = compute_risk_scores(data)
    return {"scores": [r.model_dump() for r in results]}


@router.post("/monte-carlo")
def monte_carlo(data: MonteCarloInput):
    result = run_monte_carlo(data.nodes, data.edges, data.simulations)
    return result.model_dump()


@router.post("/optimize")
def optimize(data: GraphInput):
    suggestions = suggest_optimization(data.nodes, data.edges)
    return {"suggestions": [s.model_dump() for s in suggestions]}
