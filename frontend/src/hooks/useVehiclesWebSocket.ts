import { useEffect, useRef, useState, useCallback } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:8080';

export interface VehiclePosition {
  trip_id: string;
  route_id: string;
  direction_id: number;
  vehicle_id: string;
  timestamp: number;
  latitude: number;
  longitude: number;
  bearing?: number;
  speed?: number;
}

export interface MapBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

interface VehicleUpdatesMessage {
  type: 'vehicle_updates';
  ts: string;
  vehicles: VehiclePosition[];
}

interface ConnectedMessage {
  type: 'connected';
  message: string;
  vehicle_count: number;
}

interface BoundsSetMessage {
  type: 'bounds_set';
  bounds: MapBounds;
  vehicle_count: number;
}

type WSMessage = VehicleUpdatesMessage | ConnectedMessage | BoundsSetMessage | { type: 'pong' };

interface UseVehiclesWebSocketOptions {
  onVehicleUpdates?: (vehicles: VehiclePosition[]) => void;
  autoConnect?: boolean;
}

interface UseVehiclesWebSocketReturn {
  connected: boolean;
  vehicleCount: number;
  error: string | null;
  lastUpdate: Date | null;
  subscribeToBounds: (bounds: MapBounds) => void;
}

export function useVehiclesWebSocket({
  onVehicleUpdates,
  autoConnect = true,
}: UseVehiclesWebSocketOptions = {}): UseVehiclesWebSocketReturn {
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const pendingBoundsRef = useRef<MapBounds | null>(null);
  const onVehicleUpdatesRef = useRef(onVehicleUpdates);

  const [connected, setConnected] = useState(false);
  const [vehicleCount, setVehicleCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  // Keep callback ref updated
  useEffect(() => {
    onVehicleUpdatesRef.current = onVehicleUpdates;
  }, [onVehicleUpdates]);

  const sendBounds = useCallback((bounds: MapBounds) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      const message = {
        type: 'subscribe_bounds',
        bounds,
      };
      wsRef.current.send(JSON.stringify(message));
      console.log('[WS] Subscribed to bounds:', bounds);
    }
  }, []);

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      return;
    }

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
    }

    const url = `${WS_URL}/ws/vehicles`;
    console.log(`[WS] Connecting to ${url}`);
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      setError(null);
      console.log('[WS] Connected');

      // Send pending bounds if any
      if (pendingBoundsRef.current) {
        sendBounds(pendingBoundsRef.current);
        pendingBoundsRef.current = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const message: WSMessage = JSON.parse(event.data);

        switch (message.type) {
          case 'vehicle_updates':
            setLastUpdate(new Date());
            setVehicleCount(message.vehicles.length);
            onVehicleUpdatesRef.current?.(message.vehicles);
            break;

          case 'connected':
            console.log(`[WS] ${message.message}, ${message.vehicle_count} vehicles available`);
            setVehicleCount(message.vehicle_count);
            break;

          case 'bounds_set':
            console.log(`[WS] Bounds set, ${message.vehicle_count} vehicles in view`);
            setVehicleCount(message.vehicle_count);
            break;

          case 'pong':
            // Heartbeat response
            break;
        }
      } catch (e) {
        console.error('[WS] Failed to parse message:', e);
      }
    };

    ws.onerror = () => {
      setError('WebSocket connection error');
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      console.log('[WS] Disconnected');

      // Reconnect after 3 seconds
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log('[WS] Attempting reconnect...');
        connect();
      }, 3000);
    };
  }, [sendBounds]);

  const subscribeToBounds = useCallback((bounds: MapBounds) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      sendBounds(bounds);
    } else {
      // Store bounds to send when connected
      pendingBoundsRef.current = bounds;
    }
  }, [sendBounds]);

  useEffect(() => {
    if (autoConnect) {
      connect();
    }

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      if (wsRef.current) {
        wsRef.current.close();
        wsRef.current = null;
      }
    };
  }, [autoConnect, connect]);

  return {
    connected,
    vehicleCount,
    error,
    lastUpdate,
    subscribeToBounds,
  };
}
