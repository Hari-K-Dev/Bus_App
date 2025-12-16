import { useEffect, useRef, useCallback, useState } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import type { StopNear, VehicleTracking } from '../types';

interface BusMapProps {
  center?: [number, number];
  zoom?: number;
  stops?: StopNear[];
  vehicle?: VehicleTracking | null;
  selectedStopId?: string | null;
  onStopClick?: (stop: StopNear) => void;
}

const DEFAULT_CENTER: [number, number] = [
  parseFloat(import.meta.env.VITE_DEFAULT_LAT || '53.3498'),
  parseFloat(import.meta.env.VITE_DEFAULT_LON || '-6.2603'),
];

// Custom icons - created lazily to avoid SSR issues
function createStopIcon() {
  return L.divIcon({
    className: 'custom-stop-marker',
    html: `<div style="
      width: 12px;
      height: 12px;
      background: #6366f1;
      border: 2px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 8px rgba(0,0,0,0.3);
    "></div>`,
    iconSize: [16, 16],
    iconAnchor: [8, 8],
  });
}

function createSelectedStopIcon() {
  return L.divIcon({
    className: 'custom-stop-marker-selected',
    html: `<div style="
      width: 18px;
      height: 18px;
      background: #22c55e;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 12px rgba(34, 197, 94, 0.5);
    "></div>`,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
  });
}

function createBusIcon() {
  return L.divIcon({
    className: 'custom-bus-marker',
    html: `<div style="
      width: 32px;
      height: 32px;
      background: #22c55e;
      border: 3px solid white;
      border-radius: 50%;
      box-shadow: 0 2px 12px rgba(0,0,0,0.4);
      display: flex;
      align-items: center;
      justify-content: center;
      color: white;
      font-weight: bold;
      font-size: 14px;
    ">B</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
  });
}

export function BusMap({
  center = DEFAULT_CENTER,
  zoom = 14,
  stops = [],
  vehicle,
  selectedStopId,
  onStopClick,
}: BusMapProps) {
  const mapRef = useRef<L.Map | null>(null);
  const mapContainerRef = useRef<HTMLDivElement>(null);
  const stopMarkersRef = useRef<globalThis.Map<string, L.Marker>>(new globalThis.Map());
  const vehicleMarkerRef = useRef<L.Marker | null>(null);
  const [mapReady, setMapReady] = useState(false);

  // Initialize map
  useEffect(() => {
    if (!mapContainerRef.current || mapRef.current) return;

    const map = L.map(mapContainerRef.current, {
      zoomControl: false,
    }).setView(center, zoom);

    // Dark theme tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
      maxZoom: 19,
    }).addTo(map);

    // Add zoom control to bottom right
    L.control.zoom({ position: 'bottomright' }).addTo(map);

    mapRef.current = map;
    setMapReady(true);

    return () => {
      map.remove();
      mapRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Update center
  useEffect(() => {
    if (mapRef.current) {
      mapRef.current.setView(center, mapRef.current.getZoom());
    }
  }, [center]);

  // Handle stop click
  const handleStopClick = useCallback((stop: StopNear) => {
    if (onStopClick) {
      onStopClick(stop);
    }
  }, [onStopClick]);

  // Update stop markers
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    // Clear old markers
    stopMarkersRef.current.forEach((marker) => marker.remove());
    stopMarkersRef.current.clear();

    const stopIcon = createStopIcon();
    const selectedIcon = createSelectedStopIcon();

    // Add new markers
    stops.forEach((stop) => {
      const isSelected = stop.stopId === selectedStopId;
      const marker = L.marker([stop.lat, stop.lon], {
        icon: isSelected ? selectedIcon : stopIcon,
      })
        .addTo(mapRef.current!)
        .bindPopup(`<b>${stop.stopName}</b><br>Stop ID: ${stop.stopId}`);

      marker.on('click', () => handleStopClick(stop));
      stopMarkersRef.current.set(stop.stopId, marker);
    });
  }, [stops, selectedStopId, handleStopClick, mapReady]);

  // Update vehicle marker
  useEffect(() => {
    if (!mapRef.current || !mapReady) return;

    console.log('[Map] Vehicle marker update:', vehicle);

    if (vehicle) {
      if (vehicleMarkerRef.current) {
        // Update existing marker position (smooth transition)
        vehicleMarkerRef.current.setLatLng([vehicle.lat, vehicle.lon]);
      } else {
        // Create new marker
        console.log('[Map] Creating bus marker at:', vehicle.lat, vehicle.lon);
        vehicleMarkerRef.current = L.marker([vehicle.lat, vehicle.lon], {
          icon: createBusIcon(),
          zIndexOffset: 1000, // Ensure bus marker is on top
        })
          .addTo(mapRef.current)
          .bindPopup(
            `<b>Vehicle ${vehicle.vehicleId}</b><br>` +
            `Route: ${vehicle.routeId}<br>` +
            `Speed: ${vehicle.speed ? Math.round(vehicle.speed) + ' km/h' : 'N/A'}`
          );
      }

      // Center map on vehicle
      mapRef.current.setView([vehicle.lat, vehicle.lon], 16);
    } else if (vehicleMarkerRef.current) {
      vehicleMarkerRef.current.remove();
      vehicleMarkerRef.current = null;
    }
  }, [vehicle, mapReady]);

  return (
    <div
      ref={mapContainerRef}
      className="w-full h-full rounded-xl overflow-hidden"
      style={{ minHeight: '300px' }}
    />
  );
}

// Export as Map for backwards compatibility
export { BusMap as Map };
