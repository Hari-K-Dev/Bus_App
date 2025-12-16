import type { StopNear } from '../types';

interface StopsListProps {
  stops: StopNear[];
  loading: boolean;
  onStopSelect: (stop: StopNear) => void;
}

export function StopsList({ stops, loading, onStopSelect }: StopsListProps) {
  if (loading) {
    return (
      <div className="flex flex-col gap-3">
        {[...Array(3)].map((_, i) => (
          <div key={i} className="glass rounded-xl p-4 animate-pulse">
            <div className="h-5 bg-white/10 rounded w-3/4 mb-2" />
            <div className="h-4 bg-white/10 rounded w-1/2" />
          </div>
        ))}
      </div>
    );
  }

  if (stops.length === 0) {
    return (
      <div className="text-center py-8 text-white/50">
        No stops found nearby
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      {stops.map((stop) => (
        <button
          key={stop.stopId}
          onClick={() => onStopSelect(stop)}
          className="glass rounded-xl p-4 text-left hover:bg-white/10
                     transition-all group"
        >
          <div className="flex items-center justify-between">
            <div>
              <div className="text-white font-medium group-hover:text-accent-light transition-colors">
                {stop.stopName}
              </div>
              <div className="text-white/50 text-sm">
                Stop ID: {stop.stopId}
              </div>
            </div>
            <div className="text-right">
              <div className="text-accent font-semibold">
                {Math.round(stop.distanceM)}m
              </div>
              <div className="text-white/50 text-xs">away</div>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
}
