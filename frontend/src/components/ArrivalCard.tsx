import type { Arrival } from '../types';

interface ArrivalCardProps {
  arrival: Arrival;
  onClick?: () => void;
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
  });
}

function getSourceColor(source: string): string {
  return source === 'model' ? 'bg-green-500/20 text-green-400' : 'bg-blue-500/20 text-blue-400';
}

function getCountdownColor(seconds: number): string {
  if (seconds <= 120) return 'text-green-400';
  if (seconds <= 300) return 'text-yellow-400';
  return 'text-white';
}

export function ArrivalCard({ arrival, onClick }: ArrivalCardProps) {
  const isDue = arrival.etaSeconds <= 60;

  return (
    <div
      onClick={onClick}
      className={`glass rounded-xl p-4 hover:bg-white/10 transition-all
                  ${onClick ? 'cursor-pointer' : ''}`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-3">
          <span className="bg-accent text-white font-bold px-3 py-1.5 rounded-lg text-lg">
            {arrival.routeShortName}
          </span>
          <div>
            <div className="text-white font-medium">
              {arrival.headsign || 'Unknown destination'}
            </div>
            {arrival.vehicleId && (
              <div className="text-white/50 text-sm">
                Vehicle: {arrival.vehicleId}
              </div>
            )}
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded-full ${getSourceColor(arrival.source)}`}>
          {arrival.source}
        </span>
      </div>

      <div className="flex items-end justify-between">
        <div className="text-white/60 text-sm">
          <div>ETA: {formatTime(arrival.etaUtc)}</div>
          {arrival.speed !== null && (
            <div>{Math.round(arrival.speed)} km/h</div>
          )}
        </div>
        <div className="text-right">
          <div className={`text-3xl font-bold ${getCountdownColor(arrival.etaSeconds)}`}>
            {isDue ? (
              <span className="animate-pulse-soft">Due</span>
            ) : (
              formatCountdown(arrival.etaSeconds)
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
