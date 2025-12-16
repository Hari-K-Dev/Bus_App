// API Response Types

export interface StopNear {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
  distanceM: number;
}

export interface StopSearch {
  stopId: string;
  stopName: string;
  lat: number;
  lon: number;
}

export interface Arrival {
  routeId: string;
  routeShortName: string;
  headsign: string | null;
  tripId: string;
  vehicleId: string | null;
  etaSeconds: number;
  etaUtc: string;
  source: 'model' | 'schedule';
  lastUpdateAgeS: number | null;
  lat: number | null;
  lon: number | null;
  bearing: number | null;
  speed: number | null;
}

export interface VehicleTracking {
  vehicleId: string;
  routeId: string;
  tripId: string;
  lat: number;
  lon: number;
  bearing: number | null;
  speed: number | null;
  lastUpdate: string;
}

export interface ETAResponse {
  stopId: string;
  routeId: string;
  vehicleId: string;
  predictedDelayS: number;
  etaSeconds: number;
  etaUtc: string;
  source: 'model' | 'schedule';
  modelVersion: string | null;
}

export interface Route {
  routeId: string;
  routeShortName: string;
  routeLongName: string;
}

export interface HealthStatus {
  status: string;
  db: string;
  model: string;
  version: string;
}

// WebSocket Message Types

export interface WSVehicleUpdate {
  type: 'vehicle_update';
  data: {
    trip_id: string;
    route_id: string;
    vehicle_id: string;
    latitude: number;
    longitude: number;
    speed: number;
    bearing: number;
    vehicle_timestamp: number;
  };
}

export interface WSHeartbeat {
  type: 'heartbeat';
  timestamp: string;
  last_publish: string | null;
  kafka_connected: boolean;
  message_count: number;
}

export interface WSSubscribed {
  type: 'subscribed';
  vehicle_id: string;
}

export type WSMessage = WSVehicleUpdate | WSHeartbeat | WSSubscribed;
