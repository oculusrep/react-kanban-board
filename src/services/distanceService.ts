/**
 * Distance Calculation Service
 *
 * Provides utilities for calculating distances between geographic points:
 * - Straight-line distance (as the crow flies) using Haversine formula
 * - Driving distance and time using Google Distance Matrix API
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
    text: string;      // e.g., "5.2 mi"
    value: number;     // meters
  };
  duration: {
    text: string;      // e.g., "12 mins"
    value: number;     // seconds
  };
  durationInTraffic?: {
    text: string;
    value: number;
  };
  status: string;
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
 * Calculate driving distance and time using Google Distance Matrix API
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
  } else {
    return `${distance.miles.toFixed(2)} mi`;
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
