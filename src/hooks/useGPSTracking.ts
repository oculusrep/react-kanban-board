import { useState, useEffect, useRef, useCallback } from 'react';

export interface GPSPosition {
  lat: number;
  lng: number;
  accuracy: number; // in meters
  heading?: number; // direction in degrees
  speed?: number; // in m/s
  timestamp: number;
}

export interface UseGPSTrackingOptions {
  enableHighAccuracy?: boolean; // More accurate but uses more battery
  maximumAge?: number; // How old cached position can be (ms)
  timeout?: number; // Max time to wait for position (ms)
  distanceFilter?: number; // Minimum distance (meters) before update
}

export interface UseGPSTrackingReturn {
  position: GPSPosition | null;
  error: GeolocationPositionError | null;
  isTracking: boolean;
  startTracking: () => void;
  stopTracking: () => void;
  toggleTracking: () => void;
}

/**
 * Custom hook for GPS tracking using watchPosition API
 * Optimized for battery conservation on mobile devices
 *
 * @param options Configuration options for geolocation
 * @returns GPS tracking state and controls
 */
export const useGPSTracking = (
  options: UseGPSTrackingOptions = {}
): UseGPSTrackingReturn => {
  const {
    enableHighAccuracy = false, // Default to low accuracy for battery savings
    maximumAge = 30000, // Cache position for 30 seconds
    timeout = 10000, // 10 second timeout
    distanceFilter = 10 // Only update if moved 10+ meters
  } = options;

  const [position, setPosition] = useState<GPSPosition | null>(null);
  const [error, setError] = useState<GeolocationPositionError | null>(null);
  const [isTracking, setIsTracking] = useState(false);

  const watchIdRef = useRef<number | null>(null);
  const lastPositionRef = useRef<GPSPosition | null>(null);

  /**
   * Calculate distance between two coordinates using Haversine formula
   * Returns distance in meters
   */
  const calculateDistance = useCallback((
    pos1: { lat: number; lng: number },
    pos2: { lat: number; lng: number }
  ): number => {
    const R = 6371e3; // Earth's radius in meters
    const φ1 = (pos1.lat * Math.PI) / 180;
    const φ2 = (pos2.lat * Math.PI) / 180;
    const Δφ = ((pos2.lat - pos1.lat) * Math.PI) / 180;
    const Δλ = ((pos2.lng - pos1.lng) * Math.PI) / 180;

    const a =
      Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
      Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
  }, []);

  /**
   * Start GPS tracking using watchPosition
   */
  const startTracking = useCallback(() => {
    if (!navigator.geolocation) {
      console.error('❌ Geolocation not supported by browser');
      setError({
        code: 0,
        message: 'Geolocation not supported',
        PERMISSION_DENIED: 1,
        POSITION_UNAVAILABLE: 2,
        TIMEOUT: 3
      } as GeolocationPositionError);
      return;
    }

    if (watchIdRef.current !== null) {
      console.log('⚠️ GPS tracking already active');
      return;
    }

    console.log('🛰️ Starting GPS tracking...');
    setIsTracking(true);
    setError(null);

    // Success callback
    const onSuccess = (geoPosition: GeolocationPosition) => {
      const newPosition: GPSPosition = {
        lat: geoPosition.coords.latitude,
        lng: geoPosition.coords.longitude,
        accuracy: geoPosition.coords.accuracy,
        heading: geoPosition.coords.heading ?? undefined,
        speed: geoPosition.coords.speed ?? undefined,
        timestamp: geoPosition.timestamp
      };

      // Apply distance filter to reduce updates
      if (lastPositionRef.current) {
        const distance = calculateDistance(
          lastPositionRef.current,
          newPosition
        );

        if (distance < distanceFilter) {
          console.log(`📍 Position update skipped (moved ${distance.toFixed(1)}m < ${distanceFilter}m)`);
          return;
        }

        console.log(`📍 Position updated (moved ${distance.toFixed(1)}m)`);
      } else {
        console.log('📍 Initial position acquired');
      }

      lastPositionRef.current = newPosition;
      setPosition(newPosition);
      setError(null);
    };

    // Error callback
    const onError = (geoError: GeolocationPositionError) => {
      console.error('❌ GPS tracking error:', geoError.message);
      setError(geoError);

      // Log specific error types
      switch (geoError.code) {
        case 1:
          console.error('Permission denied - user blocked location access');
          break;
        case 2:
          console.error('Position unavailable - GPS signal lost');
          break;
        case 3:
          console.error('Timeout - took too long to get position');
          break;
      }
    };

    // Start watching position
    try {
      const watchId = navigator.geolocation.watchPosition(
        onSuccess,
        onError,
        {
          enableHighAccuracy,
          maximumAge,
          timeout
        }
      );

      watchIdRef.current = watchId;
      console.log('✅ GPS tracking started (watchId:', watchId, ')');
    } catch (err) {
      console.error('❌ Failed to start GPS tracking:', err);
      setIsTracking(false);
    }
  }, [enableHighAccuracy, maximumAge, timeout, distanceFilter, calculateDistance]);

  /**
   * Stop GPS tracking
   */
  const stopTracking = useCallback(() => {
    if (watchIdRef.current !== null) {
      console.log('🛑 Stopping GPS tracking (watchId:', watchIdRef.current, ')');
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setIsTracking(false);
      console.log('✅ GPS tracking stopped');
    }
  }, []);

  /**
   * Toggle GPS tracking on/off
   */
  const toggleTracking = useCallback(() => {
    if (isTracking) {
      stopTracking();
    } else {
      startTracking();
    }
  }, [isTracking, startTracking, stopTracking]);

  /**
   * Cleanup on unmount
   */
  useEffect(() => {
    return () => {
      if (watchIdRef.current !== null) {
        console.log('🧹 Cleaning up GPS tracking on unmount');
        navigator.geolocation.clearWatch(watchIdRef.current);
        watchIdRef.current = null;
      }
    };
  }, []);

  return {
    position,
    error,
    isTracking,
    startTracking,
    stopTracking,
    toggleTracking
  };
};
