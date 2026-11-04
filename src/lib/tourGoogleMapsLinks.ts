// "Open in Google Maps" hand-off links for a tour day.
//
// Google Maps URLs (Directions action):
//   https://developers.google.com/maps/documentation/urls/get-started#directions-action
//   https://www.google.com/maps/dir/?api=1&origin=..&destination=..&waypoints=a|b|c&travelmode=driving
// - origin / destination / waypoints accept "lat,lng"; we always send coordinates, never
//   addresses, so the app lands on the exact pin rather than a re-geocoded address.
// - waypoints are "|"-separated and capped at 9 (mobile limit — browsers allow more, but
//   the iPhone hand-off to the Google Maps app is the point of this feature).
// - Parameters must be URL-encoded (comma → %2C, pipe → %7C).
//
// So one URL carries at most 11 points: origin + 9 waypoints + destination. A longer day is
// split into legs, each leg's origin being the previous leg's destination.

export interface LatLngPoint {
  lat: number;
  lng: number;
}

export const GMAPS_MAX_WAYPOINTS = 9;
const MAX_POINTS_PER_URL = GMAPS_MAX_WAYPOINTS + 2;

const fmt = (p: LatLngPoint) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

export function googleMapsDirectionsUrl(points: LatLngPoint[]): string {
  if (points.length < 2) throw new Error('A directions link needs at least two points');
  if (points.length > MAX_POINTS_PER_URL) throw new Error(`At most ${MAX_POINTS_PER_URL} points per link`);
  const origin = points[0];
  const destination = points[points.length - 1];
  const waypoints = points.slice(1, -1);
  const params = [
    'api=1',
    `origin=${encodeURIComponent(fmt(origin))}`,
    `destination=${encodeURIComponent(fmt(destination))}`,
  ];
  if (waypoints.length) params.push(`waypoints=${encodeURIComponent(waypoints.map(fmt).join('|'))}`);
  params.push('travelmode=driving');
  return `https://www.google.com/maps/dir/?${params.join('&')}`;
}

/**
 * Split a day's full point sequence (start?, stops in tour order, end?) into Google Maps
 * links of ≤ 11 points. Consecutive legs share the boundary point. Returns [] when there
 * is nothing to drive (fewer than two points).
 */
export function googleMapsDayLegs(points: LatLngPoint[]): string[] {
  if (points.length < 2) return [];
  const step = MAX_POINTS_PER_URL - 1;
  const legs: string[] = [];
  for (let i = 0; i < points.length - 1; i += step) {
    legs.push(googleMapsDirectionsUrl(points.slice(i, i + MAX_POINTS_PER_URL)));
  }
  return legs;
}

/** start (or nothing — then stop 1 is the origin) → mapped stops in order → end (if set). */
export function dayPointSequence(
  start: LatLngPoint | null,
  stops: Array<{ lat: number | null; lng: number | null }>,
  end: LatLngPoint | null,
): LatLngPoint[] {
  const pts: LatLngPoint[] = [];
  if (start) pts.push(start);
  for (const s of stops) if (s.lat != null && s.lng != null) pts.push({ lat: s.lat, lng: s.lng });
  if (end) pts.push(end);
  return pts;
}
