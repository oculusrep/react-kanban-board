/// <reference types="google.maps" />
// Google routing calls for tours, behind a session cache. Every Directions / Distance
// Matrix request the tour map makes goes through here, so "how many calls does an edit
// make" has one answer: only when a cache key changes.
//
// API references (checked 2026-10-28):
//   Directions (JS):      https://developers.google.com/maps/documentation/javascript/directions
//     - max 25 waypoints (origin + destination extra)
//     - duration_in_traffic is ONLY returned when the request has no stopover waypoints,
//       so a multi-stop Directions call can't give traffic-aware legs. We never send
//       drivingOptions there (it would bill the Advanced SKU for nothing).
//   Distance Matrix (JS): https://developers.google.com/maps/documentation/javascript/distancematrix
//     - max 25 origins, 25 destinations, 100 elements per client-side request
//     - departureTime must be now or future; traffic requests bill as "Advanced"

export const MAX_ROUTE_STOPS = 25;
const MATRIX_MAX_ELEMENTS = 100;
const MATRIX_MAX_DIMENSION = 25;
const TRAFFIC_CONCURRENCY = 4;

export type DayRouteResult =
  | { ok: true; path: google.maps.LatLng[]; legSeconds: number[] }
  | { ok: false; status: string };

// Keyed by routeKey(points). Failures are cached too, so an edit that doesn't change the
// route never re-hits Google; use clearDayRoute() for an explicit retry.
const routeCache = new Map<string, Promise<DayRouteResult>>();
// Keyed by routeKey + departure ISO.
const trafficCache = new Map<string, Promise<number[] | null>>();

let requestCount = 0;
/** Total Google requests issued by this module in the session (dev/debug aid). */
export const tourGoogleRequestCount = () => requestCount;

const statusOf = (e: any): string => e?.code ?? e?.status ?? e?.message ?? String(e);

export function getDayRoute(
  svc: google.maps.DirectionsService,
  key: string,
  points: google.maps.LatLngLiteral[]
): Promise<DayRouteResult> {
  const cached = routeCache.get(key);
  if (cached) return cached;
  const p = (async (): Promise<DayRouteResult> => {
    requestCount++;
    try {
      const res = await svc.route({
        origin: points[0],
        destination: points[points.length - 1],
        waypoints: points.slice(1, -1).map((location) => ({ location, stopover: true })),
        travelMode: google.maps.TravelMode.DRIVING,
      });
      const route = res.routes[0];
      if (!route) return { ok: false, status: 'ZERO_RESULTS' };
      return { ok: true, path: route.overview_path, legSeconds: route.legs.map((l) => l.duration?.value ?? 0) };
    } catch (e) {
      return { ok: false, status: statusOf(e) };
    }
  })();
  routeCache.set(key, p);
  return p;
}

export function clearDayRoute(key: string) {
  routeCache.delete(key);
  for (const k of trafficCache.keys()) if (k.startsWith(`${key}#`)) trafficCache.delete(k);
}

// Traffic-aware seconds for each consecutive leg, one 1×1 Distance Matrix element per leg
// (cheapest in billed elements). Returns null if any leg lacks traffic data.
export function getTrafficLegs(
  svc: google.maps.DistanceMatrixService,
  key: string,
  points: google.maps.LatLngLiteral[],
  departure: Date
): Promise<number[] | null> {
  const cacheKey = `${key}#${departure.toISOString()}`;
  const cached = trafficCache.get(cacheKey);
  if (cached) return cached;
  const p = (async () => {
    const legs = points.slice(0, -1).map((o, i) => [o, points[i + 1]] as const);
    const out: (number | null)[] = new Array(legs.length).fill(null);
    for (let i = 0; i < legs.length; i += TRAFFIC_CONCURRENCY) {
      await Promise.all(
        legs.slice(i, i + TRAFFIC_CONCURRENCY).map(async ([o, d], k) => {
          requestCount++;
          try {
            const res = await svc.getDistanceMatrix({
              origins: [o],
              destinations: [d],
              travelMode: google.maps.TravelMode.DRIVING,
              drivingOptions: { departureTime: departure, trafficModel: google.maps.TrafficModel.BEST_GUESS },
            });
            const el = res.rows[0]?.elements[0];
            out[i + k] = el?.status === 'OK' ? (el.duration_in_traffic ?? el.duration).value : null;
          } catch {
            out[i + k] = null;
          }
        })
      );
    }
    return out.every((v) => v != null) ? (out as number[]) : null;
  })();
  trafficCache.set(cacheKey, p);
  return p;
}

// Full drive-time matrix (seconds), origins × destinations, chunked by origin rows to stay
// within 25 destinations / 100 elements per request. Throws on any missing element.
export async function getDriveMatrix(
  svc: google.maps.DistanceMatrixService,
  origins: google.maps.LatLngLiteral[],
  destinations: google.maps.LatLngLiteral[]
): Promise<number[][]> {
  if (destinations.length > MATRIX_MAX_DIMENSION) {
    throw new Error(`Too many stops to optimize (${destinations.length}; max ${MATRIX_MAX_DIMENSION})`);
  }
  const rowsPerRequest = Math.max(1, Math.min(MATRIX_MAX_DIMENSION, Math.floor(MATRIX_MAX_ELEMENTS / destinations.length)));
  const matrix: number[][] = [];
  for (let r = 0; r < origins.length; r += rowsPerRequest) {
    requestCount++;
    let res: google.maps.DistanceMatrixResponse;
    try {
      res = await svc.getDistanceMatrix({
        origins: origins.slice(r, r + rowsPerRequest),
        destinations,
        travelMode: google.maps.TravelMode.DRIVING,
      });
    } catch (e) {
      throw new Error(`Distance Matrix failed (${statusOf(e)})`);
    }
    res.rows.forEach((row, i) => {
      matrix[r + i] = row.elements.map((el, j) => {
        if (el.status !== 'OK') throw new Error(`No drive time between stops (${el.status}, row ${r + i}, col ${j})`);
        return el.duration.value;
      });
    });
  }
  return matrix;
}
