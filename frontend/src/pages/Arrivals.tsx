import { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrivalCard } from '../components/ArrivalCard';
import { stopsApi } from '../services/api';
import type { Arrival } from '../types';

export function Arrivals() {
  const { stopId } = useParams<{ stopId: string }>();
  const navigate = useNavigate();
  const [arrivals, setArrivals] = useState<Arrival[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());

  const fetchArrivals = useCallback(async () => {
    if (!stopId) return;

    try {
      setLoading(true);
      const data = await stopsApi.getArrivals(stopId, 15);
      setArrivals(data);
      setError(null);
      setLastRefresh(new Date());
    } catch (err) {
      setError('Failed to load arrivals');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [stopId]);

  // Initial fetch and auto-refresh every 30 seconds
  useEffect(() => {
    fetchArrivals();
    const interval = setInterval(fetchArrivals, 30000);
    return () => clearInterval(interval);
  }, [fetchArrivals]);

  const handleArrivalClick = (arrival: Arrival) => {
    // Use vehicleId if available, otherwise use tripId
    const trackingId = arrival.vehicleId || arrival.tripId;
    const idType = arrival.vehicleId ? 'vehicle' : 'trip';
    navigate(`/tracking/${trackingId}?stopId=${stopId}&type=${idType}&routeId=${arrival.routeId}`);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-surface via-surface-light to-surface">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header */}
        <header className="mb-8">
          <button
            onClick={() => navigate('/')}
            className="text-white/60 hover:text-white mb-4 flex items-center gap-2 transition-colors"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </button>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-white">Arrivals</h1>
              <p className="text-white/60">Stop ID: {stopId}</p>
            </div>
            <button
              onClick={fetchArrivals}
              disabled={loading}
              className="glass px-4 py-2 rounded-lg hover:bg-white/10 transition-colors
                        flex items-center gap-2 disabled:opacity-50"
            >
              <svg
                className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                />
              </svg>
              Refresh
            </button>
          </div>
          <div className="text-white/40 text-sm mt-2">
            Last updated: {lastRefresh.toLocaleTimeString()}
          </div>
        </header>

        {/* Loading State */}
        {loading && arrivals.length === 0 && (
          <div className="flex flex-col gap-4">
            {[...Array(5)].map((_, i) => (
              <div key={i} className="glass rounded-xl p-4 animate-pulse">
                <div className="flex items-center gap-3 mb-3">
                  <div className="h-10 w-16 bg-white/10 rounded-lg" />
                  <div className="h-5 bg-white/10 rounded w-1/2" />
                </div>
                <div className="flex justify-between">
                  <div className="h-4 bg-white/10 rounded w-24" />
                  <div className="h-8 bg-white/10 rounded w-20" />
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Error State */}
        {error && (
          <div className="glass rounded-xl p-6 border-red-500/30 text-center">
            <div className="text-red-400 mb-4">{error}</div>
            <button
              onClick={fetchArrivals}
              className="bg-accent hover:bg-accent-light text-white px-6 py-2
                        rounded-lg transition-colors"
            >
              Try Again
            </button>
          </div>
        )}

        {/* Empty State */}
        {!loading && !error && arrivals.length === 0 && (
          <div className="text-center py-16 text-white/50">
            <svg
              className="w-16 h-16 mx-auto mb-4 opacity-50"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={1.5}
                d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-lg">No upcoming arrivals</p>
            <p className="text-sm mt-2">Check back later or try another stop</p>
          </div>
        )}

        {/* Arrivals List */}
        {arrivals.length > 0 && (
          <div className="flex flex-col gap-4">
            {arrivals.map((arrival, index) => (
              <ArrivalCard
                key={`${arrival.tripId}-${index}`}
                arrival={arrival}
                onClick={() => handleArrivalClick(arrival)}
              />
            ))}
          </div>
        )}

        {/* Hint */}
        {arrivals.length > 0 && arrivals.some(a => a.vehicleId) && (
          <p className="text-center text-white/40 text-sm mt-6">
            Tap an arrival with a vehicle ID to track it live
          </p>
        )}
      </div>
    </div>
  );
}
