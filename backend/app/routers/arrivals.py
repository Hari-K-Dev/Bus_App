"""
Arrivals Router

GET /v1/stops/{stop_id}/arrivals - Get upcoming arrivals for a stop
"""

from fastapi import APIRouter, Depends, Path, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.db import get_db
from app.services.arrivals_service import get_stop_arrivals, ArrivalResponse

router = APIRouter(prefix="/v1/stops", tags=["arrivals"])


@router.get("/{stop_id}/arrivals", response_model=List[ArrivalResponse])
async def get_arrivals(
    stop_id: str = Path(..., description="Stop ID"),
    limit: int = Query(10, ge=1, le=50, description="Maximum number of results"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get upcoming arrivals for a stop.

    Returns arrivals with ETA calculated from schedule + delay.
    Source indicates whether ETA comes from "model" or "schedule".
    """
    return await get_stop_arrivals(db, stop_id, limit)
