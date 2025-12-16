"""
Arrivals Service

Handles stop arrivals with ETA calculation from schedule + delay.

Recommended indexes:
-- CREATE INDEX idx_stop_times_stop ON stop_times(stop_id);
-- CREATE INDEX idx_stop_times_trip_seq ON stop_times(trip_id, stop_sequence);
-- CREATE INDEX idx_bwm_stop_seq ON bus_weather_merged(stop_id, stop_sequence);
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timezone
from typing import List, Optional
from pydantic import BaseModel

from app.utils.gtfs_time import (
    gtfs_time_to_datetime,
    gtfs_time_to_seconds,
    get_current_service_date,
)


class ArrivalResponse(BaseModel):
    routeId: str
    routeShortName: str
    headsign: Optional[str]
    tripId: str
    vehicleId: Optional[str]
    etaSeconds: int
    etaUtc: str
    source: str  # "model" or "schedule"
    lastUpdateAgeS: Optional[int]
    lat: Optional[float]
    lon: Optional[float]
    bearing: Optional[float]
    speed: Optional[float]


async def get_stop_arrivals(
    db: AsyncSession,
    stop_id: str,
    limit: int = 10,
) -> List[ArrivalResponse]:
    """
    Get upcoming arrivals for a stop.
    ETA = scheduled_arrival + arrival_delay from bus_weather_merged

    Args:
        db: Database session
        stop_id: The stop ID
        limit: Maximum number of results

    Returns:
        List of upcoming arrivals with ETA
    """
    service_date = get_current_service_date()
    now = datetime.now(timezone.utc)
    current_time_seconds = now.hour * 3600 + now.minute * 60 + now.second

    # Account for times past midnight (add 24 hours)
    if now.hour < 4:
        current_time_seconds += 86400

    # Get scheduled arrivals with latest delay info from bus_weather_merged
    # Join with routes for route info and trips for headsign
    query = text("""
        WITH latest_vehicle_data AS (
            SELECT DISTINCT ON (trip_id)
                trip_id,
                vehicle_id,
                arrival_delay,
                latitude,
                longitude,
                bearing,
                speed,
                vehicle_timestamp
            FROM bus_weather_merged
            WHERE vehicle_timestamp > NOW() - INTERVAL '30 minutes'
            ORDER BY trip_id, vehicle_timestamp DESC
        )
        SELECT
            st.trip_id,
            st.arrival_time,
            st.stop_sequence,
            t.route_id,
            t.trip_headsign,
            r.route_short_name,
            lvd.vehicle_id,
            COALESCE(lvd.arrival_delay, 0) as arrival_delay,
            lvd.latitude,
            lvd.longitude,
            lvd.bearing,
            lvd.speed,
            lvd.vehicle_timestamp
        FROM stop_times st
        JOIN trips t ON st.trip_id = t.trip_id
        JOIN routes r ON t.route_id = r.route_id
        LEFT JOIN latest_vehicle_data lvd ON st.trip_id = lvd.trip_id
        WHERE st.stop_id = :stop_id
        ORDER BY st.arrival_time
    """)

    result = await db.execute(query, {"stop_id": stop_id})
    rows = result.fetchall()

    arrivals = []
    for row in rows:
        # Parse scheduled time and calculate ETA
        scheduled_seconds = gtfs_time_to_seconds(row.arrival_time)

        # Clamp arrival_delay to sane range (-30 min to +2 hours)
        delay = max(-1800, min(7200, row.arrival_delay or 0))

        eta_seconds_from_midnight = scheduled_seconds + delay

        # Skip arrivals that have already passed
        if eta_seconds_from_midnight < current_time_seconds - 60:
            continue

        # Convert to datetime
        scheduled_dt = gtfs_time_to_datetime(row.arrival_time, service_date)
        eta_dt = scheduled_dt.replace(tzinfo=timezone.utc) + \
                 __import__('datetime').timedelta(seconds=delay)

        # Calculate seconds until arrival
        eta_seconds = max(0, int((eta_dt - now).total_seconds()))

        # Calculate last update age
        last_update_age = None
        if row.vehicle_timestamp:
            last_update_age = int((now - row.vehicle_timestamp.replace(tzinfo=timezone.utc)).total_seconds())

        arrivals.append(
            ArrivalResponse(
                routeId=row.route_id,
                routeShortName=row.route_short_name,
                headsign=row.trip_headsign,
                tripId=row.trip_id,
                vehicleId=row.vehicle_id,
                etaSeconds=eta_seconds,
                etaUtc=eta_dt.isoformat(),
                source="schedule",  # Default to schedule, model would override
                lastUpdateAgeS=last_update_age,
                lat=row.latitude,
                lon=row.longitude,
                bearing=row.bearing,
                speed=row.speed,
            )
        )

        if len(arrivals) >= limit:
            break

    return arrivals
