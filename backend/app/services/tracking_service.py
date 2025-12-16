"""
Tracking Service

Handles vehicle position lookups.

Recommended indexes:
-- CREATE INDEX idx_bwm_vehicle_ts ON bus_weather_merged(vehicle_timestamp DESC);
-- CREATE INDEX idx_bwm_vehicle_id ON bus_weather_merged(vehicle_id);
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from typing import Optional
from pydantic import BaseModel


class VehicleTrackingResponse(BaseModel):
    vehicleId: str
    routeId: str
    tripId: str
    lat: float
    lon: float
    bearing: Optional[float]
    speed: Optional[float]
    lastUpdate: str


async def get_vehicle_position(
    db: AsyncSession,
    vehicle_id: str,
) -> Optional[VehicleTrackingResponse]:
    """
    Get latest position for a specific vehicle.

    Args:
        db: Database session
        vehicle_id: The vehicle ID

    Returns:
        Vehicle position or None if not found
    """
    query = text("""
        SELECT
            vehicle_id,
            trip_id,
            route_id,
            latitude,
            longitude,
            speed,
            bearing,
            vehicle_timestamp
        FROM bus_weather_merged
        WHERE vehicle_id = :vehicle_id
        ORDER BY vehicle_timestamp DESC
        LIMIT 1
    """)

    result = await db.execute(query, {"vehicle_id": vehicle_id})
    row = result.fetchone()

    if not row:
        return None

    timestamp = row.vehicle_timestamp
    if timestamp and timestamp.tzinfo is None:
        timestamp = timestamp.replace(tzinfo=timezone.utc)

    return VehicleTrackingResponse(
        vehicleId=row.vehicle_id,
        routeId=row.route_id,
        tripId=row.trip_id,
        lat=row.latitude,
        lon=row.longitude,
        bearing=row.bearing,
        speed=row.speed,
        lastUpdate=timestamp.isoformat() if timestamp else datetime.now(timezone.utc).isoformat(),
    )
