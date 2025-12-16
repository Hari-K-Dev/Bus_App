import axios from 'axios';
import type {
  StopNear,
  StopSearch,
  Arrival,
  VehicleTracking,
  ETAResponse,
  Route,
  HealthStatus
} from '../types';

const API_BASE = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

const api = axios.create({
  baseURL: `${API_BASE}/v1`,
  timeout: 10000,
});

// Stops API
export const stopsApi = {
  getNearby: async (
    lat: number,
    lon: number,
    radius = 800,
    limit = 5
  ): Promise<StopNear[]> => {
    const { data } = await api.get('/stops/near', {
      params: { lat, lon, radius, limit },
    });
    return data;
  },

  search: async (q: string, limit = 20): Promise<StopSearch[]> => {
    const { data } = await api.get('/stops/search', {
      params: { q, limit },
    });
    return data;
  },

  getArrivals: async (stopId: string, limit = 10): Promise<Arrival[]> => {
    const { data } = await api.get(`/stops/${stopId}/arrivals`, {
      params: { limit },
    });
    return data;
  },
};

// Tracking API
export const trackingApi = {
  getVehicle: async (vehicleId: string): Promise<VehicleTracking> => {
    const { data } = await api.get(`/tracking/${vehicleId}`);
    return data;
  },
};

// ETA API
export const etaApi = {
  getETA: async (stopId: string, vehicleId: string): Promise<ETAResponse> => {
    const { data } = await api.get('/eta', {
      params: { stop_id: stopId, vehicle_id: vehicleId },
    });
    return data;
  },
};

// Routes API
export const routesApi = {
  getAll: async (): Promise<Route[]> => {
    const { data } = await api.get('/routes');
    return data;
  },
};

// Health API
export const healthApi = {
  check: async (): Promise<HealthStatus> => {
    const { data } = await api.get('/health');
    return data;
  },
};
