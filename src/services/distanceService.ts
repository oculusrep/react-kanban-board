/**
 * Distance Calculation Service
 *
 * Provides utilities for calculating distances between geographic points:
 * - Straight-line distance (as the crow flies) using Haversine formula
 * - Driving distance and time using Google Distance Matrix API
 * - Multiple modes: driving, walking, bicycling, transit
 */

export interface LatLng {
  lat: number;
  lng: number;
}

export interface StraightLineDistance {
  meters: number;
  kilometers: number;
  miles: number;
  feet: number;
}

export interface DrivingDistanceResult {
  distance: {
    text: string;
    value: number; // meters
  };
  duration: {
    text: string;
    value: number; // seconds
  };
  durationInTraffic?: {
    text: string;
    value: number; // seconds
  };
  status: string;
}

export type TravelMode = 'DRIVING' | 'WALKING' | 'BICYCLING' | 'TRANSIT';

/**
 * Calculate straight-line distance between two points using Haversine formula
 * This is "as the crow flies" distance
 */
export function calculateStraightLineDistance(
  point1: LatLng,
  point2: LatLng
): StraightLineDistance {
  const R = 6371000; // Earth's radius in meters

  const lat1Rad = (point1.lat * Math.PI) / 180;
  const lat2Rad = (point2.lat * Math.PI) / 180;
  const deltaLat = ((point2.lat - point1.lat) * Math.PI) / 180;
  const deltaLng = ((point2.lng - point1.lng) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) *
      Math.cos(lat2Rad) *
      Math.sin(deltaLng / 2) *
      Math.sin(deltaLng / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  const meters = R * c;

  return {
    meters,
    kilometers: meters / 1000,
    miles: meters / 1609.34,
    feet: meters * 3.28084,
  };
}

/**
 * Calculate straight-line distance using Google Maps Geometry library
 * Alternative to Haversine, uses Google's built-in method
 */
export function calculateStraightLineDistanceWithGoogle(
  point1: google.maps.LatLng | google.maps.LatLngLiteral,
  point2: google.maps.LatLng | google.maps.LatLngLiteral
): StraightLineDistance {
  const meters = google.maps.geometry.spherical.computeDistanceBetween(
    new google.maps.LatLng(point1),
    new google.maps.LatLng(point2)
  );

  return {
    meters,
    kilometers: meters / 1000,
    miles: meters / 1609.34,
    feet: meters * 3.28084,
  };
}

/**
 * Calculate driving distance and time between two points using Google Distance Matrix API
 * This considers actual roads and traffic
 */
export async function calculateDrivingDistance(
  origin: LatLng,
  destination: LatLng,
  options?: {
    mode?: TravelMode;
    departureTime?: Date;
    includeTraffic?: boolean;
  }
): Promise<DrivingDistanceResult> {
  const mode = options?.mode || 'DRIVING';
  const includeTraffic = options?.includeTraffic ?? true;

  return new Promise((resolve, reject) => {
    const service = new google.maps.DistanceMatrixService();

    const request: google.maps.DistanceMatrixRequest = {
      origins: [new google.maps.LatLng(origin.lat, origin.lng)],
      destinations: [new google.maps.LatLng(destination.lat, destination.lng)],
      travelMode: google.maps.TravelMode[mode],
      unitSystem: google.maps.UnitSystem.IMPERIAL, // Miles/feet
    };

    // Add traffic data for driving mode
    if (mode === 'DRIVING' && includeTraffic) {
      request.drivingOptions = {
        departureTime: options?.departureTime || new Date(),
        trafficModel: google.maps.TrafficModel.BEST_GUESS,
      };
    }

    service.getDistanceMatrix(request, (response, status) => {
      if (status === 'OK' && response) {
        const element = response.rows[0].elements[0];

        if (element.status === 'OK') {
          resolve({
            distance: element.distance,
            duration: element.duration,
            durationInTraffic: element.duration_in_traffic,
            status: element.status,
          });
        } else {
          reject(new Error(`Distance calculation failed: ${element.status}`));
        }
      } else {
        reject(new Error(`Distance Matrix API error: ${status}`));
      }
    });
  });
}

/**
 * Format distance for display
 */
export function formatDistance(distance: StraightLineDistance): string {
  if (distance.miles < 0.1) {
    return `${Math.round(distance.feet)} ft`;
  } else if (distance.miles < 10) {
    return `${distance.miles.toFixed(2)} mi`;
  } else {
    return `${Math.round(distance.miles)} mi`;
  }
}

/**
 * Format duration in seconds to human-readable string
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);

  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  } else {
    return `${minutes} min`;
  }
}

/**
 * Calculate distances to multiple destinations from a single origin
 * Useful for showing distances to multiple properties at once
 */
export async function calculateDistancesToMultiplePoints(
  origin: LatLng,
  destinations: LatLng[],
  options?: {
    mode?: TravelMode;
    includeTraffic?: boolean;
  }
): Promise<DrivingDistanceResult[]> {
  const mode = options?.mode || 'DRIVING';
  const includeTraffic = options?.includeTraffic ?? true;

  return new Promise((resolve, reject) => {
    const service = new google.maps.DistanceMatrixService();

    const request: google.maps.DistanceMatrixRequest = {
      origins: [new google.maps.LatLng(origin.lat, origin.lng)],
      destinations: destinations.map(dest => new google.maps.LatLng(dest.lat, dest.lng)),
      travelMode: google.maps.TravelMode[mode],
      unitSystem: google.maps.UnitSystem.IMPERIAL,
    };

    if (mode === 'DRIVING' && includeTraffic) {
      request.drivingOptions = {
        departureTime: new Date(),
        trafficModel: google.maps.TrafficModel.BEST_GUESS,
      };
    }

    service.getDistanceMatrix(request, (response, status) => {
      if (status === 'OK' && response) {
        const results: DrivingDistanceResult[] = response.rows[0].elements.map(element => ({
          distance: element.distance,
          duration: element.duration,
          durationInTraffic: element.duration_in_traffic,
          status: element.status,
        }));
        resolve(results);
      } else {
        reject(new Error(`Distance Matrix API error: ${status}`));
      }
    });
  });
}

/**
 * Cache for recent distance calculations to avoid redundant API calls
 */
class DistanceCache {
  private cache: Map<string, { result: DrivingDistanceResult; timestamp: number }>;
  private maxAge: number = 30 * 60 * 1000; // 30 minutes

  constructor() {
    this.cache = new Map();
  }

  private getCacheKey(origin: LatLng, destination: LatLng, mode: TravelMode): string {
    // Round to 4 decimal places (~11 meters precision) to improve cache hits
    const o = `${origin.lat.toFixed(4)},${origin.lng.toFixed(4)}`;
    const d = `${destination.lat.toFixed(4)},${destination.lng.toFixed(4)}`;
    return `${o}|${d}|${mode}`;
  }

  get(origin: LatLng, destination: LatLng, mode: TravelMode): DrivingDistanceResult | null {
    const key = this.getCacheKey(origin, destination, mode);
    const cached = this.cache.get(key);

    if (cached && Date.now() - cached.timestamp < this.maxAge) {
      return cached.result;
    }

    // Clean up expired entry
    if (cached) {
      this.cache.delete(key);
    }

    return null;
  }

  set(origin: LatLng, destination: LatLng, mode: TravelMode, result: DrivingDistanceResult): void {
    const key = this.getCacheKey(origin, destination, mode);
    this.cache.set(key, { result, timestamp: Date.now() });
  }

  clear(): void {
    this.cache.clear();
  }

  // Periodically clean up old entries
  cleanup(): void {
    const now = Date.now();
    for (const [key, value] of this.cache.entries()) {
      if (now - value.timestamp >= this.maxAge) {
        this.cache.delete(key);
      }
    }
  }
}

// Export a singleton cache instance
export const distanceCache = new DistanceCache();

/**
 * Calculate driving distance with caching
 */
export async function calculateDrivingDistanceWithCache(
  origin: LatLng,
  destination: LatLng,
  options?: {
    mode?: TravelMode;
    departureTime?: Date;
    includeTraffic?: boolean;
  }
): Promise<DrivingDistanceResult> {
  const mode = options?.mode || 'DRIVING';

  // Check cache first
  const cached = distanceCache.get(origin, destination, mode);
  if (cached) {
    return cached;
  }

  // Calculate and cache
  const result = await calculateDrivingDistance(origin, destination, options);
  distanceCache.set(origin, destination, mode, result);

  return result;
}
