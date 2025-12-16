import type { ETAResponse } from '../types';

interface ETACardProps {
  eta: ETAResponse | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}

function formatCountdown(seconds: number): string {
  if (seconds <= 60) return 'Due';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h ${remainingMinutes}m`;
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString('en-IE', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function formatDelay(seconds: number): string {
  if (seconds === 0) return 'On time';
  const minutes = Math.round(seconds / 60);
  if (minutes > 0) return `${minutes} min late`;
  return `${Math.abs(minutes)} min early`;
}

export function ETACard({ eta, loading, error, onRefresh }: ETACardProps) {
  if (loading) {
    return (
      <div className="glass rounded-2xl p-6 animate-pulse">
        <div className="h-8 bg-white/10 rounded w-1/2 mb-4" />
        <div className="h-16 bg-white/10 rounded w-3/4 mb-4" />
        <div className="h-4 bg-white/10 rounded w-full" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass rounded-2xl p-6 border-red-500/30">
        <div className="text-red-400 mb-4">{error}</div>
        <button
          onClick={onRefresh}
          className="bg-accent hover:bg-accent-light text-white px-4 py-2
                     rounded-lg transition-colors"
        >
          Retry
        </button>
      </div>
    );
  }

  if (!eta) {
    return (
      <div className="glass rounded-2xl p-6">
        <div className="text-white/50 text-center">
          Click "Get ETA" to fetch predicted arrival time
        </div>
        <button
          onClick={onRefresh}
          className="w-full mt-4 bg-accent hover:bg-accent-light text-white
                     py-3 rounded-xl font-medium transition-colors"
        >
          Get ETA
        </button>
      </div>
    );
  }

  const isDue = eta.etaSeconds <= 60;

  return (
    <div className="glass rounded-2xl p-6">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-white/70 text-sm uppercase tracking-wide">
          Estimated Arrival
        </h3>
        <span
          className={`text-xs px-2 py-1 rounded-full ${
            eta.source === 'model'
              ? 'bg-green-500/20 text-green-400'
              : 'bg-blue-500/20 text-blue-400'
          }`}
        >
          {eta.source === 'model' ? 'ML Prediction' : 'Schedule'}
        </span>
      </div>

      <div className="text-center mb-6">
        <div
          className={`text-5xl font-bold mb-2 ${
            isDue ? 'text-green-400 animate-pulse-soft' : 'text-white'
          }`}
        >
          {formatCountdown(eta.etaSeconds)}
        </div>
        <div className="text-white/60">
          Arriving at {formatTime(eta.etaUtc)}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="glass rounded-lg p-3">
          <div className="text-white/50 mb-1">Predicted Delay</div>
          <div
            className={`font-medium ${
              eta.predictedDelayS > 0 ? 'text-yellow-400' : 'text-green-400'
            }`}
          >
            {formatDelay(eta.predictedDelayS)}
          </div>
        </div>
        {eta.modelVersion && (
          <div className="glass rounded-lg p-3">
            <div className="text-white/50 mb-1">Model Version</div>
            <div className="text-white font-mono text-xs">
              {eta.modelVersion}
            </div>
          </div>
        )}
      </div>

      <button
        onClick={onRefresh}
        className="w-full mt-4 bg-white/10 hover:bg-white/20 text-white
                   py-3 rounded-xl font-medium transition-colors flex items-center
                   justify-center gap-2"
      >
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
          />
        </svg>
        Refresh ETA
      </button>
    </div>
  );
}
