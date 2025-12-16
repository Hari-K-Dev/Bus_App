import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { Map } from '../components/Map';
import { ETACard } from '../components/ETACard';
import { useVehiclesWebSocket, VehiclePosition } from '../hooks/useVehiclesWebSocket';
import { etaApi } from '../services/api';
import type { VehicleTracking, ETAResponse } from '../types';

const API_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8080';

export function LiveTracking() {
  const { trackingId } = useParams<{ trackingId: string }>();
  const [searchParams] = useSearchParams();
  const stopId = searchParams.get('stopId');
  const idType = searchParams.get('type') || 'trip'; // 'vehicle' or 'trip'
  const routeId = searchParams.get('routeId');
  const navigate = useNavigate();

  const [vehicle, setVehicle] = useState<VehicleTracking | null>(null);
  const [eta, setEta] = useState<ETAResponse | null>(null);
  const [etaLoading, setEtaLoading] = useState(false);
  const [etaError, setEtaError] = useState<string | null>(null);
  const [initialLoading, setInitialLoading] = useState(true);
  const [noVehicleData, setNoVehicleData] = useState(false);
  const trackingIdRef = useRef(trackingId);

  // Keep ref updated
  useEffect(() => {
    trackingIdRef.current = trackingId;
  }, [trackingId]);

  // Handle WebSocket vehicle updates - filter for our specific trip
  const handleVehicleUpdates = useCallback((updates: VehiclePosition[]) => {
    const targetId = trackingIdRef.current;
    if (!targetId) return;

    // Find our vehicle by trip_id or vehicle_id
    const found = updates.find(v =>
      v.trip_id === targetId || v.vehicle_id === targetId
    );

    if (found) {
      setVehicle({
        vehicleId: found.vehicle_id,
        routeId: found.route_id,
        tripId: found.trip_id,
        lat: found.latitude,
        lon: found.longitude,
        bearing: found.bearing,
        speed: found.speed,
        lastUpdate: new Date(found.timestamp * 1000).toISOString(),
      });
      setNoVehicleData(false);
    }
  }, []);

  // WebSocket connection with wide bounds to catch the vehicle
  const { connected, error: wsError, lastUpdate, subscribeToBounds } = useVehiclesWebSocket({
    onVehicleUpdates: handleVehicleUpdates,
  });

  // Subscribe to wide Dublin area bounds
  useEffect(() => {
    if (connected) {
      // Subscribe to all of Dublin area
      subscribeToBounds({
        north: 53.5,
        south: 53.2,
        east: -6.0,
        west: -6.5,
      });
    }
  }, [connected, subscribeToBounds]);

  // Compute status display based on connection states
  const getStatusDisplay = () => {
    if (!connected) {
      return { color: 'bg-yellow-500', text: 'Connecting...', pulse: false };
    }
    if (!vehicle) {
      return { color: 'bg-blue-500', text: 'Waiting for bus...', pulse: true };
    }
    return { color: 'bg-green-500', text: 'Live', pulse: true };
  };

  const status = getStatusDisplay();

  // Fetch initial vehicle position from GTFS poller
  useEffect(() => {
    if (!trackingId) return;

    setInitialLoading(true);

    // Try to find vehicle in current GTFS data
    fetch(`${API_URL}/api/vehicles`)
      .then(res => res.json())
      .then(data => {
        const found = data.vehicles?.find((v: VehiclePosition) =>
          v.trip_id === trackingId || v.vehicle_id === trackingId
        );
        if (found) {
          setVehicle({
            vehicleId: found.vehicle_id,
            routeId: found.route_id,
            tripId: found.trip_id,
            lat: found.latitude,
            lon: found.longitude,
            bearing: found.bearing,
            speed: found.speed,
            lastUpdate: new Date(found.timestamp * 1000).toISOString(),
          });
          setNoVehicleData(false);
        } else {
          setNoVehicleData(true);
        }
      })
      .catch(() => {
        setNoVehicleData(true);
      })
      .finally(() => setInitialLoading(false));
  }, [trackingId]);

  // Fetch ETA
  const fetchEta = useCallback(async () => {
    if (!stopId || !trackingId) {
      setEtaError('Stop ID not provided');
      return;
    }

    setEtaLoading(true);
    setEtaError(null);

    try {
      const data = await etaApi.getETA(stopId, trackingId);
      setEta(data);
    } catch (err) {
      setEtaError('ETA not available - no real-time data');
      console.error(err);
    } finally {
      setEtaLoading(false);
    }
  }, [stopId, trackingId]);

  // Get display info
  const displayId = trackingId || 'Unknown';
  const displayType = idType === 'trip' ? 'Trip' : 'Vehicle';

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface via-surface-light to-surface">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <header className="mb-6">
          <button
            onClick={() => navigate(-1)}
            className="text-white/60 hover:text-white mb-4 flex items-center gap-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Live Tracking</h1>
              <p className="text-white/60">{displayType}: {displayId}</p>
              {routeId && <p className="text-white/40 text-sm">Route: {routeId}</p>}
            </div>
            <div className="flex items-center gap-2" title={`WebSocket: ${connected ? 'Connected' : 'Disconnected'}`}>
              <div
                className={`w-3 h-3 rounded-full ${status.color} ${status.pulse ? 'animate-pulse-soft' : ''}`}
              />
              <span className={`text-sm ${
                status.text === 'Live' ? 'text-green-400' :
                status.text === 'Waiting for bus...' ? 'text-blue-400' :
                'text-yellow-400'
              }`}>
                {status.text}
              </span>
            </div>
          </div>
          {wsError && <div className="text-yellow-400 text-sm mt-2">{wsError}</div>}
        </header>

        {/* Map */}
        <div className="h-[400px] mb-6 rounded-2xl overflow-hidden glass">
          {initialLoading ? (
            <div className="w-full h-full flex items-center justify-center">
              <div className="w-10 h-10 border-4 border-accent border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <Map
              vehicle={vehicle}
              center={vehicle ? [vehicle.lat, vehicle.lon] : undefined}
              zoom={vehicle ? 16 : 14}
            />
          )}
        </div>

        {/* No Vehicle Data Message */}
        {noVehicleData && !vehicle && (
          <div className="glass rounded-2xl p-6 mb-6 border-yellow-500/30">
            <div className="flex items-center gap-3 text-yellow-400 mb-3">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <span className="font-medium">No Real-Time Data Available</span>
            </div>
            <p className="text-white/60 text-sm">
              This {idType === 'trip' ? 'trip' : 'vehicle'} doesn't have live GPS data yet.
              The map will update automatically when the bus starts transmitting its position.
            </p>
          </div>
        )}

        {/* Vehicle Info */}
        {vehicle && (
          <div className="glass rounded-2xl p-6 mb-6">
            <h3 className="text-white/70 text-sm uppercase tracking-wide mb-4">
              Vehicle Status
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-white/50 text-sm">Vehicle ID</div>
                <div className="text-white font-medium">{vehicle.vehicleId}</div>
              </div>
              <div>
                <div className="text-white/50 text-sm">Route</div>
                <div className="text-white font-medium">{vehicle.routeId}</div>
              </div>
              <div>
                <div className="text-white/50 text-sm">Speed</div>
                <div className="text-white font-medium">
                  {vehicle.speed ? `${Math.round(vehicle.speed)} km/h` : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-white/50 text-sm">Position</div>
                <div className="text-white font-medium font-mono text-sm">
                  {vehicle.lat.toFixed(5)}, {vehicle.lon.toFixed(5)}
                </div>
              </div>
              <div>
                <div className="text-white/50 text-sm">Bearing</div>
                <div className="text-white font-medium">
                  {vehicle.bearing ? `${Math.round(vehicle.bearing)}°` : 'N/A'}
                </div>
              </div>
              <div>
                <div className="text-white/50 text-sm">Last Update</div>
                <div className="text-white font-medium">
                  {lastUpdate
                    ? lastUpdate.toLocaleTimeString()
                    : new Date(vehicle.lastUpdate).toLocaleTimeString()}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ETA Card */}
        {stopId && (
          <ETACard
            eta={eta}
            loading={etaLoading}
            error={etaError}
            onRefresh={fetchEta}
          />
        )}

        {/* No Stop ID Warning */}
        {!stopId && (
          <div className="glass rounded-2xl p-6 text-center">
            <div className="text-white/50">
              No stop selected. Go back and select an arrival to see ETA predictions.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
