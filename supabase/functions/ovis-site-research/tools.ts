/**
 * Tool definitions + executors for ovis-site-research.
 *
 * Four client tools plus Anthropic's server-side web_search. Every client tool
 * is READ-ONLY and additive: no schema was changed to add them, and nothing here
 * writes. In particular the streetlight_* tables are read through the EXISTING
 * get_streetlight_segments_in_bbox RPC — no new RPC, no constraint touched.
 *
 * Why distance math lives in TypeScript rather than SQL: PostgREST cannot express
 * ST_DWithin, and adding an RPC would have been the schema change we were asked
 * not to make. Segment geometry comes back as GeoJSON from the existing bbox RPC
 * and the point-to-line distance is computed here.
 */

import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

// Server-side web search. No domain allowlist by design — source quality is a
// prompt concern (prefer primary sources), not a config concern.
export const WEB_SEARCH_TOOL = {
  type: 'web_search_20260209',
  name: 'web_search',
  max_uses: 12,
} as const;

export const TOOL_DEFINITIONS = [
  {
    name: 'query_traffic_counts',
    description:
      'Cached bidirectional AADT for road segments near a point, from the StreetLight catalog. ' +
      'CRITICAL LIMITATIONS, state them rather than working around them: AADT is a two-way daily ' +
      'total. It carries NO directional split, NO peak-hour breakdown, and NO side-of-road ' +
      'determination — you must NOT infer morning inbound side, commute direction, or AM flow from ' +
      'it. Segment road names are NOT stored (null on every segment that has a count), so the road ' +
      'a count belongs to cannot be identified from this data. Do not run web searches trying to ' +
      'name the road; report the count with its distance and move on. Only segments that actually ' +
      'have a count are returned — uncounted segments are omitted as noise.',
    input_schema: {
      type: 'object',
      properties: {
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        radius_miles: { type: 'number', default: 0.5, minimum: 0.1, maximum: 5 },
      },
      required: ['latitude', 'longitude'],
    },
  },
  {
    name: 'query_nearby_starbucks',
    description:
      'Nearest existing Starbucks locations from the Atlas layer, sorted by straight-line distance ' +
      'ascending. Returns company-operated stores and, separately, licensed stores (kiosks inside ' +
      'a Target, Kroger, airport, campus, etc.). Treat the two groups differently: a licensed kiosk ' +
      'serves the trade area but is NOT a drive-thru competitor, and conflating them overstates ' +
      'competition. There is no street address in this data — store_name is typically a corner name ' +
      '("Sandy Plains & Gordy"); never fabricate an address. rtm_sales is rolling-twelve-month sales ' +
      'in dollars as of snapshot_date; a value of 0 means NOT REPORTED, not zero sales — omit it ' +
      'rather than cite it. This is the competitive-ring and cannibalization input: if this returns ' +
      'stores, you may not claim WHITE_SPACE.',
    input_schema: {
      type: 'object',
      properties: {
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        limit: { type: 'integer', default: 4, minimum: 1, maximum: 15 },
      },
      required: ['latitude', 'longitude'],
    },
  },
  {
    name: 'query_municipal_projects',
    description:
      'Residential development pipeline near a point, from OVIS market research. Returns TWO ' +
      'distinct groups. "approved" rows are human-reviewed and committed — treat them as confirmed. ' +
      '"pending" rows are agent-discovered candidates that a human has NOT yet reviewed — real ' +
      'pipeline intelligence, but you MUST label them as unreviewed wherever you cite them, and you ' +
      'may not present an unreviewed unit count as established fact. Pending rows are not yet ' +
      'geocoded, so they carry no distance; they are scoped to this site\'s own research runs, which ' +
      'were bounded by the radius the researcher chose. No minimum unit threshold — a cluster of ' +
      'small projects is still a rooftops story.',
    input_schema: {
      type: 'object',
      properties: {
        latitude: { type: 'number' },
        longitude: { type: 'number' },
        radius_miles: { type: 'number', default: 3, minimum: 0.5, maximum: 25 },
        min_units: { type: 'integer', default: 0, minimum: 0 },
      },
      required: ['latitude', 'longitude'],
    },
  },
] as const;

// ---------------------------------------------------------------------------
// Geo helpers — great-circle distance, and point-to-linestring.
// ---------------------------------------------------------------------------
const R_MILES = 3958.7613;
const toRad = (d: number) => (d * Math.PI) / 180;

export function haversineMiles(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const s =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R_MILES * Math.asin(Math.sqrt(s));
}

/**
 * Shortest distance from a point to a GeoJSON LineString, in miles.
 *
 * Projects to a local equirectangular plane centred on the query point before
 * doing the per-segment point-to-segment math. Over the sub-mile spans this is
 * used for, the projection error is far below the 0.01 mi we report.
 */
export function pointToLineStringMiles(
  pt: { lat: number; lng: number },
  coords: Array<[number, number]>, // GeoJSON order: [lng, lat]
): number | null {
  if (!Array.isArray(coords) || coords.length === 0) return null;
  const kx = Math.cos(toRad(pt.lat)) * 69.172; // miles per degree longitude here
  const ky = 69.172; // miles per degree latitude
  const px = 0, py = 0; // query point is the origin
  const proj = coords
    .filter((c) => Array.isArray(c) && c.length >= 2)
    .map(([lng, lat]) => [(lng - pt.lng) * kx, (lat - pt.lat) * ky] as [number, number]);
  if (proj.length === 0) return null;
  if (proj.length === 1) return Math.hypot(proj[0][0] - px, proj[0][1] - py);

  let best = Infinity;
  for (let i = 0; i < proj.length - 1; i++) {
    const [x1, y1] = proj[i];
    const [x2, y2] = proj[i + 1];
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx * dx + dy * dy;
    // Degenerate (repeated vertex) — fall back to the vertex distance.
    const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / len2));
    best = Math.min(best, Math.hypot(x1 + t * dx - px, y1 + t * dy - py));
  }
  return best;
}

/** Degrees of latitude/longitude covering `miles` at this latitude. */
function bboxFor(lat: number, lng: number, miles: number) {
  const dLat = miles / 69.172;
  const dLng = miles / (Math.cos(toRad(lat)) * 69.172 || 1e-6);
  return { south: lat - dLat, north: lat + dLat, west: lng - dLng, east: lng + dLng };
}

const round1 = (n: number) => Math.round(n * 10) / 10;
const round2 = (n: number) => Math.round(n * 100) / 100;

/** 0 in a sales figure means "not reported" upstream, never a real zero. */
const salesOrNull = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
};

// ---------------------------------------------------------------------------
// Executors
// ---------------------------------------------------------------------------

async function queryTrafficCounts(
  service: SupabaseClient,
  args: { latitude: number; longitude: number; radius_miles?: number },
) {
  const { latitude, longitude } = args;
  const radius = Math.min(Math.max(args.radius_miles ?? 0.5, 0.1), 5);
  const bb = bboxFor(latitude, longitude, radius);

  // Existing RPC — returns id, road_name, road_type, geom_geojson. LIMIT 5000
  // inside; a sub-5-mile bbox stays far under that.
  const { data: segs, error: segErr } = await service.rpc('get_streetlight_segments_in_bbox', {
    p_south: bb.south, p_west: bb.west, p_north: bb.north, p_east: bb.east,
  });
  if (segErr) throw new Error(`segment lookup failed: ${segErr.message}`);

  const rows = (segs ?? []) as Array<{
    id: number; road_name: string | null; road_type: string | null;
    geom_geojson: { type: string; coordinates: Array<[number, number]> } | null;
  }>;
  if (rows.length === 0) {
    return { note: TRAFFIC_NOTE, radius_miles: radius, counts: [] };
  }

  // Only 152 metric rows exist in total, so this .in() is cheap regardless.
  const { data: metrics, error: mErr } = await service
    .from('streetlight_segment_metrics')
    .select('segment_id, aadt, date_range_start, date_range_end')
    .in('segment_id', rows.map((r) => r.id))
    .not('aadt', 'is', null);
  if (mErr) throw new Error(`metric lookup failed: ${mErr.message}`);

  const byId = new Map<number, { aadt: number; date_range_start: string; date_range_end: string }>();
  for (const m of (metrics ?? []) as Array<Record<string, unknown>>) {
    const sid = Number(m.segment_id);
    const aadt = Number(m.aadt);
    const prev = byId.get(sid);
    // Multiple periods can exist per segment; keep the most recent window.
    if (!prev || String(m.date_range_end) > prev.date_range_end) {
      byId.set(sid, {
        aadt,
        date_range_start: String(m.date_range_start),
        date_range_end: String(m.date_range_end),
      });
    }
  }

  const pt = { lat: latitude, lng: longitude };
  const counts = rows
    .filter((r) => byId.has(r.id) && r.geom_geojson?.coordinates)
    .map((r) => {
      const d = pointToLineStringMiles(pt, r.geom_geojson!.coordinates);
      const m = byId.get(r.id)!;
      return {
        segment_id: String(r.id),
        road_name: r.road_name, // null on every counted segment today
        road_type: r.road_type,
        aadt_bidirectional: m.aadt,
        measurement_window: `${m.date_range_start} to ${m.date_range_end}`,
        distance_miles: d === null ? null : round2(d),
      };
    })
    .filter((c) => c.distance_miles !== null && c.distance_miles <= radius)
    .sort((a, b) => (a.distance_miles ?? 0) - (b.distance_miles ?? 0))
    .slice(0, 20);

  return { note: TRAFFIC_NOTE, radius_miles: radius, count_of_segments: counts.length, counts };
}

const TRAFFIC_NOTE =
  'BIDIRECTIONAL AADT ONLY. No directional split, no peak-hour volume, and no side-of-road ' +
  'determination is available — the AM-versus-PM side call CANNOT be made from this data, and ' +
  'must be stated as a limitation rather than guessed. Road names are not stored for counted ' +
  'segments (null on all of them); do not search the web to try to name them.';

async function queryNearbyStarbucks(
  service: SupabaseClient,
  args: { latitude: number; longitude: number; limit?: number },
) {
  const { latitude, longitude } = args;
  const limit = Math.min(Math.max(args.limit ?? 4, 1), 15);
  const pt = { lat: latitude, lng: longitude };

  // 253 company-operated stores — small enough to rank in memory, and that
  // avoids a bbox that could miss a near-miss store just outside the box.
  const { data: stores, error: sErr } = await service
    .from('starbucks_store')
    .select('store_number, store_name, city, state, latitude, longitude, open_date')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null);
  if (sErr) throw new Error(`starbucks_store lookup failed: ${sErr.message}`);

  const ranked = ((stores ?? []) as unknown as Array<Record<string, unknown>>)
    .map((s) => ({
      store_number: String(s.store_number),
      store_name: (s.store_name as string) ?? null,
      city: (s.city as string) ?? null,
      state: (s.state as string) ?? null,
      open_date: (s.open_date as string) ?? null,
      distance_miles: round1(
        haversineMiles(pt, { lat: Number(s.latitude), lng: Number(s.longitude) }),
      ),
    }))
    .sort((a, b) => a.distance_miles - b.distance_miles)
    .slice(0, limit);

  // Latest snapshot per store, for the ones we're returning.
  const numbers = ranked.map((r) => r.store_number);
  const { data: snaps, error: nErr } = await service
    .from('starbucks_snapshot')
    .select('store_number, snapshot_date, store_type, rtm_sales, sf, store_age')
    .in('store_number', numbers)
    .order('snapshot_date', { ascending: false });
  if (nErr) throw new Error(`starbucks_snapshot lookup failed: ${nErr.message}`);

  const latest = new Map<string, Record<string, unknown>>();
  for (const s of (snaps ?? []) as Array<Record<string, unknown>>) {
    const k = String(s.store_number);
    if (!latest.has(k)) latest.set(k, s); // ordered desc, first wins
  }

  const company_operated = ranked.map((r) => {
    const snap = latest.get(r.store_number);
    return {
      ...r,
      store_type: (snap?.store_type as string) ?? null,
      square_feet: snap?.sf ?? null,
      rtm_sales_usd: salesOrNull(snap?.rtm_sales),
      rtm_sales_as_of: snap?.snapshot_date ?? null,
    };
  });

  // Licensed stores — a separate group on purpose. Unlike company-operated
  // stores these DO carry a street address, and they have a verified-coordinate
  // override, so apply the same verified-beats-unverified rule used elsewhere.
  const { data: licensed, error: lErr } = await service
    .from('starbucks_licensed_store')
    .select(
      'store_number, store_name, licensee_name, ownership_type, lifecycle_status, store_type, ' +
        'segment, address, city, state, postal_code, latitude, longitude, ' +
        'verified_latitude, verified_longitude',
    )
    .limit(1000);
  if (lErr) throw new Error(`starbucks_licensed_store lookup failed: ${lErr.message}`);

  const licensed_stores = ((licensed ?? []) as unknown as Array<Record<string, unknown>>)
    .map((l) => {
      const lat = Number(l.verified_latitude ?? l.latitude);
      const lng = Number(l.verified_longitude ?? l.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      return {
        store_number: l.store_number != null ? String(l.store_number) : null,
        store_name: (l.store_name as string) ?? null,
        licensee_name: (l.licensee_name as string) ?? null,
        segment: (l.segment as string) ?? null,
        lifecycle_status: (l.lifecycle_status as string) ?? null,
        address: (l.address as string) ?? null,
        city: (l.city as string) ?? null,
        state: (l.state as string) ?? null,
        distance_miles: round1(haversineMiles(pt, { lat, lng })),
      };
    })
    .filter((x): x is NonNullable<typeof x> => x !== null)
    .sort((a, b) => a.distance_miles - b.distance_miles)
    .slice(0, limit);

  return {
    note:
      'Two DISTINCT groups, kept separate deliberately. company_operated are full Starbucks stores ' +
      '(store_type DT = drive-thru, DTO = drive-thru only, Cafe = no drive-thru) and are the real ' +
      'competitive set for a drive-thru site. licensed_stores are kiosks operated by a licensee ' +
      'inside a host business (grocery, big-box, campus, airport — see licensee_name/segment); they ' +
      'serve the trade area but are NOT drive-thru competitors, so report them separately rather ' +
      'than merging the counts. rtm_sales_usd is null where not reported (an upstream 0 has been ' +
      'converted to null) and sales are not available for licensed stores at all. Company-operated ' +
      'stores have NO street address — store_name is a corner name; never invent an address for ' +
      'them (licensed stores do have one). If company_operated is non-empty, WHITE_SPACE is not an ' +
      'available call.',
    company_operated,
    licensed_stores,
  };
}

async function queryMunicipalProjects(
  service: SupabaseClient,
  args: { latitude: number; longitude: number; radius_miles?: number; min_units?: number },
  siteSubmitId: string | null,
) {
  const { latitude, longitude } = args;
  const radius = Math.min(Math.max(args.radius_miles ?? 3, 0.5), 25);
  const minUnits = Math.max(args.min_units ?? 0, 0);
  const pt = { lat: latitude, lng: longitude };
  const bb = bboxFor(latitude, longitude, radius);

  // ---- approved: human-reviewed, committed, geocoded ----
  const { data: approvedRows, error: aErr } = await service
    .from('municipal_project_v')
    .select(
      'id, project_name, address, total_housing_units, builder_developer, zoning, source, ' +
        'effective_stage_name, municipality_name, centroid_lat, centroid_lng',
    )
    .gte('centroid_lat', bb.south).lte('centroid_lat', bb.north)
    .gte('centroid_lng', bb.west).lte('centroid_lng', bb.east)
    .not('centroid_lat', 'is', null);
  if (aErr) throw new Error(`municipal_project lookup failed: ${aErr.message}`);

  const approved = ((approvedRows ?? []) as unknown as Array<Record<string, unknown>>)
    .map((r) => ({
      review_status: 'approved' as const,
      project_name: (r.project_name as string) ?? null,
      address: (r.address as string) ?? null,
      total_housing_units: (r.total_housing_units as number) ?? null,
      status: (r.effective_stage_name as string) ?? null,
      builder_developer: (r.builder_developer as string) ?? null,
      zoning: (r.zoning as string) ?? null,
      source: (r.source as string) ?? null,
      municipality: (r.municipality_name as string) ?? null,
      distance_miles: round1(
        haversineMiles(pt, { lat: Number(r.centroid_lat), lng: Number(r.centroid_lng) }),
      ),
    }))
    .filter((r) => r.distance_miles <= radius)
    .filter((r) => (r.total_housing_units ?? 0) >= minUnits || r.total_housing_units === null)
    .sort((a, b) => a.distance_miles - b.distance_miles)
    .slice(0, 60);

  // ---- pending: agent-discovered, NOT yet reviewed, NOT yet geocoded ----
  // Staging rows carry no coordinates (they are geocoded only at approval), so
  // they cannot be distance-filtered. They are instead scoped to this site's own
  // research runs, which were already bounded by the radius the researcher chose.
  let pending: Array<Record<string, unknown>> = [];
  if (siteSubmitId) {
    const { data: runs } = await service
      .from('research_run')
      .select('id')
      .eq('site_submit_id', siteSubmitId);
    const runIds = ((runs ?? []) as Array<{ id: string }>).map((r) => r.id);
    if (runIds.length > 0) {
      const { data: stagingRows, error: sErr } = await service
        .from('municipal_project_staging')
        .select(
          'project_name, address, total_housing_units, builder_developer, zoning, source, ' +
            'location_description, approval_state, research_run_id',
        )
        .in('research_run_id', runIds)
        .eq('approval_state', 'pending')
        .limit(200);
      if (sErr) throw new Error(`staging lookup failed: ${sErr.message}`);
      pending = ((stagingRows ?? []) as unknown as Array<Record<string, unknown>>)
        .filter((r) => ((r.total_housing_units as number) ?? 0) >= minUnits || r.total_housing_units === null)
        .map((r) => ({
          review_status: 'pending_unreviewed' as const,
          project_name: r.project_name ?? null,
          address: r.address ?? null,
          total_housing_units: r.total_housing_units ?? null,
          status: null,
          builder_developer: r.builder_developer ?? null,
          zoning: r.zoning ?? null,
          source: r.source ?? null,
          location_description: r.location_description ?? null,
          distance_miles: null,
        }));
    }
  }

  return {
    note:
      'approved[] are human-reviewed and committed — cite them as confirmed. pending[] are ' +
      'agent-discovered and NOT yet reviewed by a human: you MUST label them unreviewed wherever ' +
      'you cite them, and must not present their unit counts as established fact. Pending rows are ' +
      'not geocoded, so distance_miles is null for them; they are scoped to this site\'s own ' +
      'research runs rather than to the radius you passed. No minimum unit threshold was applied — ' +
      'a cluster of small projects is still a rooftops story.',
    radius_miles: radius,
    approved_count: approved.length,
    pending_unreviewed_count: pending.length,
    approved,
    pending,
  };
}

// ---------------------------------------------------------------------------
// Dispatch
// ---------------------------------------------------------------------------
export async function executeTool(
  service: SupabaseClient,
  name: string,
  input: Record<string, unknown>,
  ctx: { siteSubmitId: string | null },
): Promise<unknown> {
  switch (name) {
    case 'query_traffic_counts':
      return await queryTrafficCounts(service, input as never);
    case 'query_nearby_starbucks':
      return await queryNearbyStarbucks(service, input as never);
    case 'query_municipal_projects':
      return await queryMunicipalProjects(service, input as never, ctx.siteSubmitId);
    default:
      throw new Error(`unknown tool: ${name}`);
  }
}
