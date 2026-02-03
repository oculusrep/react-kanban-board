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
 * Calculate driving distance and time using Google Distance Matrix API
 * Simple version that accepts an optional departure time directly
 */
export async function calculateDrivingDistance(
  origin: LatLng,
  destination: LatLng,
  departureTime?: Date
): Promise<DrivingDistanceResult> {
  return new Promise((resolve, reject) => {
    console.log('📡 Distance Matrix API: Initializing service...');

    if (!window.google?.maps?.DistanceMatrixService) {
      reject(new Error('Google Maps Distance Matrix Service not available'));
      return;
    }

    const service = new google.maps.DistanceMatrixService();
    console.log('📡 Distance Matrix API: Service created, making request...');

    service.getDistanceMatrix(
      {
        origins: [new google.maps.LatLng(origin.lat, origin.lng)],
        destinations: [new google.maps.LatLng(destination.lat, destination.lng)],
        travelMode: google.maps.TravelMode.DRIVING,
        unitSystem: google.maps.UnitSystem.IMPERIAL, // Use miles
        drivingOptions: {
          departureTime: departureTime || new Date(), // For traffic estimates
          trafficModel: google.maps.TrafficModel.BEST_GUESS,
        },
      },
      (response, status) => {
        console.log('📡 Distance Matrix API response:', { status, response });

        if (status === 'OK' && response) {
          const element = response.rows[0].elements[0];
          console.log('📡 Distance Matrix element:', element);

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
      }
    );
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
 * Calculate departure time based on time-of-day selection
 */
export function getDepartureTime(timeOfDay: 'now' | 'morning' | 'evening' | 'weekend'): Date {
  const now = new Date();

  switch (timeOfDay) {
    case 'now':
      return now;

    case 'morning':
      // Today at 8:00 AM
      const morning = new Date();
      morning.setHours(8, 0, 0, 0);
      // If 8 AM has already passed today, use tomorrow
      if (morning < now) {
        morning.setDate(morning.getDate() + 1);
      }
      return morning;

    case 'evening':
      // Today at 5:00 PM
      const evening = new Date();
      evening.setHours(17, 0, 0, 0);
      // If 5 PM has already passed today, use tomorrow
      if (evening < now) {
        evening.setDate(evening.getDate() + 1);
      }
      return evening;

    case 'weekend':
      // Next Saturday at 10:00 AM
      const weekend = new Date();
      const daysUntilSaturday = (6 - weekend.getDay() + 7) % 7 || 7;
      weekend.setDate(weekend.getDate() + daysUntilSaturday);
      weekend.setHours(10, 0, 0, 0);
      return weekend;

    default:
      return now;
  }
}

/**
 * Get label for time-of-day selection
 */
export function getTimeLabel(timeOfDay: 'now' | 'morning' | 'evening' | 'weekend'): string {
  switch (timeOfDay) {
    case 'now':
      return 'Now';
    case 'morning':
      return 'Morning';
    case 'evening':
      return 'Evening';
    case 'weekend':
      return 'Weekend';
    default:
      return 'Now';
  }
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
 * Calculate driving distance with caching and full options support
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
  const includeTraffic = options?.includeTraffic ?? true;

  // Check cache first
  const cached = distanceCache.get(origin, destination, mode);
  if (cached) {
    return cached;
  }

  // Calculate using the Distance Matrix API with full options
  const result = await new Promise<DrivingDistanceResult>((resolve, reject) => {
    const service = new google.maps.DistanceMatrixService();

    const request: google.maps.DistanceMatrixRequest = {
      origins: [new google.maps.LatLng(origin.lat, origin.lng)],
      destinations: [new google.maps.LatLng(destination.lat, destination.lng)],
      travelMode: google.maps.TravelMode[mode],
      unitSystem: google.maps.UnitSystem.IMPERIAL,
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

  // Cache the result
  distanceCache.set(origin, destination, mode, result);

  return result;
}
