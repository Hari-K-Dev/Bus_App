"""
Stops Router

GET /v1/stops/near - Find stops near a location
GET /v1/stops/search - Search stops by name
"""

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List

from app.db import get_db
from app.services.stops_service import (
    get_nearby_stops,
    search_stops,
    StopNearResponse,
    StopSearchResponse,
)

router = APIRouter(prefix="/v1/stops", tags=["stops"])


@router.get("/near", response_model=List[StopNearResponse])
async def get_stops_near(
    lat: float = Query(..., ge=-90, le=90, description="Latitude"),
    lon: float = Query(..., ge=-180, le=180, description="Longitude"),
    radius: int = Query(800, ge=100, le=5000, description="Search radius in meters"),
    limit: int = Query(5, ge=1, le=50, description="Maximum number of results"),
    db: AsyncSession = Depends(get_db),
):
    """
    Get stops near a location.

    Returns stops within the specified radius, ordered by distance.
    """
    return await get_nearby_stops(db, lat, lon, radius, limit)


@router.get("/search", response_model=List[StopSearchResponse])
async def search_stops_endpoint(
    q: str = Query(..., min_length=1, description="Search query"),
    limit: int = Query(20, ge=1, le=100, description="Maximum number of results"),
    db: AsyncSession = Depends(get_db),
):
    """
    Search stops by name or code.

    Case-insensitive search matching stop name or stop code.
    """
    return await search_stops(db, q, limit)
