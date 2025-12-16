"""
Stops Service

Handles stop lookups using standard SQL (no PostGIS required).

Recommended indexes:
-- CREATE INDEX idx_stops_name ON stops(stop_name);
-- CREATE INDEX idx_stops_code ON stops(stop_code);
-- CREATE INDEX idx_stops_lat_lon ON stops(stop_lat, stop_lon);
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from typing import List
from pydantic import BaseModel
import math


class StopNearResponse(BaseModel):
    stopId: str
    stopName: str
    lat: float
    lon: float
    distanceM: float


class StopSearchResponse(BaseModel):
    stopId: str
    stopName: str
    lat: float
    lon: float


def haversine_distance_meters(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the great circle distance between two points on earth (in meters).
    """
    R = 6371000  # Earth's radius in meters

    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)

    a = math.sin(delta_lat / 2) ** 2 + \
        math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon / 2) ** 2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))

    return R * c


async def get_nearby_stops(
    db: AsyncSession,
    lat: float,
    lon: float,
    radius_m: int = 800,
    limit: int = 5,
) -> List[StopNearResponse]:
    """
    Find stops within radius using bounding box approximation then Haversine distance.

    Args:
        db: Database session
        lat: Latitude
        lon: Longitude
        radius_m: Search radius in meters (default 800)
        limit: Maximum number of results (default 5)

    Returns:
        List of nearby stops with distance
    """
    # Approximate degrees for bounding box (1 degree ~ 111km at equator)
    # Use a slightly larger box to account for latitude distortion
    lat_delta = radius_m / 111000 * 1.2
    lon_delta = radius_m / (111000 * math.cos(math.radians(lat))) * 1.2

    # Query with bounding box filter for efficiency
    query = text("""
        SELECT
            stop_id,
            stop_name,
            stop_lat,
            stop_lon
        FROM stops
        WHERE stop_lat BETWEEN :min_lat AND :max_lat
          AND stop_lon BETWEEN :min_lon AND :max_lon
    """)

    result = await db.execute(
        query,
        {
            "min_lat": lat - lat_delta,
            "max_lat": lat + lat_delta,
            "min_lon": lon - lon_delta,
            "max_lon": lon + lon_delta,
        },
    )
    rows = result.fetchall()

    # Calculate actual distances and filter
    stops_with_distance = []
    for row in rows:
        distance = haversine_distance_meters(
            lat, lon, float(row.stop_lat), float(row.stop_lon)
        )
        if distance <= radius_m:
            stops_with_distance.append({
                "stop_id": row.stop_id,
                "stop_name": row.stop_name,
                "stop_lat": float(row.stop_lat),
                "stop_lon": float(row.stop_lon),
                "distance_m": distance,
            })

    # Sort by distance and limit
    stops_with_distance.sort(key=lambda x: x["distance_m"])
    stops_with_distance = stops_with_distance[:limit]

    return [
        StopNearResponse(
            stopId=s["stop_id"],
            stopName=s["stop_name"],
            lat=s["stop_lat"],
            lon=s["stop_lon"],
            distanceM=round(s["distance_m"], 1),
        )
        for s in stops_with_distance
    ]


async def search_stops(
    db: AsyncSession,
    query_str: str,
    limit: int = 20,
) -> List[StopSearchResponse]:
    """
    Search stops by name or code (case-insensitive).

    Args:
        db: Database session
        query_str: Search query
        limit: Maximum number of results (default 20)

    Returns:
        List of matching stops
    """
    query = text("""
        SELECT stop_id, stop_name, stop_lat, stop_lon
        FROM stops
        WHERE stop_name ILIKE :query OR stop_code ILIKE :query
        ORDER BY
            CASE WHEN stop_name ILIKE :exact THEN 0 ELSE 1 END,
            stop_name
        LIMIT :limit
    """)

    result = await db.execute(
        query,
        {"query": f"%{query_str}%", "exact": f"{query_str}%", "limit": limit},
    )
    rows = result.fetchall()

    return [
        StopSearchResponse(
            stopId=row.stop_id,
            stopName=row.stop_name,
            lat=float(row.stop_lat),
            lon=float(row.stop_lon),
        )
        for row in rows
    ]
