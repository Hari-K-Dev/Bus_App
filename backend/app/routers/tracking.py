"""
Tracking Router

GET /v1/tracking/{vehicle_id} - Get current vehicle position
"""

from fastapi import APIRouter, Depends, Path, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.services.tracking_service import get_vehicle_position, VehicleTrackingResponse

router = APIRouter(prefix="/v1/tracking", tags=["tracking"])


@router.get("/{vehicle_id}", response_model=VehicleTrackingResponse)
async def get_vehicle(
    vehicle_id: str = Path(..., description="Vehicle ID"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get current position of a vehicle.

    Returns latest known position with route, trip, speed, and bearing.
    """
    position = await get_vehicle_position(db, vehicle_id)

    if not position:
        raise HTTPException(status_code=404, detail="Vehicle not found")

    return position
