// Pure helpers for tour route scheduling — coordinate resolution and time math.
// No Google Maps or Supabase deps so this stays unit-testable.

export interface LatLng {
  lat: number;
  lng: number;
}

// Precedence (see feedback_coordinate_resolution):
// site_submit.verified → property.verified → site_submit.sf_property → property.lat/lng
export interface StopCoordSource {
  verified_latitude: number | null;
  verified_longitude: number | null;
  sf_property_latitude: number | null;
  sf_property_longitude: number | null;
  property?: {
    latitude: number | null;
    longitude: number | null;
    verified_latitude: number | null;
    verified_longitude: number | null;
  } | null;
}

export function resolveStopCoord(ss: StopCoordSource | null | undefined): LatLng | null {
  if (!ss) return null;
  if (ss.verified_latitude != null && ss.verified_longitude != null) {
    return { lat: ss.verified_latitude, lng: ss.verified_longitude };
  }
  const p = ss.property;
  if (p?.verified_latitude != null && p?.verified_longitude != null) {
    return { lat: p.verified_latitude, lng: p.verified_longitude };
  }
  if (ss.sf_property_latitude != null && ss.sf_property_longitude != null) {
    return { lat: ss.sf_property_latitude, lng: ss.sf_property_longitude };
  }
  if (p?.latitude != null && p?.longitude != null) {
    return { lat: p.latitude, lng: p.longitude };
  }
  return null;
}

// "HH:MM" or "HH:MM:SS" -> minutes since midnight (null if unset).
export function parseTimeToMinutes(t: string | null | undefined): number | null {
  if (!t) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(t);
  if (!m) return null;
  return parseInt(m[1], 10) * 60 + parseInt(m[2], 10);
}

export function minutesToHHMM(min: number): string {
  const wrapped = ((Math.round(min) % 1440) + 1440) % 1440;
  const h = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function formatMinutesDuration(min: number): string {
  const total = Math.round(min);
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h <= 0) return `${m} min`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

// Per-stop timing computed by the tour map and shown on the map schedule + panel.
// minsToNext: drive to the next mapped stop, or to the end address when nextIsEnd.
export interface StopTiming {
  arrivalMin: number | null;
  minsToNext: number | null;
  nextIsEnd: boolean;
  /** First routed stop of a day with a start address: drive from the start. */
  minsFromStart?: number | null;
}

// 66 -> "1h 06m", 12 -> "12 min"
export function formatDriveMinutes(min: number): string {
  const total = Math.round(min);
  if (total < 60) return `${total} min`;
  return `${Math.floor(total / 60)}h ${String(total % 60).padStart(2, '0')}m`;
}

// "→ 1h 06m to next" / "→ 12 min to end" / null (last stop, no end address)
export function driveToNextLabel(t: StopTiming | null | undefined): string | null {
  if (!t || t.minsToNext == null) return null;
  return `→ ${formatDriveMinutes(t.minsToNext)} to ${t.nextIsEnd ? 'end' : 'next'}`;
}

export interface ScheduledStop {
  arrivalMin: number; // clock minutes since midnight (if startMin known), else elapsed
  departMin: number;
}

export interface DaySchedule {
  stops: ScheduledStop[];
  finishMin: number;
  totalDriveMin: number;
  totalStopMin: number;
  hasStart: boolean;
}

// legSeconds: driving seconds between consecutive stops (length = stops-1).
// stopDurationsMin: service minutes per stop (length = stops).
// startMin: day start (minutes since midnight) or null (then times are elapsed from 0).
// opts.leadSeconds: drive from a start address to the first stop (added before first arrival).
// opts.tailSeconds: drive from the last stop to an end address (added to the finish time).
export function computeDaySchedule(
  startMin: number | null,
  legSeconds: number[],
  stopDurationsMin: number[],
  opts?: { leadSeconds?: number; tailSeconds?: number }
): DaySchedule {
  const base = startMin ?? 0;
  const stops: ScheduledStop[] = [];
  let cursor = base;
  let totalDrive = 0;
  const totalStop = stopDurationsMin.reduce((a, b) => a + b, 0);

  const lead = (opts?.leadSeconds ?? 0) / 60;
  if (lead > 0) {
    totalDrive += lead;
    cursor += lead;
  }

  for (let i = 0; i < stopDurationsMin.length; i++) {
    if (i > 0) {
      const legMin = (legSeconds[i - 1] ?? 0) / 60;
      totalDrive += legMin;
      cursor += legMin;
    }
    const arrival = cursor;
    const depart = arrival + stopDurationsMin[i];
    stops.push({ arrivalMin: arrival, departMin: depart });
    cursor = depart;
  }

  const tail = (opts?.tailSeconds ?? 0) / 60;
  if (tail > 0) {
    totalDrive += tail;
    cursor += tail;
  }

  return {
    stops,
    finishMin: cursor,
    totalDriveMin: totalDrive,
    totalStopMin: totalStop,
    hasStart: startMin != null,
  };
}

// Per-day marker/route color palette (brand-leaning, distinct hues).
export const DAY_COLORS = ['#002147', '#4A6B94', '#A27B5C', '#3F7D5C', '#7A4A94', '#94623F'];
export function dayColor(index: number): string {
  return DAY_COLORS[index % DAY_COLORS.length];
}

// ---------------------------------------------------------------------------
// 12-hour display (storage stays "HH:MM[:SS]" / minutes-since-midnight)
// ---------------------------------------------------------------------------

// Minutes since midnight -> "9:30 AM".
export function formatClock12(min: number): string {
  const wrapped = ((Math.round(min) % 1440) + 1440) % 1440;
  const h24 = Math.floor(wrapped / 60);
  const m = wrapped % 60;
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${h24 < 12 ? 'AM' : 'PM'}`;
}

// "HH:MM[:SS]" -> "9:30 AM" ('' if unset/invalid).
export function formatTime12(t: string | null | undefined): string {
  const min = parseTimeToMinutes(t);
  return min == null ? '' : formatClock12(min);
}

// ---------------------------------------------------------------------------
// Stop naming: display_label → "City · short street" → property name
// ---------------------------------------------------------------------------

const STREET_ABBREVIATIONS: [RegExp, string][] = [
  [/\bStreet\b/gi, 'St'],
  [/\bRoad\b/gi, 'Rd'],
  [/\bDrive\b/gi, 'Dr'],
  [/\bAvenue\b/gi, 'Ave'],
  [/\bBoulevard\b/gi, 'Blvd'],
  [/\bHighway\b/gi, 'Hwy'],
  [/\bParkway\b/gi, 'Pkwy'],
  [/\bLane\b/gi, 'Ln'],
  [/\bCourt\b/gi, 'Ct'],
  [/\bPlace\b/gi, 'Pl'],
  [/\bCircle\b/gi, 'Cir'],
  [/\bTrail\b/gi, 'Trl'],
  [/\bNortheast\b/gi, 'NE'],
  [/\bNorthwest\b/gi, 'NW'],
  [/\bSoutheast\b/gi, 'SE'],
  [/\bSouthwest\b/gi, 'SW'],
  [/\bU\.S\.\s*/gi, 'US '],
];

// "1516 Bass Road, Macon, GA 31210" -> "1516 Bass Rd"
// "4545 US 23;GA 42" -> "4545 US 23" (concurrent route designations: keep the first)
export function shortStreet(address: string | null | undefined): string | null {
  if (!address) return null;
  let s = address.split(/[,;]/)[0].trim();
  for (const [re, abbr] of STREET_ABBREVIATIONS) s = s.replace(re, abbr);
  s = s.replace(/\s+/g, ' ').trim();
  return s || null;
}

export interface StopNameSource {
  display_label?: string | null;
  site_submit_name?: string | null;
  property?: { property_name?: string | null; address?: string | null; city?: string | null } | null;
}

// name: what the panel, map schedule and pin tooltips show.
// subtext: the full site submit name (shown small/gray), when it adds information.
export function stopDisplayName(src: StopNameSource): { name: string; subtext: string | null } {
  const ssName = src.site_submit_name?.trim() || null;
  const label = src.display_label?.trim();
  const street = shortStreet(src.property?.address);
  const city = src.property?.city?.trim() || null;
  const name =
    label ||
    (street ? [city, street].filter(Boolean).join(' · ') : null) ||
    src.property?.property_name?.trim() ||
    city ||
    ssName ||
    '(unnamed site submit)';
  return { name, subtext: ssName && ssName !== name ? ssName : null };
}

// ---------------------------------------------------------------------------
// Traffic departure time
// ---------------------------------------------------------------------------

// day_date "YYYY-MM-DD" + start_time "HH:MM[:SS]" as a local (Eastern) Date, only if it
// is in the future — Google rejects past departure times. null => no traffic request.
export function departureFor(
  dayDate: string | null | undefined,
  startTime: string | null | undefined,
  now: Date = new Date()
): Date | null {
  if (!dayDate) return null;
  const startMin = parseTimeToMinutes(startTime);
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dayDate);
  if (!m || startMin == null) return null;
  const d = new Date(+m[1], +m[2] - 1, +m[3], Math.floor(startMin / 60), startMin % 60, 0, 0);
  return d.getTime() > now.getTime() ? d : null;
}

// ---------------------------------------------------------------------------
// Route cache key — anything that changes the Google request, nothing else.
// ---------------------------------------------------------------------------

// Via (pass-through) points are marked "~" so the same coords as a stopover key differently.
export function routeKey(points: { id: string; lat: number; lng: number; via?: boolean }[]): string {
  return points.map((p) => `${p.id}${p.via ? '~' : '@'}${p.lat.toFixed(6)},${p.lng.toFixed(6)}`).join('|');
}

// ---------------------------------------------------------------------------
// Site approach routes
// ---------------------------------------------------------------------------
// An approach is an ordered list of pass-through points routed (stopover:false) just
// before a stop. Effective approach = tour_stop override (NOT NULL; [] = none on this
// tour) → site_submit default → none.

export const MAX_APPROACH_POINTS = 10;

export interface ApproachPoint {
  lat: number;
  lng: number;
}

export function parseApproach(raw: unknown): ApproachPoint[] | null {
  if (!Array.isArray(raw)) return null;
  const pts: ApproachPoint[] = [];
  for (const p of raw) {
    if (!p || typeof p.lat !== 'number' || typeof p.lng !== 'number') return null;
    pts.push({ lat: p.lat, lng: p.lng });
  }
  return pts;
}

export type ApproachSource = 'tour' | 'site' | null;

export function effectiveApproach(
  override: unknown,
  siteDefault: unknown
): { points: ApproachPoint[]; source: ApproachSource } {
  const o = parseApproach(override);
  if (o) return { points: o, source: o.length ? 'tour' : null };
  const d = parseApproach(siteDefault);
  if (d && d.length) return { points: d, source: 'site' };
  return { points: [], source: null };
}

// One point in a day's routed sequence.
export interface RoutePoint {
  id: string; // stop id, 'start', 'end', or `${stopId}#a${i}` for approach points
  lat: number;
  lng: number;
  via: boolean; // pass-through (approach) point
  role: 'start' | 'stop' | 'via' | 'end';
  stopId?: string; // for role 'stop' and 'via' (the stop the approach leads into)
}

export function buildDayRoutePoints(
  start: LatLng | null,
  stops: { id: string; lat: number; lng: number; approach: ApproachPoint[] }[],
  end: LatLng | null
): RoutePoint[] {
  const pts: RoutePoint[] = [];
  if (start) pts.push({ id: 'start', ...start, via: false, role: 'start' });
  for (const s of stops) {
    s.approach.forEach((a, i) => pts.push({ id: `${s.id}#a${i}`, lat: a.lat, lng: a.lng, via: true, role: 'via', stopId: s.id }));
    pts.push({ id: s.id, lat: s.lat, lng: s.lng, via: false, role: 'stop', stopId: s.id });
  }
  if (end) pts.push({ id: 'end', ...end, via: false, role: 'end' });
  return pts;
}

// Split a point sequence into Directions requests: each chunk is [a..b] inclusive where
// points[a] and points[b] are stopovers and there are at most maxWaypoints points between
// them. Consecutive chunks share the boundary stop (chunk k+1 starts at chunk k's last stop).
// Throws if a single stop's approach can't fit (guarded by MAX_APPROACH_POINTS).
export function chunkRoutePoints(points: { via: boolean }[], maxWaypoints = 25): [number, number][] {
  const chunks: [number, number][] = [];
  if (points.length < 2) return chunks;
  let a = 0;
  while (a < points.length - 1) {
    let b = -1;
    for (let j = a + 1; j < points.length && j - a - 1 <= maxWaypoints; j++) {
      if (!points[j].via) b = j;
    }
    if (b === -1) throw new Error('Approach too long to route (too many pass-through points before one stop)');
    chunks.push([a, b]);
    a = b;
  }
  return chunks;
}

// ---------------------------------------------------------------------------
// Open-path ordering (fixed origin, free last stop)
// ---------------------------------------------------------------------------
// fromOrigin[j]: seconds from the fixed origin to free stop j.
// m[i][j]:       seconds from free stop i to free stop j (asymmetric allowed).
// Returns the visiting order of free-stop indices minimizing total drive time.
// Exact (Held-Karp) up to EXACT_LIMIT stops; nearest-neighbour + 2-opt + or-opt above.

const EXACT_LIMIT = 13;

// toEnd[i] (optional): seconds from free stop i to a fixed end address, added after the
// last stop. Approach tails are folded into fromOrigin/m columns by the caller.
export function openPathCost(order: number[], fromOrigin: number[], m: number[][], toEnd?: number[]): number {
  if (order.length === 0) return 0;
  let c = fromOrigin[order[0]];
  for (let k = 1; k < order.length; k++) c += m[order[k - 1]][order[k]];
  if (toEnd) c += toEnd[order[order.length - 1]];
  return c;
}

export function solveOpenPath(fromOrigin: number[], m: number[][], toEnd?: number[]): number[] {
  const n = fromOrigin.length;
  if (n <= 1) return n === 1 ? [0] : [];
  return n <= EXACT_LIMIT ? heldKarpOpen(fromOrigin, m, toEnd) : heuristicOpen(fromOrigin, m, toEnd);
}

function heldKarpOpen(fromOrigin: number[], m: number[][], toEnd?: number[]): number[] {
  const n = fromOrigin.length;
  const full = 1 << n;
  const dp = new Float64Array(full * n).fill(Infinity);
  const parent = new Int8Array(full * n).fill(-1);
  for (let j = 0; j < n; j++) dp[(1 << j) * n + j] = fromOrigin[j];
  for (let mask = 1; mask < full; mask++) {
    for (let last = 0; last < n; last++) {
      if (!(mask & (1 << last))) continue;
      const cur = dp[mask * n + last];
      if (cur === Infinity) continue;
      for (let nxt = 0; nxt < n; nxt++) {
        if (mask & (1 << nxt)) continue;
        const nm = mask | (1 << nxt);
        const v = cur + m[last][nxt];
        if (v < dp[nm * n + nxt]) {
          dp[nm * n + nxt] = v;
          parent[nm * n + nxt] = last;
        }
      }
    }
  }
  const all = full - 1;
  const finalCost = (j: number) => dp[all * n + j] + (toEnd ? toEnd[j] : 0);
  let best = 0;
  for (let j = 1; j < n; j++) if (finalCost(j) < finalCost(best)) best = j;
  const order: number[] = [];
  let mask = all;
  let cur = best;
  while (cur !== -1) {
    order.push(cur);
    const p = parent[mask * n + cur];
    mask &= ~(1 << cur);
    cur = p;
  }
  return order.reverse();
}

function heuristicOpen(fromOrigin: number[], m: number[][], toEnd?: number[]): number[] {
  const n = fromOrigin.length;
  // Nearest neighbour from the origin.
  const used = new Array(n).fill(false);
  const order: number[] = [];
  let cur = -1;
  for (let k = 0; k < n; k++) {
    let best = -1;
    let bestCost = Infinity;
    for (let j = 0; j < n; j++) {
      if (used[j]) continue;
      const c = cur === -1 ? fromOrigin[j] : m[cur][j];
      if (c < bestCost) {
        bestCost = c;
        best = j;
      }
    }
    used[best] = true;
    order.push(best);
    cur = best;
  }
  // Improve with 2-opt (segment reversal) and or-opt (move one stop) until stable.
  let bestOrder = order;
  let bestCost = openPathCost(order, fromOrigin, m, toEnd);
  let improved = true;
  while (improved) {
    improved = false;
    for (let i = 0; i < n - 1 && !improved; i++) {
      for (let j = i + 1; j < n && !improved; j++) {
        const cand = [...bestOrder.slice(0, i), ...bestOrder.slice(i, j + 1).reverse(), ...bestOrder.slice(j + 1)];
        const c = openPathCost(cand, fromOrigin, m, toEnd);
        if (c < bestCost - 1e-9) {
          bestOrder = cand;
          bestCost = c;
          improved = true;
        }
      }
    }
    for (let i = 0; i < n && !improved; i++) {
      for (let j = 0; j < n && !improved; j++) {
        if (i === j) continue;
        const cand = [...bestOrder];
        const [x] = cand.splice(i, 1);
        cand.splice(j, 0, x);
        const c = openPathCost(cand, fromOrigin, m, toEnd);
        if (c < bestCost - 1e-9) {
          bestOrder = cand;
          bestCost = c;
          improved = true;
        }
      }
    }
  }
  return bestOrder;
}
