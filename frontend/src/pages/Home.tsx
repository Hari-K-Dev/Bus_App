import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SearchInput } from '../components/SearchInput';
import { StopsList } from '../components/StopsList';
import { Map } from '../components/Map';
import { useGeolocation } from '../hooks/useGeolocation';
import { stopsApi } from '../services/api';
import type { StopNear, StopSearch } from '../types';

export function Home() {
  const navigate = useNavigate();
  const { latitude, longitude, loading: geoLoading } = useGeolocation();
  const [nearbyStops, setNearbyStops] = useState<StopNear[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedStopId, setSelectedStopId] = useState<string | null>(null);

  // Fetch nearby stops when location is available
  useEffect(() => {
    if (latitude && longitude) {
      setLoading(true);
      stopsApi
        .getNearby(latitude, longitude, 800, 5)
        .then(setNearbyStops)
        .catch(console.error)
        .finally(() => setLoading(false));
    }
  }, [latitude, longitude]);

  const handleStopSelect = (stop: StopNear | StopSearch) => {
    setSelectedStopId(stop.stopId);
    navigate(`/arrivals/${stop.stopId}`);
  };

  const mapCenter: [number, number] | undefined =
    latitude && longitude ? [latitude, longitude] : undefined;

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface via-surface-light to-surface">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <header className="text-center mb-8">
          <h1 className="text-4xl font-bold text-white mb-2">Dublin Bus</h1>
          <p className="text-white/60">Real-time arrivals and tracking</p>

          {/* Live Map Button */}
          <button
            onClick={() => navigate('/map')}
            className="mt-4 inline-flex items-center gap-2 px-6 py-3 bg-accent hover:bg-accent/80 text-white font-medium rounded-xl transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 20l-5.447-2.724A1 1 0 013 16.382V5.618a1 1 0 011.447-.894L9 7m0 13l6-3m-6 3V7m6 10l4.553 2.276A1 1 0 0021 18.382V7.618a1 1 0 00-.553-.894L15 4m0 13V4m0 0L9 7" />
            </svg>
            View Live Bus Map
          </button>
        </header>

        {/* Search */}
        <div className="flex justify-center mb-8">
          <SearchInput onStopSelect={handleStopSelect} />
        </div>

        {/* Map */}
        <div className="h-[350px] mb-8 rounded-2xl overflow-hidden glass">
          <Map
            center={mapCenter}
            stops={nearbyStops}
            selectedStopId={selectedStopId}
            onStopClick={handleStopSelect}
          />
        </div>

        {/* Nearby Stops */}
        <section>
          <h2 className="text-xl font-semibold text-white mb-4 flex items-center gap-2">
            <svg className="w-5 h-5 text-accent" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
              />
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
              />
            </svg>
            {geoLoading ? 'Finding nearby stops...' : 'Stops Near You'}
          </h2>
          <StopsList
            stops={nearbyStops}
            loading={loading || geoLoading}
            onStopSelect={handleStopSelect}
          />
        </section>
      </div>
    </div>
  );
}
