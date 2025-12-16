"""
ETA Router

GET /v1/eta - Get ML model predicted ETA for vehicle at stop
"""

from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.services.eta_service import get_eta, ETAResponse

router = APIRouter(prefix="/v1/eta", tags=["eta"])


@router.get("", response_model=ETAResponse)
async def get_eta_endpoint(
    stop_id: str = Query(..., description="Target stop ID"),
    vehicle_id: str = Query(..., description="Vehicle ID to track"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get ETA for a specific vehicle arriving at a stop.

    Uses ML model prediction when available, falls back to schedule + delay.

    Response includes:
    - predictedDelayS: Predicted delay in seconds
    - etaSeconds: Seconds until arrival
    - etaUtc: ETA as ISO8601 timestamp
    - source: "model" or "schedule"
    - modelVersion: Model version if source is "model"
    """
    eta = await get_eta(db, stop_id, vehicle_id)

    if not eta:
        raise HTTPException(
            status_code=404,
            detail="Could not calculate ETA. Vehicle may not be active or stop not on route.",
        )

    return eta
