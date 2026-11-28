/// <reference types="google.maps" />
// Google routing calls for tours, behind a session cache. Every Directions / Distance
// Matrix request the tour map makes goes through here, so "how many calls does an edit
// make" has one answer: only when a cache key changes.
//
// API references (checked 2026-10-28):
//   Directions (JS):      https://developers.google.com/maps/documentation/javascript/directions
//     - max 25 waypoints per request (origin + destination extra); stopover:false (via)
//       waypoints count toward it
//     - duration_in_traffic is ONLY returned when the request has no stopover waypoints,
//       so a multi-stop Directions call can't give traffic-aware legs. We never send
//       drivingOptions there (it would bill the Advanced SKU for nothing).
//     - optimizeWaypoints requires every waypoint to be a stopover → unusable with
//       approach (via) points, so Optimize uses Distance Matrix + solveOpenPath.
//   Directions reference: https://developers.google.com/maps/documentation/javascript/reference/directions
//     - DirectionsLeg.via_waypoints: non-stopover waypoints along the leg (used to capture
//       a dragged route as a stop's approach)
//   Distance Matrix (JS): https://developers.google.com/maps/documentation/javascript/distancematrix
//     - max 25 origins, 25 destinations, 100 elements per client-side request; no waypoints
//     - departureTime must be now or future; traffic requests bill as "Advanced"

import { chunkRoutePoints, routeKey, type RoutePoint } from './tourRouting';

const DIRECTIONS_MAX_WAYPOINTS = 25;
const MATRIX_MAX_ELEMENTS = 100;
const MATRIX_MAX_DIMENSION = 25;

let requestCount = 0;
/** Total Google requests issued by this module in the session (dev/debug aid). */
export const tourGoogleRequestCount = () => requestCount;

const statusOf = (e: any): string => e?.code ?? e?.status ?? e?.message ?? String(e);
const ll = (p: { lat: number; lng: number }): google.maps.LatLngLiteral => ({ lat: p.lat, lng: p.lng });

// ---------------------------------------------------------------------------
// Day routes — chunked Directions requests, cached per chunk
// ---------------------------------------------------------------------------

export type ChunkResult = { ok: true; result: google.maps.DirectionsResult } | { ok: false; status: string };

// Keyed by routeKey(chunk points). Failures are cached too, so an edit that doesn't change
// the route never re-hits Google; clearRouteChunks() is the explicit retry.
const chunkCache = new Map<string, Promise<ChunkResult>>();

function directionsRequest(points: RoutePoint[]): google.maps.DirectionsRequest {
  return {
    origin: ll(points[0]),
    destination: ll(points[points.length - 1]),
    waypoints: points.slice(1, -1).map((p) => ({ location: ll(p), stopover: !p.via })),
    travelMode: google.maps.TravelMode.DRIVING,
  };
}

function getChunk(svc: google.maps.DirectionsService, key: string, points: RoutePoint[]): Promise<ChunkResult> {
  const cached = chunkCache.get(key);
  if (cached) return cached;
  const p = (async (): Promise<ChunkResult> => {
    requestCount++;
    try {
      const result = await svc.route(directionsRequest(points));
      return result.routes[0] ? { ok: true, result } : { ok: false, status: 'ZERO_RESULTS' };
    } catch (e) {
      return { ok: false, status: statusOf(e) };
    }
  })();
  chunkCache.set(key, p);
  return p;
}

/** Store a result Google already produced (e.g. the draggable renderer's) under a key. */
export function seedRouteChunk(key: string, result: google.maps.DirectionsResult) {
  chunkCache.set(key, Promise.resolve({ ok: true, result }));
}

export function clearRouteChunks(keys: string[]) {
  keys.forEach((k) => chunkCache.delete(k));
}

export interface DayChunk {
  key: string;
  start: number; // index into the day's points (a stopover)
  end: number; // index into the day's points (a stopover)
  points: RoutePoint[];
  result: google.maps.DirectionsResult | null;
}

export type DayRouteResult =
  | { ok: true; chunks: DayChunk[]; legSeconds: number[] }
  | { ok: false; chunks: DayChunk[]; status: string };

export function planDayChunks(points: RoutePoint[]): DayChunk[] {
  return chunkRoutePoints(points, DIRECTIONS_MAX_WAYPOINTS).map(([a, b]) => {
    const pts = points.slice(a, b + 1);
    return { key: routeKey(pts), start: a, end: b, points: pts, result: null };
  });
}

// legSeconds: one entry per consecutive pair of STOPOVER points (start/stops/end), in order —
// approach (via) points live inside the leg into their stop. Chunk legs are stitched in order;
// each chunk keeps its own DirectionsResult so the map can render (and drag) it.
export async function getDayRoute(svc: google.maps.DirectionsService, points: RoutePoint[]): Promise<DayRouteResult> {
  const chunks = planDayChunks(points);
  const results = await Promise.all(chunks.map((c) => getChunk(svc, c.key, c.points)));
  results.forEach((r, i) => (chunks[i].result = r.ok ? r.result : null));
  const failed = results.find((r): r is { ok: false; status: string } => !r.ok);
  if (failed) return { ok: false, chunks, status: failed.status };

  const legSeconds: number[] = [];
  chunks.forEach((c) => c.result!.routes[0].legs.forEach((l) => legSeconds.push(l.duration?.value ?? 0)));
  return { ok: true, chunks, legSeconds };
}

// ---------------------------------------------------------------------------
// Approach tail: fixed drive time from a stop's first approach point, through the rest,
// into the stop. Used by Optimize. Cached by the points.
// ---------------------------------------------------------------------------

const tailCache = new Map<string, Promise<number>>();

export function getApproachTailSeconds(
  svc: google.maps.DirectionsService,
  approach: google.maps.LatLngLiteral[],
  stop: google.maps.LatLngLiteral
): Promise<number> {
  if (approach.length === 0) return Promise.resolve(0);
  const pts: RoutePoint[] = [
    ...approach.map((a, i) => ({ id: `a${i}`, ...a, via: i > 0, role: 'via' as const })),
    { id: 's', ...stop, via: false, role: 'stop' as const },
  ];
  const key = routeKey(pts);
  const cached = tailCache.get(key);
  if (cached) return cached;
  const p = (async () => {
    requestCount++;
    try {
      const res = await svc.route(directionsRequest(pts));
      return res.routes[0].legs.reduce((sum, l) => sum + (l.duration?.value ?? 0), 0);
    } catch (e) {
      tailCache.delete(key);
      throw new Error(`Couldn't time the approach into a stop (${statusOf(e)})`);
    }
  })();
  tailCache.set(key, p);
  return p;
}

// ---------------------------------------------------------------------------
// Traffic-aware legs with CHAINED departures.
// The first point is reached at day start. Every segment (point → next point, including
// approach points) departs at (arrival at its origin + that point's service minutes) —
// approach points have 0 minutes. One 1×1 Distance Matrix element per segment (Distance
// Matrix can't route through waypoints, so a leg with an approach is fetched as its
// segments and summed). Sequential, because each departure depends on the previous
// segment's traffic time.
//
// Cache: per segment (origin→destination coords), a list of fetched departures. A segment
// is reused when a cached departure is within DEPARTURE_TOLERANCE of the new one, so an
// upstream edit only re-requests downstream segments once it shifts their departure by
// 15+ minutes. Requests go out at departures snapped to 15-minute buckets.
// ---------------------------------------------------------------------------

const BUCKET_MS = 15 * 60 * 1000;
const DEPARTURE_TOLERANCE_MS = 15 * 60 * 1000;

interface LegEntry {
  forMs: number; // the segment's actual (unsnapped) departure when fetched — tolerance anchor
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

function getSegmentTraffic(
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

// points: the day's routed points in order (start?, [approach…, stop]…, end?).
// serviceMinutes: minutes spent at each point (0 for start/end/approach points).
// typicalLegSeconds: Directions time per stopover leg — keeps the chain going if a segment
// has no traffic data (as an even share of its leg). Returns per-STOPOVER-leg traffic
// seconds, or null when any segment lacked traffic data (caller labels the day "typical").
export async function getChainedTrafficLegs(
  svc: google.maps.DistanceMatrixService,
  points: RoutePoint[],
  serviceMinutes: number[],
  dayStart: Date,
  typicalLegSeconds: number[]
): Promise<number[] | null> {
  const legs: number[] = [];
  let allLive = true;
  let clock = dayStart.getTime(); // arrival at points[0]
  let legIdx = 0;
  let legAcc = 0;
  let legSegments = 0; // segments in the current stopover leg
  for (let k = 0; k < points.length - 1; k++) {
    if (legSegments === 0) {
      legSegments = 1;
      for (let j = k + 1; j < points.length - 1 && points[j].via; j++) legSegments++;
    }
    const departMs = clock + (serviceMinutes[k] ?? 0) * 60_000;
    const live = await getSegmentTraffic(svc, ll(points[k]), ll(points[k + 1]), departMs);
    if (live == null) allLive = false;
    const secs = live ?? (typicalLegSeconds[legIdx] ?? 0) / legSegments;
    legAcc += secs;
    clock = departMs + secs * 1000;
    if (!points[k + 1].via) {
      legs.push(legAcc);
      legAcc = 0;
      legSegments = 0;
      legIdx++;
    }
  }
  return allLive ? legs : null;
}

// ---------------------------------------------------------------------------
// Drive-time matrix for Optimize
// ---------------------------------------------------------------------------

// Full matrix (seconds), origins × destinations, tiled to stay within 25 origins /
// 25 destinations / 100 elements per request. Throws on any missing element.
export async function getDriveMatrix(
  svc: google.maps.DistanceMatrixService,
  origins: google.maps.LatLngLiteral[],
  destinations: google.maps.LatLngLiteral[]
): Promise<number[][]> {
  const colsPerTile = Math.min(MATRIX_MAX_DIMENSION, destinations.length);
  const rowsPerTile = Math.max(1, Math.min(MATRIX_MAX_DIMENSION, Math.floor(MATRIX_MAX_ELEMENTS / colsPerTile)));
  const matrix: number[][] = origins.map(() => new Array(destinations.length).fill(0));
  for (let c = 0; c < destinations.length; c += colsPerTile) {
    const cols = destinations.slice(c, c + colsPerTile);
    for (let r = 0; r < origins.length; r += rowsPerTile) {
      requestCount++;
      let res: google.maps.DistanceMatrixResponse;
      try {
        res = await svc.getDistanceMatrix({
          origins: origins.slice(r, r + rowsPerTile),
          destinations: cols,
          travelMode: google.maps.TravelMode.DRIVING,
        });
      } catch (e) {
        throw new Error(`Distance Matrix failed (${statusOf(e)})`);
      }
      res.rows.forEach((row, i) => {
        row.elements.forEach((el, j) => {
          if (el.status !== 'OK') throw new Error(`No drive time between stops (${el.status})`);
          matrix[r + i][c + j] = el.duration.value;
        });
      });
    }
  }
  return matrix;
}
