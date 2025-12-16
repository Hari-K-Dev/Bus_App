import { useState, useEffect } from 'react';

interface GeolocationState {
  latitude: number | null;
  longitude: number | null;
  error: string | null;
  loading: boolean;
}

const DEFAULT_LAT = parseFloat(import.meta.env.VITE_DEFAULT_LAT || '53.3498');
const DEFAULT_LON = parseFloat(import.meta.env.VITE_DEFAULT_LON || '-6.2603');

export function useGeolocation(options?: PositionOptions) {
  const [state, setState] = useState<GeolocationState>({
    latitude: null,
    longitude: null,
    error: null,
    loading: true,
  });

  useEffect(() => {
    if (!navigator.geolocation) {
      setState({
        latitude: DEFAULT_LAT,
        longitude: DEFAULT_LON,
        error: 'Geolocation not supported',
        loading: false,
      });
      return;
    }

    const successHandler = (position: GeolocationPosition) => {
      setState({
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        error: null,
        loading: false,
      });
    };

    const errorHandler = (error: GeolocationPositionError) => {
      // Fall back to Dublin center on error
      setState({
        latitude: DEFAULT_LAT,
        longitude: DEFAULT_LON,
        error: error.message,
        loading: false,
      });
    };

    navigator.geolocation.getCurrentPosition(
      successHandler,
      errorHandler,
      {
        enableHighAccuracy: true,
        timeout: 10000,
        maximumAge: 300000, // 5 minutes
        ...options,
      }
    );
  }, []);

  return state;
}
