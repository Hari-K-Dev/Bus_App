"""
Dublin Bus ETA API

Main FastAPI application entry point.

Run with: uvicorn app.main:app --reload --port 8080
"""

import json
from datetime import datetime, timezone
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from app.routers import (
    stops_router,
    arrivals_router,
    tracking_router,
    eta_router,
    routes_router,
    health_router,
)
from app.routers.vehicles import router as vehicles_router
from app.services.gtfs_poller import gtfs_poller, MapBounds
from app.config import get_settings

settings = get_settings()


import logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan handler for startup/shutdown."""
    # Startup
    logger.info("Starting Dublin Bus ETA API...")

    # Start GTFS-RT poller (replaces Kafka)
    await gtfs_poller.start()
    logger.info("Startup complete - GTFS poller running")

    yield

    # Shutdown
    logger.info("Shutting down Dublin Bus ETA API...")
    await gtfs_poller.stop()


app = FastAPI(
    title="Dublin Bus ETA API",
    description="Real-time bus arrival predictions for Dublin",
    version=settings.app_version,
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc",
)

# CORS middleware - allow all origins for MVP
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include REST routers
app.include_router(stops_router)
app.include_router(arrivals_router)
app.include_router(tracking_router)
app.include_router(eta_router)
app.include_router(routes_router)
app.include_router(health_router)
app.include_router(vehicles_router)


@app.get("/")
async def root():
    """Root endpoint with API info."""
    return {
        "name": "Dublin Bus ETA API",
        "version": settings.app_version,
        "docs": "/docs",
    }


@app.websocket("/ws/vehicles")
async def vehicles_websocket(websocket: WebSocket):
    """
    WebSocket endpoint for real-time vehicle updates.

    Client sends: { "type": "subscribe_bounds", "bounds": { "north": float, "south": float, "east": float, "west": float } }
    Server sends: { "type": "vehicle_updates", "ts": "ISO timestamp", "vehicles": [...] }
    """
    await websocket.accept()
    logger.info("[WS] Client connected")

    client = gtfs_poller.register_client(websocket)

    # Send initial confirmation
    await websocket.send_json({
        "type": "connected",
        "message": "Send subscribe_bounds to start receiving updates",
        "vehicle_count": len(gtfs_poller.latest_by_trip_id)
    })

    try:
        while True:
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
                            await websocket.send_json({
                                "type": "vehicle_updates",
                                "ts": datetime.now(timezone.utc).isoformat(),
                                "vehicles": vehicles
                            })

                        logger.info(f"[WS] Client subscribed to bounds, {len(vehicles)} vehicles")

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


"""
Recommended database indexes (do not run migrations, add as comments):

-- Stops spatial index for nearby queries
CREATE INDEX idx_stops_geom ON stops USING GIST(geom);

-- Stop times indexes for arrival lookups
CREATE INDEX idx_stop_times_trip_seq ON stop_times(trip_id, stop_sequence);
CREATE INDEX idx_stop_times_stop ON stop_times(stop_id);

-- Bus weather merged indexes for real-time data
CREATE INDEX idx_bwm_vehicle_ts ON bus_weather_merged(vehicle_timestamp DESC);
CREATE INDEX idx_bwm_route_trip_vehicle ON bus_weather_merged(route_id, trip_id, vehicle_id);
CREATE INDEX idx_bwm_stop_seq ON bus_weather_merged(stop_id, stop_sequence);
"""
