import { useState, useEffect, useCallback, useRef, useLayoutEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { useVehiclesWebSocket, VehiclePosition, MapBounds } from '../hooks/useVehiclesWebSocket';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

const DEFAULT_CENTER: [number, number] = [
  parseFloat(import.meta.env.VITE_DEFAULT_LAT || '53.3498'),
  parseFloat(import.meta.env.VITE_DEFAULT_LON || '-6.2603'),
];

// Create bus icon
function createBusIcon(bearing?: number) {
  const rotation = bearing ? `transform: rotate(${bearing}deg);` : '';
  return L.divIcon({
    className: 'bus-marker',
    html: `<div style="
      width: 24px;
      height: 24px;
      background: #22c55e;
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 10px;
      ${rotation}
    ">
      <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor">
        <path d="M4 16c0 .88.39 1.67 1 2.22V20c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1h8v1c0 .55.45 1 1 1h1c.55 0 1-.45 1-1v-1.78c.61-.55 1-1.34 1-2.22V6c0-3.5-3.58-4-8-4s-8 .5-8 4v10zm3.5 1c-.83 0-1.5-.67-1.5-1.5S6.67 14 7.5 14s1.5.67 1.5 1.5S8.33 17 7.5 17zm9 0c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm1.5-6H6V6h12v5z"/>
      </svg>
    </div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

export function LiveMap() {
  const navigate = useNavigate();
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const markersRef = useRef<Map<string, L.Marker>>(new Map());

  const [vehicles, setVehicles] = useState<Map<string, VehiclePosition>>(new Map());
  const [initialLoading, setInitialLoading] = useState(true);
  const [selectedVehicle, setSelectedVehicle] = useState<VehiclePosition | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Handle vehicle updates from WebSocket
  const handleVehicleUpdates = useCallback((updates: VehiclePosition[]) => {
    setVehicles((prev) => {
      const next = new Map(prev);
      for (const v of updates) {
        next.set(v.trip_id, v);
      }
      return next;
    });
  }, []);

  // WebSocket connection
  const { connected, error, lastUpdate, subscribeToBounds } = useVehiclesWebSocket({
    onVehicleUpdates: handleVehicleUpdates,
  });

  // Get current map bounds
  const getMapBounds = useCallback((): MapBounds | null => {
    if (!mapRef.current) return null;
    const bounds = mapRef.current.getBounds();
    return {
      north: bounds.getNorth(),
      south: bounds.getSouth(),
      east: bounds.getEast(),
      west: bounds.getWest(),
    };
  }, []);

  // Subscribe to current viewport bounds
  const updateBoundsSubscription = useCallback(() => {
    const bounds = getMapBounds();
    if (bounds) {
      subscribeToBounds(bounds);
    }
  }, [getMapBounds, subscribeToBounds]);

  // Fetch initial vehicles
  useEffect(() => {
    const fetchInitialVehicles = async () => {
      try {
        const response = await fetch(`${API_URL}/api/vehicles`);
        if (!response.ok) throw new Error('Failed to fetch vehicles');

        const data = await response.json();
        const vehicleMap = new Map<string, VehiclePosition>();
        for (const v of data.vehicles) {
          vehicleMap.set(v.trip_id, v);
        }
        setVehicles(vehicleMap);
        console.log(`[API] Loaded ${data.count} vehicles`);
      } catch (err) {
        console.error('[API] Error fetching vehicles:', err);
      } finally {
        setInitialLoading(false);
      }
    };

    fetchInitialVehicles();
  }, []);

  // Initialize map (only once) - use useLayoutEffect to ensure DOM is ready
  useLayoutEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    // Ensure container has dimensions
    const container = mapContainerRef.current;
    console.log('[MAP] Container dimensions:', container.offsetWidth, container.offsetHeight);

    const map = L.map(container, {
      zoomControl: false,
    }).setView(DEFAULT_CENTER, 13);

    // Dark theme tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; OpenStreetMap',
      maxZoom: 19,
    }).addTo(map);

    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapRef.current = map;

    // Force map to recalculate size after a small delay
    setTimeout(() => {
      map.invalidateSize();
      console.log('[MAP] Size invalidated');
    }, 100);

    setMapReady(true);
    console.log('[MAP] Map initialized');

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Subscribe to bounds when map is ready and on move
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    // Subscribe to current bounds
    updateBoundsSubscription();

    // Subscribe on map move
    const map = mapRef.current;
    map.on('moveend', updateBoundsSubscription);

    return () => {
      map.off('moveend', updateBoundsSubscription);
    };
  }, [mapReady, updateBoundsSubscription]);

  // Update markers when vehicles change
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    console.log(`[MAP] Updating markers for ${vehicles.size} vehicles`);
    const currentTripIds = new Set(vehicles.keys());

    // Remove markers for vehicles no longer in view
    markersRef.current.forEach((marker, tripId) => {
      if (!currentTripIds.has(tripId)) {
        marker.remove();
        markersRef.current.delete(tripId);
      }
    });

    // Update or create markers
    vehicles.forEach((vehicle, tripId) => {
      const existingMarker = markersRef.current.get(tripId);

      if (existingMarker) {
        // Update position
        existingMarker.setLatLng([vehicle.latitude, vehicle.longitude]);
        existingMarker.setIcon(createBusIcon(vehicle.bearing));
      } else {
        // Create new marker
        const marker = L.marker([vehicle.latitude, vehicle.longitude], {
          icon: createBusIcon(vehicle.bearing),
        }).addTo(mapRef.current!);

        marker.on('click', () => {
          setSelectedVehicle(vehicle);
        });

        // Popup with vehicle info
        marker.bindPopup(`
          <div style="min-width: 150px;">
            <b>Route: ${vehicle.route_id || 'Unknown'}</b><br/>
            Vehicle: ${vehicle.vehicle_id || 'N/A'}<br/>
            Trip: ${vehicle.trip_id}<br/>
            Speed: ${vehicle.speed ? Math.round(vehicle.speed) + ' km/h' : 'N/A'}
          </div>
        `);

        markersRef.current.set(tripId, marker);
      }
    });
  }, [vehicles, mapReady]);

  return (
    <div className="min-h-screen bg-surface">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 z-[1000] bg-surface/90 backdrop-blur-sm border-b border-white/10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate('/')}
              className="text-white/60 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>
            <h1 className="text-xl font-bold text-white">Live Bus Map</h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Vehicle count */}
            <div className="text-white/60 text-sm">
              <span className="font-medium text-white">{vehicles.size}</span> buses
            </div>

            {/* Connection status */}
            <div className="flex items-center gap-2">
              <div
                className={`w-2.5 h-2.5 rounded-full ${
                  connected ? 'bg-green-500 animate-pulse' : 'bg-yellow-500'
                }`}
              />
              <span className={`text-sm ${connected ? 'text-green-400' : 'text-yellow-400'}`}>
                {connected ? 'Live' : 'Connecting...'}
              </span>
            </div>
          </div>
        </div>
      </header>

      {/* Map */}
      <div className="fixed top-14 left-0 right-0 bottom-0">
        <div ref={mapContainerRef} style={{ width: '100%', height: '100%' }} />
        {initialLoading && (
          <div className="absolute inset-0 flex items-center justify-center bg-surface/80 z-10">
            <div className="text-center">
              <div className="w-12 h-12 border-4 border-accent border-t-transparent rounded-full animate-spin mx-auto mb-4" />
              <p className="text-white/60">Loading buses...</p>
            </div>
          </div>
        )}
      </div>

      {/* Stats overlay */}
      <div className="fixed bottom-4 left-4 z-[1000] glass rounded-lg px-4 py-2">
        <div className="text-xs text-white/60">
          {lastUpdate ? (
            <>Last update: {lastUpdate.toLocaleTimeString()}</>
          ) : (
            <>Waiting for updates...</>
          )}
        </div>
      </div>

      {/* Error toast */}
      {error && (
        <div className="fixed bottom-4 right-4 z-[1000] bg-red-500/90 text-white px-4 py-2 rounded-lg">
          {error}
        </div>
      )}

      {/* Selected vehicle panel */}
      {selectedVehicle && (
        <div className="fixed bottom-4 right-4 z-[1000] glass rounded-xl p-4 min-w-[250px]">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-white font-medium">Bus Details</h3>
            <button
              onClick={() => setSelectedVehicle(null)}
              className="text-white/60 hover:text-white"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className="space-y-2 text-sm">
            <div className="flex justify-between">
              <span className="text-white/60">Route</span>
              <span className="text-white">{selectedVehicle.route_id || 'Unknown'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Vehicle ID</span>
              <span className="text-white">{selectedVehicle.vehicle_id || 'N/A'}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Trip ID</span>
              <span className="text-white font-mono text-xs">{selectedVehicle.trip_id}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Speed</span>
              <span className="text-white">
                {selectedVehicle.speed ? `${Math.round(selectedVehicle.speed)} km/h` : 'N/A'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-white/60">Direction</span>
              <span className="text-white">{selectedVehicle.direction_id === 0 ? 'Outbound' : 'Inbound'}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
