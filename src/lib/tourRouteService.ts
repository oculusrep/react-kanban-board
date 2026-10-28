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

export type DayRouteResult =
  | { ok: true; path: google.maps.LatLng[]; legSeconds: number[] }
  | { ok: false; status: string };

// Keyed by routeKey(points). Failures are cached too, so an edit that doesn't change the
// route never re-hits Google; use clearDayRoute() for an explicit retry.
const routeCache = new Map<string, Promise<DayRouteResult>>();

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
}

// ---------------------------------------------------------------------------
// Traffic-aware legs with CHAINED departures.
// Leg k departs at (arrival at its origin point + that point's service minutes); the first
// point is "arrived at" at day start. Each leg is one 1×1 Distance Matrix element (cheapest
// in billed elements), requested sequentially because each departure depends on the
// previous leg's traffic time.
//
// Cache: per leg (origin→destination coords), a list of fetched departures. A leg is reused
// when a cached departure is within DEPARTURE_TOLERANCE of the new one, so an upstream edit
// only re-requests downstream legs once it shifts their departure by 15+ minutes. Requests
// go out at departures snapped to 15-minute buckets to keep the hit rate up.
// ---------------------------------------------------------------------------

const BUCKET_MS = 15 * 60 * 1000;
const DEPARTURE_TOLERANCE_MS = 15 * 60 * 1000;

interface LegEntry {
  forMs: number; // the leg's actual (unsnapped) departure when fetched — tolerance anchor
  p: Promise<number | null>;
}
const legCache = new Map<string, LegEntry[]>();

const coordKey = (p: google.maps.LatLngLiteral) => `${p.lat.toFixed(6)},${p.lng.toFixed(6)}`;

// Snap to the nearest 15-min bucket, but never into the past (Google rejects past times).
function bucketDeparture(ms: number, nowMs: number): number {
  let b = Math.round(ms / BUCKET_MS) * BUCKET_MS;
  if (b <= nowMs) b = Math.ceil((nowMs + 1) / BUCKET_MS) * BUCKET_MS;
  return b;
}

function getLegTraffic(
  svc: google.maps.DistanceMatrixService,
  from: google.maps.LatLngLiteral,
  to: google.maps.LatLngLiteral,
  departureMs: number
): Promise<number | null> {
  const key = `${coordKey(from)}>${coordKey(to)}`;
  const entries = legCache.get(key) ?? [];
  let best: LegEntry | null = null;
  for (const e of entries) {
    const d = Math.abs(e.forMs - departureMs);
    if (d < DEPARTURE_TOLERANCE_MS && (!best || d < Math.abs(best.forMs - departureMs))) best = e;
  }
  if (best) return best.p;

  const depMs = bucketDeparture(departureMs, Date.now());
  const p = (async () => {
    requestCount++;
    try {
      const res = await svc.getDistanceMatrix({
        origins: [from],
        destinations: [to],
        travelMode: google.maps.TravelMode.DRIVING,
        drivingOptions: { departureTime: new Date(depMs), trafficModel: google.maps.TrafficModel.BEST_GUESS },
      });
      const el = res.rows[0]?.elements[0];
      return el?.status === 'OK' ? (el.duration_in_traffic ?? el.duration).value : null;
    } catch {
      return null;
    }
  })();
  entries.push({ forMs: departureMs, p });
  legCache.set(key, entries);
  return p;
}

// points: the routed points in order (start address?, stops, end address?).
// serviceMinutes: minutes spent at each point (0 for start/end addresses).
// typicalLegSeconds: the Directions leg times, used to keep the chain going if a leg has
// no traffic data. Returns null when any leg lacked traffic data (caller labels the day
// "typical"), else per-leg traffic seconds.
export async function getChainedTrafficLegs(
  svc: google.maps.DistanceMatrixService,
  points: google.maps.LatLngLiteral[],
  serviceMinutes: number[],
  dayStart: Date,
  typicalLegSeconds: number[]
): Promise<number[] | null> {
  const legs: number[] = [];
  let allLive = true;
  let clock = dayStart.getTime(); // arrival at points[0]
  for (let k = 0; k < points.length - 1; k++) {
    const departMs = clock + (serviceMinutes[k] ?? 0) * 60_000;
    const live = await getLegTraffic(svc, points[k], points[k + 1], departMs);
    const secs = live ?? typicalLegSeconds[k] ?? 0;
    if (live == null) allLive = false;
    legs.push(secs);
    clock = departMs + secs * 1000;
  }
  return allLive ? legs : null;
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
