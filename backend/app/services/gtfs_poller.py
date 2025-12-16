"""
GTFS-RT Poller Service

Polls NTA GTFS-RT API every 2 seconds and stores latest vehicle positions in memory.
Broadcasts updates to WebSocket clients based on their subscribed map bounds.
"""

import asyncio
import logging
import time
from datetime import datetime, timezone
from typing import Dict, List, Optional, Any
from dataclasses import dataclass, field

import httpx

# GTFS-RT Protobuf parsing
try:
    from google.transit import gtfs_realtime_pb2
    GTFS_AVAILABLE = True
except ImportError:
    GTFS_AVAILABLE = False

logger = logging.getLogger(__name__)

# Configuration
NTA_API_URL = "https://api.nationaltransport.ie/gtfsr/v2/Vehicles"
NTA_API_KEY = "a8d1f68c87cc441d9ba7fda4bb6989d3"
POLL_INTERVAL = 15.0  # seconds (NTA API rate limits aggressively)


@dataclass
class VehiclePosition:
    """Thin vehicle position payload."""
    trip_id: str
    route_id: str
    direction_id: int
    vehicle_id: str
    timestamp: int
    latitude: float
    longitude: float
    bearing: Optional[float] = None
    speed: Optional[float] = None

    def to_dict(self) -> dict:
        """Convert to dictionary for JSON serialization."""
        data = {
            "trip_id": self.trip_id,
            "route_id": self.route_id,
            "direction_id": self.direction_id,
            "vehicle_id": self.vehicle_id,
            "timestamp": self.timestamp,
            "latitude": self.latitude,
            "longitude": self.longitude,
        }
        if self.bearing is not None:
            data["bearing"] = self.bearing
        if self.speed is not None:
            data["speed"] = self.speed
        return data


@dataclass
class MapBounds:
    """Map viewport bounds."""
    north: float
    south: float
    east: float
    west: float

    def contains(self, lat: float, lon: float) -> bool:
        """Check if a point is within bounds."""
        return (self.south <= lat <= self.north and
                self.west <= lon <= self.east)


class WebSocketClient:
    """Represents a connected WebSocket client with bounds subscription."""
    def __init__(self, websocket: Any):
        self.websocket = websocket
        self.bounds: Optional[MapBounds] = None
        self.subscribed: bool = False


class GTFSPoller:
    """
    Polls GTFS-RT API and manages vehicle state.
    """

    def __init__(self):
        self.latest_by_trip_id: Dict[str, VehiclePosition] = {}
        self.clients: List[WebSocketClient] = []
        self._running = False
        self._task: Optional[asyncio.Task] = None
        self._http_client: Optional[httpx.AsyncClient] = None
        self._last_poll_time: Optional[datetime] = None
        self._poll_count = 0
        self._vehicle_count = 0

    async def start(self):
        """Start the polling background task."""
        if self._running:
            logger.info("[GTFS] Poller already running")
            return

        self._running = True
        self._http_client = httpx.AsyncClient(timeout=10.0)
        self._task = asyncio.create_task(self._poll_loop())
        logger.info(f"[GTFS] Poller started - polling every {POLL_INTERVAL}s")

    async def stop(self):
        """Stop the polling background task."""
        self._running = False
        if self._task:
            self._task.cancel()
            try:
                await self._task
            except asyncio.CancelledError:
                pass
        if self._http_client:
            await self._http_client.aclose()
        logger.info("[GTFS] Poller stopped")

    async def _poll_loop(self):
        """Main polling loop."""
        while self._running:
            try:
                await self._poll_and_broadcast()
            except Exception as e:
                logger.error(f"[GTFS] Poll error: {e}")

            await asyncio.sleep(POLL_INTERVAL)

    async def _poll_and_broadcast(self):
        """Fetch GTFS-RT data and broadcast to clients."""
        vehicles = await self._fetch_vehicles()

        if vehicles:
            # Update in-memory store
            for v in vehicles:
                self.latest_by_trip_id[v.trip_id] = v

            self._vehicle_count = len(self.latest_by_trip_id)
            self._poll_count += 1
            self._last_poll_time = datetime.now(timezone.utc)

            if self._poll_count % 30 == 1:  # Log every minute
                logger.info(f"[GTFS] Poll #{self._poll_count}: {len(vehicles)} vehicles, "
                           f"{len(self.clients)} clients")

            # Broadcast to subscribed clients
            await self._broadcast_updates(vehicles)

    async def _fetch_vehicles(self) -> List[VehiclePosition]:
        """Fetch and parse GTFS-RT vehicle positions."""
        if not GTFS_AVAILABLE:
            logger.warning("[GTFS] gtfs-realtime-bindings not installed")
            return []

        try:
            response = await self._http_client.get(
                NTA_API_URL,
                headers={
                    "x-api-key": NTA_API_KEY,
                    "Accept": "application/octet-stream"
                }
            )

            if response.status_code == 429:
                logger.warning("[GTFS] Rate limited (429)")
                return []

            response.raise_for_status()
            return self._parse_gtfs(response.content)

        except httpx.RequestError as e:
            logger.warning(f"[GTFS] Request failed: {e}")
            return []

    def _parse_gtfs(self, data: bytes) -> List[VehiclePosition]:
        """Parse GTFS-RT protobuf into VehiclePosition list."""
        try:
            feed = gtfs_realtime_pb2.FeedMessage()
            feed.ParseFromString(data)

            vehicles = []
            for entity in feed.entity:
                if not entity.HasField('vehicle'):
                    continue

                v = entity.vehicle

                # Extract required fields (scalars - access directly)
                trip_id = v.trip.trip_id or ""
                if not trip_id:
                    continue

                lat = v.position.latitude
                lon = v.position.longitude

                # Skip invalid positions
                if lat == 0 and lon == 0:
                    continue

                vehicle = VehiclePosition(
                    trip_id=trip_id,
                    route_id=v.trip.route_id or "",
                    direction_id=v.trip.direction_id if v.trip.direction_id else 0,
                    vehicle_id=v.vehicle.id or v.vehicle.label or "",
                    timestamp=v.timestamp if v.timestamp else int(time.time()),
                    latitude=lat,
                    longitude=lon,
                    bearing=v.position.bearing if v.position.bearing else None,
                    speed=v.position.speed if v.position.speed else None,
                )
                vehicles.append(vehicle)

            return vehicles

        except Exception as e:
            logger.error(f"[GTFS] Parse error: {e}")
            return []

    async def _broadcast_updates(self, vehicles: List[VehiclePosition]):
        """Broadcast vehicle updates to all subscribed clients."""
        if not self.clients:
            return

        ts = datetime.now(timezone.utc).isoformat()
        dead_clients = []

        for client in list(self.clients):
            if not client.subscribed or client.bounds is None:
                continue

            # Filter vehicles within client's bounds
            filtered = [
                v.to_dict() for v in vehicles
                if client.bounds.contains(v.latitude, v.longitude)
            ]

            if not filtered:
                continue

            message = {
                "type": "vehicle_updates",
                "ts": ts,
                "vehicles": filtered
            }

            try:
                await asyncio.wait_for(
                    client.websocket.send_json(message),
                    timeout=5.0
                )
            except asyncio.TimeoutError:
                logger.warning("[GTFS] Client send timeout, removing")
                dead_clients.append(client)
            except Exception as e:
                logger.debug(f"[GTFS] Client send error: {e}")
                dead_clients.append(client)

        # Clean up dead clients
        for client in dead_clients:
            if client in self.clients:
                self.clients.remove(client)

    def get_all_vehicles(self) -> List[dict]:
        """Get current snapshot of all vehicles."""
        return [v.to_dict() for v in self.latest_by_trip_id.values()]

    def get_vehicles_in_bounds(self, bounds: MapBounds) -> List[dict]:
        """Get vehicles within specified bounds."""
        return [
            v.to_dict() for v in self.latest_by_trip_id.values()
            if bounds.contains(v.latitude, v.longitude)
        ]

    def register_client(self, websocket: Any) -> WebSocketClient:
        """Register a new WebSocket client."""
        client = WebSocketClient(websocket)
        self.clients.append(client)
        logger.info(f"[GTFS] Client registered, total: {len(self.clients)}")
        return client

    def unregister_client(self, client: WebSocketClient):
        """Unregister a WebSocket client."""
        if client in self.clients:
            self.clients.remove(client)
        logger.info(f"[GTFS] Client unregistered, total: {len(self.clients)}")

    def update_client_bounds(self, client: WebSocketClient, bounds: MapBounds):
        """Update a client's subscribed bounds."""
        client.bounds = bounds
        client.subscribed = True

    def get_status(self) -> dict:
        """Get poller status."""
        return {
            "running": self._running,
            "poll_count": self._poll_count,
            "vehicle_count": self._vehicle_count,
            "client_count": len(self.clients),
            "last_poll": self._last_poll_time.isoformat() if self._last_poll_time else None,
        }


# Singleton instance
gtfs_poller = GTFSPoller()
