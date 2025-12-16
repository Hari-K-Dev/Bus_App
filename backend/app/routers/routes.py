"""
Routes Router

GET /v1/routes - Get all available routes
"""

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from pydantic import BaseModel

from app.db import get_db

router = APIRouter(prefix="/v1/routes", tags=["routes"])


class RouteResponse(BaseModel):
    routeId: str
    routeShortName: str
    routeLongName: str


@router.get("", response_model=List[RouteResponse])
async def get_all_routes(db: AsyncSession = Depends(get_db)):
    """
    Get all available routes.

    Returns list of routes with ID, short name, and long name.
    """
    query = text("""
        SELECT route_id, route_short_name, route_long_name
        FROM routes
        ORDER BY route_short_name
    """)

    result = await db.execute(query)
    rows = result.fetchall()

    return [
        RouteResponse(
            routeId=row.route_id,
            routeShortName=row.route_short_name or "",
            routeLongName=row.route_long_name or "",
        )
        for row in rows
    ]
