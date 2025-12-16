"""
Vehicles Router

REST and WebSocket endpoints for real-time vehicle tracking.
No Kafka dependency - uses direct GTFS-RT polling.
"""

import json
import logging
from typing import List, Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Query
from pydantic import BaseModel

from app.services.gtfs_poller import gtfs_poller, MapBounds

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["vehicles"])


class VehicleResponse(BaseModel):
    """Vehicle position response."""
    trip_id: str
    route_id: str
    direction_id: int
    vehicle_id: str
    timestamp: int
    latitude: float
    longitude: float
    bearing: Optional[float] = None
    speed: Optional[float] = None


class VehiclesListResponse(BaseModel):
    """List of vehicles response."""
    count: int
    vehicles: List[VehicleResponse]


class PollerStatusResponse(BaseModel):
    """Poller status response."""
    running: bool
    poll_count: int
    vehicle_count: int
    client_count: int
    last_poll: Optional[str]


@router.get("/vehicles", response_model=VehiclesListResponse)
async def get_vehicles(
    north: Optional[float] = Query(None, description="North bound latitude"),
    south: Optional[float] = Query(None, description="South bound latitude"),
    east: Optional[float] = Query(None, description="East bound longitude"),
    west: Optional[float] = Query(None, description="West bound longitude"),
):
    """
    Get current snapshot of all vehicle positions.

    Optionally filter by map bounds (north, south, east, west).
    """
    if all(v is not None for v in [north, south, east, west]):
        bounds = MapBounds(north=north, south=south, east=east, west=west)
        vehicles = gtfs_poller.get_vehicles_in_bounds(bounds)
    else:
        vehicles = gtfs_poller.get_all_vehicles()

    return VehiclesListResponse(count=len(vehicles), vehicles=vehicles)


@router.get("/vehicles/status", response_model=PollerStatusResponse)
async def get_poller_status():
    """Get GTFS poller status."""
    return gtfs_poller.get_status()


@router.websocket("/ws/vehicles")
async def vehicles_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time vehicle updates.

    Client sends:
        { "type": "subscribe_bounds", "bounds": { "north": float, "south": float, "east": float, "west": float } }

    Server sends:
        { "type": "vehicle_updates", "ts": "ISO timestamp", "vehicles": [...] }
    """
    await websocket.accept()

    client = gtfs_poller.register_client(websocket)

    # Send initial confirmation
    await websocket.send_json({
        "type": "connected",
        "message": "Send subscribe_bounds to start receiving updates",
        "vehicle_count": len(gtfs_poller.latest_by_trip_id)
    })

    try:
        while True:
            # Receive and handle client messages
            try:
                data = await websocket.receive_text()
                message = json.loads(data)

                if message.get("type") == "subscribe_bounds":
                    bounds_data = message.get("bounds", {})

                    if all(k in bounds_data for k in ["north", "south", "east", "west"]):
                        bounds = MapBounds(
                            north=bounds_data["north"],
                            south=bounds_data["south"],
                            east=bounds_data["east"],
                            west=bounds_data["west"]
                        )
                        gtfs_poller.update_client_bounds(client, bounds)

                        # Send immediate snapshot within bounds
                        vehicles = gtfs_poller.get_vehicles_in_bounds(bounds)
                        await websocket.send_json({
                            "type": "bounds_set",
                            "bounds": bounds_data,
                            "vehicle_count": len(vehicles)
                        })

                        # Send initial vehicles in bounds
                        if vehicles:
                            from datetime import datetime, timezone
                            await websocket.send_json({
                                "type": "vehicle_updates",
                                "ts": datetime.now(timezone.utc).isoformat(),
                                "vehicles": vehicles
                            })

                        logger.debug(f"[WS] Client subscribed to bounds: {bounds_data}")

                elif message.get("type") == "ping":
                    await websocket.send_json({"type": "pong"})

            except json.JSONDecodeError:
                logger.warning("[WS] Invalid JSON received")
                continue

    except WebSocketDisconnect:
        logger.info("[WS] Client disconnected")
    except Exception as e:
        logger.error(f"[WS] Error: {e}")
    finally:
        gtfs_poller.unregister_client(client)
