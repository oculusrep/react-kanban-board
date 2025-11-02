/**
 * Distance Calculation Service
 *
 * Provides utilities for calculating distances between geographic points:
 * - Straight-line distance (as the crow flies) using Haversine formula
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
