"""
ETA Service

Handles ETA calculation using ML model prediction with schedule fallback.

Recommended indexes:
-- CREATE INDEX idx_bwm_vehicle_ts ON bus_weather_merged(vehicle_timestamp DESC);
-- CREATE INDEX idx_bwm_route_trip_vehicle ON bus_weather_merged(route_id, trip_id, vehicle_id);
"""

from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession
from datetime import datetime, timedelta, timezone
from typing import Optional
from pydantic import BaseModel

from app.services.model_client import model_client
from app.utils.gtfs_time import gtfs_time_to_datetime, get_current_service_date


class ETAResponse(BaseModel):
    stopId: str
    routeId: str
    vehicleId: str
    predictedDelayS: int
    etaSeconds: int
    etaUtc: str
    source: str  # "model" or "schedule"
    modelVersion: Optional[str] = None


async def get_eta(
    db: AsyncSession,
    stop_id: str,
    vehicle_id: str,
) -> Optional[ETAResponse]:
    """
    Get ETA for a specific vehicle arriving at a stop.
    Priority: ML model prediction > schedule + historical delay

    Args:
        db: Database session
        stop_id: Target stop ID
        vehicle_id: Vehicle ID to track

    Returns:
        ETAResponse or None if cannot calculate
    """
    now = datetime.now(timezone.utc)
    five_minutes_ago = now - timedelta(minutes=5)

    # Fetch latest row from bus_weather_merged for this vehicle within 5 minutes
    query = text("""
        SELECT
            bwm.trip_id,
            bwm.route_id,
            bwm.vehicle_id,
            bwm.stop_id as current_stop_id,
            bwm.stop_sequence,
            bwm.latitude,
            bwm.longitude,
            bwm.speed,
            bwm.bearing,
            bwm.arrival_delay,
            bwm.is_late,
            bwm.temperature,
            bwm.humidity,
            bwm.wind_speed,
            bwm.precipitation,
            bwm.temperature_category,
            bwm.weather_severity,
            bwm.vehicle_timestamp,
            bwm.weather_timestamp,
            bwm.processing_timestamp,
            st.arrival_time as scheduled_arrival
        FROM bus_weather_merged bwm
        JOIN stop_times st ON bwm.trip_id = st.trip_id AND st.stop_id = :stop_id
        WHERE bwm.vehicle_id = :vehicle_id
          AND bwm.vehicle_timestamp > :cutoff
        ORDER BY bwm.vehicle_timestamp DESC
        LIMIT 1
    """)

    result = await db.execute(
        query,
        {
            "vehicle_id": vehicle_id,
            "stop_id": stop_id,
            "cutoff": five_minutes_ago,
        },
    )
    row = result.fetchone()

    if not row:
        return None

    service_date = get_current_service_date()
    scheduled_dt = gtfs_time_to_datetime(row.scheduled_arrival, service_date)

    # Build features for model prediction
    # Send all bus_weather_merged fields except arrival_delay, id, geom
    features = {
        "trip_id": row.trip_id,
        "route_id": row.route_id,
        "vehicle_id": row.vehicle_id,
        "stop_id": stop_id,
        "stop_sequence": row.stop_sequence,
        "latitude": row.latitude,
        "longitude": row.longitude,
        "speed": row.speed,
        "bearing": row.bearing,
        "is_late": row.is_late,
        "temperature": row.temperature,
        "humidity": row.humidity,
        "wind_speed": row.wind_speed,
        "precipitation": row.precipitation,
        "temperature_category": row.temperature_category,
        "weather_severity": row.weather_severity,
        "vehicle_timestamp": row.vehicle_timestamp,
        "weather_timestamp": row.weather_timestamp,
        "processing_timestamp": row.processing_timestamp,
    }

    # Try ML model prediction
    prediction = await model_client.predict(features)

    if prediction:
        # Model prediction successful
        predicted_delay = prediction.predicted_delay_s
        eta_dt = scheduled_dt + timedelta(seconds=predicted_delay)
        eta_seconds = max(0, int((eta_dt - now).total_seconds()))

        return ETAResponse(
            stopId=stop_id,
            routeId=row.route_id,
            vehicleId=vehicle_id,
            predictedDelayS=predicted_delay,
            etaSeconds=eta_seconds,
            etaUtc=eta_dt.isoformat(),
            source="model",
            modelVersion=prediction.model_version,
        )

    # Fallback to schedule + arrival_delay
    delay_seconds = row.arrival_delay or 0
    # Clamp to sane range (-30 min to +2 hours)
    delay_seconds = max(-1800, min(7200, delay_seconds))

    eta_dt = scheduled_dt + timedelta(seconds=delay_seconds)
    eta_seconds = max(0, int((eta_dt - now).total_seconds()))

    return ETAResponse(
        stopId=stop_id,
        routeId=row.route_id,
        vehicleId=vehicle_id,
        predictedDelayS=delay_seconds,
        etaSeconds=eta_seconds,
        etaUtc=eta_dt.isoformat(),
        source="schedule",
        modelVersion=None,
    )
