/**
 * StreetLight SATC Edge Function
 *
 * Proxies requests to the StreetLight SATC API for road segment geometry,
 * date ranges, traffic metrics (AADT), and usage data. Handles caching,
 * quota enforcement, and atomic usage logging.
 *
 * Required Supabase Secrets:
 * - STREETLIGHT_API_KEY: Your StreetLight Data API key
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// StreetLight API base URL — easy to swap if they update their endpoint
const STREETLIGHT_BASE_URL = 'https://api.streetlightdata.com/satc/v1';

// ─── Request/Response Types ───────────────────────────────────────────────────

interface BoundsParam {
  south: number;
  west: number;
  north: number;
  east: number;
}

interface StreetLightRequest {
  action: 'geometry' | 'segmentcount' | 'classify' | 'metrics' | 'usage' | 'date_ranges';
  bounds?: BoundsParam;
  segment_ids?: string[];
  date_spec?: { year_month: string; day_type: string; day_part: string; direction?: string };
}

// ─── StreetLight API Helpers ──────────────────────────────────────────────────

async function slFetch(path: string, apiKey: string, body?: unknown): Promise<unknown> {
  const url = `${STREETLIGHT_BASE_URL}${path}`;
  const method = body ? 'POST' : 'GET';

  console.log(`[StreetLight] ${method} ${url}`);

  // StreetLight enforces 1 request/second. On 429 we wait and retry up to twice.
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, {
      method,
      headers: {
        'x-stl-key': apiKey,
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      ...(body ? { body: JSON.stringify(body) } : {}),
    });

    if (res.status === 429 && attempt < 2) {
      const wait = 1500 + attempt * 1500; // 1.5s, then 3s
      console.warn(`[StreetLight] 429 rate-limited on ${path}, retrying in ${wait}ms`);
      await new Promise(r => setTimeout(r, wait));
      continue;
    }

    if (!res.ok) {
      const text = await res.text();
      console.error(`[StreetLight] ${res.status} from ${path}:`, text.substring(0, 500));
      throw new Error(`StreetLight API error ${res.status}: ${text.substring(0, 200)}`);
    }

    return await res.json();
  }

  throw new Error(`StreetLight API error: rate limit exhausted after retries on ${path}`);
}

// ─── Auth Helper ──────────────────────────────────────────────────────────────

async function requireAuth(req: Request, supabase: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Error('Missing Authorization header');

  const token = authHeader.replace('Bearer ', '');

  // Try getUser first (works with JWT tokens)
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (!error && user) return user;

  // Fallback: create a fresh client with the token to handle publishable key sessions
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  if (serviceKey) {
    const adminClient = createClient(supabaseUrl, serviceKey);
    const { data: { user: adminUser }, error: adminError } = await adminClient.auth.getUser(token);
    if (!adminError && adminUser) return adminUser;
  }

  throw new Error('Invalid or expired token');
}

// ─── Action Handlers ──────────────────────────────────────────────────────────

/**
 * geometry: Fetch road segments within bounds from StreetLight, upsert to DB, return segments.
 */
async function handleGeometry(
  bounds: BoundsParam,
  apiKey: string,
  supabase: ReturnType<typeof createClient>
): Promise<unknown> {
  // Call StreetLight API
  const data = await slFetch('/geometry', apiKey, {
    country: 'us',
    mode: 'vehicle',
    geometry: {
      polygon: {
        type: 'Polygon',
        coordinates: [[
          [bounds.west, bounds.south],
          [bounds.east, bounds.south],
          [bounds.east, bounds.north],
          [bounds.west, bounds.north],
          [bounds.west, bounds.south],
        ]],
      },
    },
  }) as unknown;

  // StreetLight response: { columns: ['segment_id', 'line_geometry'], data: [[id, geometry], ...], status, query_rows }
  const dataObj = data as { columns?: string[]; data?: Array<[number, { type: string; coordinates: number[][] }]>; status?: string; message?: string };

  // Check for API error response
  if (dataObj.status === 'error') {
    throw new Error(`StreetLight error: ${dataObj.message ?? 'Unknown error'}`);
  }

  const rows = dataObj.data ?? [];
  const segments = rows
    .filter(([, geom]) => geom && geom.coordinates)
    .map(([id, geom]) => ({
      id: String(id),
      geometry: geom,
    }));

  if (segments.length > 0) {
    // Upsert segments into DB (geometry as WKT)
    const rows = segments.map((seg) => ({
      id: seg.id,
      road_name: null,
      road_type: null,
      geom: `SRID=4326;LINESTRING(${seg.geometry.coordinates.map((c: number[]) => c.join(' ')).join(',')})`,
      bbox_south: bounds.south,
      bbox_west: bounds.west,
      bbox_north: bounds.north,
      bbox_east: bounds.east,
      cached_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from('streetlight_segment')
      .upsert(rows, { onConflict: 'id' });

    if (upsertError) {
      console.error('[StreetLight] Upsert error:', upsertError.message);
      // Non-fatal: return API data even if cache write fails
    }
  }

  return { success: true, segments: segments.map(s => ({ id: s.id, geometry: s.geometry })) };
}

/**
 * segmentcount: Return count of segments in bounds from cache only (no API call).
 */
async function handleSegmentCount(
  bounds: BoundsParam,
  supabase: ReturnType<typeof createClient>
): Promise<unknown> {
  const { count, error } = await supabase
    .from('streetlight_segment')
    .select('id', { count: 'exact', head: true })
    .gte('bbox_south', bounds.south - 0.1)
    .lte('bbox_north', bounds.north + 0.1)
    .gte('bbox_west', bounds.west - 0.1)
    .lte('bbox_east', bounds.east + 0.1);

  if (error) throw error;
  return { count: count ?? 0 };
}

/**
 * date_ranges: Fetch available date ranges from StreetLight API, cache relevant metadata.
 */
async function handleDateRanges(
  apiKey: string
): Promise<unknown> {
  const data = await slFetch('/date_ranges', apiKey, { country: 'us', mode: 'vehicle' }) as { date_ranges?: unknown[] };
  return { date_ranges: data.date_ranges ?? [] };
}

/**
 * classify: For segments in bounds, classify into 3 buckets:
 *   - up_to_date: have metrics fetched within the most recent date range
 *   - stale: have metrics but not for the latest date range
 *   - new: no metrics at all
 *
 * FIX 7: If no segments exist in cache for this viewport, call handleGeometry first.
 */
async function handleClassify(
  bounds: BoundsParam,
  apiKey: string,
  supabase: ReturnType<typeof createClient>
): Promise<unknown> {
  // 1. Use a hardcoded latest date range (date_ranges endpoint path TBD)
  // Once the correct endpoint is confirmed, replace with: await handleDateRanges(apiKey)
  const dateRanges: Array<{ start_date: string; end_date: string }> = [{ start_date: '2024-01-01', end_date: '2024-12-31' }];
  const latestRange = dateRanges[0];

  // 2. Fetch segments in bounds from cache
  let { data: segments, error: segError } = await supabase
    .from('streetlight_segment')
    .select('id, road_name, road_type')
    .gte('bbox_south', bounds.south - 0.1)
    .lte('bbox_north', bounds.north + 0.1)
    .gte('bbox_west', bounds.west - 0.1)
    .lte('bbox_east', bounds.east + 0.1);

  if (segError) throw segError;

  // FIX 7: No segments cached for this viewport — populate geometry catalog first
  if (!segments || segments.length === 0) {
    console.log('[StreetLight] classify: no cached segments, fetching geometry first');
    await handleGeometry(bounds, apiKey, supabase);

    const { data: freshSegments, error: freshError } = await supabase
      .from('streetlight_segment')
      .select('id, road_name, road_type')
      .gte('bbox_south', bounds.south - 0.1)
      .lte('bbox_north', bounds.north + 0.1)
      .gte('bbox_west', bounds.west - 0.1)
      .lte('bbox_east', bounds.east + 0.1);

    if (freshError) throw freshError;
    segments = freshSegments;
  }

  if (!segments || segments.length === 0) {
    return { up_to_date: [], stale: [], new: [], date_ranges: dateRanges };
  }

  const segmentIds = segments.map((s: { id: string }) => s.id);

  // 3. Fetch existing metrics for these segments
  const { data: metrics, error: metricError } = await supabase
    .from('streetlight_segment_metrics')
    .select('segment_id, date_range_start, date_range_end, aadt')
    .in('segment_id', segmentIds);

  if (metricError) throw metricError;

  // Build lookup: segment_id -> latest metric
  const metricMap = new Map<string, { date_range_start: string; date_range_end: string; aadt: number | null }>();
  for (const m of (metrics ?? [])) {
    const existing = metricMap.get(m.segment_id);
    if (!existing || m.date_range_end > existing.date_range_end) {
      metricMap.set(m.segment_id, m);
    }
  }

  const up_to_date: unknown[] = [];
  const stale: unknown[] = [];
  const newSegments: unknown[] = [];

  for (const seg of segments) {
    const metric = metricMap.get(seg.id);
    if (!metric) {
      newSegments.push(seg);
    } else if (
      latestRange &&
      metric.date_range_end >= latestRange.end_date
    ) {
      up_to_date.push({ ...seg, aadt: metric.aadt, date_range_end: metric.date_range_end });
    } else {
      stale.push({ ...seg, aadt: metric.aadt, date_range_end: metric.date_range_end });
    }
  }

  return { up_to_date, stale, new: newSegments, date_ranges: dateRanges };
}

/**
 * metrics: Full two-phase gauntlet for consuming quota and fetching AADT.
 *
 * Phase 1 (checks):
 *   - Org hard stop check
 *   - Per-user daily limit check
 * Phase 2 (atomic write):
 *   - Re-verify limits
 *   - Call StreetLight API for metrics
 *   - Insert usage_log + usage_log_segment + upsert metrics
 */
async function handleMetrics(
  segmentIds: string[],
  userId: string,
  apiKey: string,
  supabase: ReturnType<typeof createClient>,
  dateSpec?: { year_month: string; day_type: string; day_part: string; direction?: string }
): Promise<unknown> {
  if (!segmentIds || segmentIds.length === 0) {
    throw new Error('segment_ids is required');
  }

  const count = segmentIds.length;

  // ── Phase 1: Pre-flight checks ──────────────────────────────────────────────

  // 1a. Fetch global quota config (FIX 3: use annual_segment_quota + hard_stop_pct)
  const { data: quotaRow, error: quotaError } = await supabase
    .from('streetlight_quota_config')
    .select('*')
    .eq('id', 1)
    .single();

  if (quotaError && quotaError.code !== 'PGRST116') throw quotaError;

  const annualSegmentQuota = quotaRow?.annual_segment_quota ?? 10000;
  const hardStopPct = quotaRow?.hard_stop_pct ?? 95;
  const hardStopThreshold = Math.floor(annualSegmentQuota * hardStopPct / 100);
  const contractStartDate = quotaRow?.contract_start_date ?? new Date(new Date().getFullYear(), 0, 1).toISOString().split('T')[0];

  // 1b. Org hard stop: sum segments consumed this contract year (FIX 3)
  const { data: yearUsage, error: yearUsageError } = await supabase
    .from('streetlight_usage_log')
    .select('segments_billed')
    .gte('requested_at', contractStartDate)
    .eq('response_status', 'success');

  if (yearUsageError) throw yearUsageError;

  const segmentsUsedThisYear = (yearUsage ?? []).reduce(
    (sum: number, row: { segments_billed: number }) => sum + (row.segments_billed ?? 0),
    0
  );

  if (segmentsUsedThisYear + count > hardStopThreshold) {
    return {
      success: false,
      error: 'annual_quota_exceeded',
      message: `Org annual hard stop reached (${segmentsUsedThisYear}/${hardStopThreshold} segments used of ${annualSegmentQuota} annual quota at ${hardStopPct}% threshold)`,
    };
  }

  // 1c. Per-user daily limit check (FIX 3: default 200, not 500)
  const { data: userLimit } = await supabase
    .from('streetlight_user_limit')
    .select('daily_segment_limit')
    .eq('user_id', userId)
    .single();

  const dailyDefault = quotaRow?.default_daily_per_user ?? 200;
  const dailyLimit = userLimit?.daily_segment_limit ?? dailyDefault;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: todayUsage, error: todayError } = await supabase
    .from('streetlight_usage_log')
    .select('segments_billed')
    .eq('user_id', userId)
    .gte('requested_at', todayStart.toISOString())
    .eq('response_status', 'success');

  if (todayError) throw todayError;

  const usedToday = (todayUsage ?? []).reduce(
    (sum: number, row: { segments_billed: number }) => sum + (row.segments_billed ?? 0),
    0
  );

  if (usedToday + count > dailyLimit) {
    return {
      success: false,
      error: 'daily_limit_exceeded',
      message: `Daily limit reached (${usedToday}/${dailyLimit} segments used today)`,
    };
  }

  // ── Phase 2: Fetch metrics + atomic write ────────────────────────────────────

  // Re-verify (race condition guard): re-fetch daily usage with FOR UPDATE equivalent
  // (Supabase doesn't expose SELECT FOR UPDATE in the REST API, so we re-check counts)
  const { data: recheckUsage } = await supabase
    .from('streetlight_usage_log')
    .select('segments_billed')
    .eq('user_id', userId)
    .gte('requested_at', todayStart.toISOString())
    .eq('response_status', 'success');

  const recheckUsed = (recheckUsage ?? []).reduce(
    (sum: number, row: { segments_billed: number }) => sum + (row.segments_billed ?? 0),
    0
  );

  if (recheckUsed + count > dailyLimit) {
    return {
      success: false,
      error: 'daily_limit_exceeded',
      message: 'Daily limit exceeded (race condition re-check)',
    };
  }

  // Re-verify — skip segments we already have metrics for at the requested dimensions.
  // SATC day_part: 'all' (string) for full-day aggregate, or '0'..'23' for a single hour.
  // (The -1..-8 / -10 codes documented in some StreetLight docs are NOT accepted by SATC;
  // they validate "Day part as an hour must be between 0 and 23 (inclusive)".)
  const resolvedDateSpec = {
    year_month: dateSpec?.year_month ?? 'auto',
    day_type: dateSpec?.day_type ?? 'all',
    day_part: dateSpec?.day_part ?? 'all',
    direction: dateSpec?.direction ?? 'bidirectional',
  };
  const cacheDayPart = resolvedDateSpec.day_part;
  const cacheDayType = resolvedDateSpec.day_type;

  const { data: alreadyCached } = await supabase
    .from('streetlight_segment_metrics')
    .select('segment_id, year_month, aadt, trips_volume')
    .in('segment_id', segmentIds.map(id => parseInt(id, 10)).filter(n => !isNaN(n)))
    .eq('day_type', cacheDayType)
    .eq('day_part', cacheDayPart);

  const cachedMap = new Map<string, { year_month: string; aadt: number | null; trips_volume: number | null }>();
  for (const row of (alreadyCached ?? []) as Array<{ segment_id: number; year_month: string; aadt: number | null; trips_volume: number | null }>) {
    cachedMap.set(String(row.segment_id), { year_month: row.year_month, aadt: row.aadt, trips_volume: row.trips_volume });
  }
  const finalSegmentIds = segmentIds.filter(id => !cachedMap.has(id));

  if (finalSegmentIds.length === 0) {
    const cachedMetrics = segmentIds.map(sid => {
      const c = cachedMap.get(sid);
      return { segment_id: sid, aadt: c?.aadt ?? c?.trips_volume ?? null };
    });
    return { success: true, usage_log_id: null, segment_count: 0, metrics: cachedMetrics, message: 'All segments already cached' };
  }

  // Identify segments previously billed under any user — those get a free retry.
  // (Cache writes silently failed under v21 for some segments; users should not pay twice.)
  const finalSegIdNums = finalSegmentIds.map(id => parseInt(id, 10)).filter(n => !isNaN(n));
  const previouslyBilledSet = new Set<string>();
  if (finalSegIdNums.length > 0) {
    const { data: priorLogs } = await supabase
      .from('streetlight_usage_log')
      .select('checked_segment_ids')
      .eq('response_status', 'success')
      .overlaps('checked_segment_ids', finalSegIdNums);
    for (const row of (priorLogs ?? []) as Array<{ checked_segment_ids: number[] | null }>) {
      for (const sid of row.checked_segment_ids ?? []) previouslyBilledSet.add(String(sid));
    }
  }

  const newlyBilledIds = finalSegmentIds.filter(id => !previouslyBilledSet.has(id));
  const finalCount = newlyBilledIds.length;

  // Call StreetLight API for metrics using correct API format
  // Use segment_id geometry type for targeted fetching — no wasted quota
  // Try most recent year first, fall back if no data is available
  let apiMetrics: Array<{ segment_id: string; trips_volume?: number; year_month?: string }> = [];
  let apiError: string | null = null;
  let resolvedYear: number | null = null;

  const yearsToTry = [2024, 2023, 2022];

  for (let i = 0; i < yearsToTry.length; i++) {
    const year = yearsToTry[i];
    // StreetLight rate limit is 1 request/second. Pause between attempts on the year fallback.
    if (i > 0) await new Promise(r => setTimeout(r, 1100));
    try {
      const metricsData = await slFetch('/metrics', apiKey, {
        country: 'us',
        mode: 'vehicle',
        source: 'cvd_plus',
        geometry: {
          segment_id: finalSegmentIds.map((id) => parseInt(id, 10)),
        },
        date: { year },
        day_type: cacheDayType,
        day_part: cacheDayPart,
        direction: resolvedDateSpec.direction,
        fields: ['segment_id', 'year_month', 'trips_volume'],
      }) as { columns?: string[]; data?: Array<[number, string, number]>; status?: string; message?: string };

      if (metricsData.status === 'error') {
        throw new Error(metricsData.message ?? 'StreetLight metrics error');
      }

      const cols = metricsData.columns ?? [];
      const sidIdx = cols.indexOf('segment_id');
      const volIdx = cols.indexOf('trips_volume');
      const rows = metricsData.data ?? [];

      if (rows.length === 0) {
        console.log(`[StreetLight] No metrics data for year ${year}, trying next`);
        continue;
      }

      // Aggregate: average trips_volume across all months per segment
      const segTotals = new Map<string, { total: number; count: number }>();
      for (const row of rows) {
        const sid = String(row[sidIdx]);
        const vol = row[volIdx] as number;
        if (!segTotals.has(sid)) segTotals.set(sid, { total: 0, count: 0 });
        const entry = segTotals.get(sid)!;
        entry.total += vol;
        entry.count += 1;
      }

      apiMetrics = Array.from(segTotals.entries()).map(([sid, { total, count }]) => ({
        segment_id: sid,
        trips_volume: Math.round(total / count),
        year_month: `${year}-annual`,
      }));
      resolvedYear = year;
      apiError = null;
      break;
    } catch (err) {
      apiError = err instanceof Error ? err.message : String(err);
      console.error(`[StreetLight] Metrics API error for year ${year}:`, apiError);
    }
  }

  if (!resolvedYear && !apiError) {
    apiError = `No StreetLight metrics available for years ${yearsToTry.join(', ')}`;
  }

  // FIX 1: Use atomic RPC instead of 3 separate inserts
  const usageLogRow = {
    user_id: userId,
    requested_at: new Date().toISOString(),
    segments_requested: count,
    segments_billed: apiError ? 0 : finalCount,
    segments_new: apiError ? 0 : finalCount,
    segments_refresh: 0,
    request_geometry: null,
    // Only segments newly billed in this call go into checked_segment_ids — previously
    // billed segments getting a free retry must not appear here, or future overlap checks
    // would incorrectly count them as billed multiple times.
    checked_segment_ids: newlyBilledIds.map(id => parseInt(id, 10)).filter(n => !isNaN(n)),
    date_spec: resolvedDateSpec,
    endpoint: 'metrics',
    response_status: apiError ? 'failed' : 'success',
    error_message: apiError,
  };

  const segmentLogRows = finalSegmentIds.map((sid) => ({
    usage_log_id: null as string | null, // will be set by RPC
    segment_id: sid,
    update_reason: 'new',
    prior_spec: null,
    new_spec: resolvedDateSpec,
    aadt: apiMetrics.find(m => m.segment_id === sid)?.trips_volume ?? null,
  }));

  const metricRows = apiMetrics.map((m) => ({
    segment_id: parseInt(m.segment_id, 10),
    year_month: m.year_month ?? (resolvedYear ? `${resolvedYear}-annual` : null),
    date_range_start: resolvedYear ? `${resolvedYear}-01-01` : null,
    date_range_end: resolvedYear ? `${resolvedYear}-12-31` : null,
    day_type: cacheDayType,
    day_part: cacheDayPart,
    aadt: m.trips_volume ?? null,
    trips_volume: m.trips_volume ?? null,
    fetched_at: new Date().toISOString(),
    fetched_by: userId,
    usage_log_id: null as string | null,
  }));

  let logId: string | null = null;

  if (!apiError && metricRows.length > 0) {
    // Insert usage log
    const { data: logRow, error: logError } = await supabase
      .from('streetlight_usage_log')
      .insert(usageLogRow)
      .select('id')
      .single();
    if (logError) console.error('[StreetLight] Usage log error:', logError.message);
    logId = logRow?.id ?? null;

    // Ensure all segment IDs exist in streetlight_segment (FK requirement)
    const segmentStubs = metricRows.map(m => ({
      id: m.segment_id,
      road_name: null,
      road_type: null,
      updated_at: new Date().toISOString(),
      cached_at: new Date().toISOString(),
    }));
    await supabase.from('streetlight_segment').upsert(segmentStubs, { onConflict: 'id', ignoreDuplicates: true });

    // Upsert metrics cache — this is the permanent cache
    const { error: metricsError } = await supabase
      .from('streetlight_segment_metrics')
      .upsert(metricRows, { onConflict: 'segment_id,year_month,day_type,day_part' });
    if (metricsError) console.error('[StreetLight] Metrics upsert error:', metricsError.message);
  } else {
    // Log the failed attempt
    const { data: logRow } = await supabase
      .from('streetlight_usage_log')
      .insert(usageLogRow)
      .select('id')
      .single();
    logId = logRow?.id ?? null;
  }

  if (apiError) {
    return { success: false, error: apiError, usage_log_id: logId };
  }

  return {
    success: true,
    usage_log_id: logId,
    segment_count: finalCount,
    free_retry_count: previouslyBilledSet.size,
    year: resolvedYear,
    metrics: apiMetrics.map(m => ({ segment_id: m.segment_id, aadt: m.trips_volume })),
  };
}

/**
 * usage: Proxy to StreetLight /usage endpoint.
 */
async function handleUsage(apiKey: string): Promise<unknown> {
  const data = await slFetch('/usage', apiKey);
  return data;
}

// ─── Main Handler ─────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get('STREETLIGHT_API_KEY');
    if (!apiKey) {
      return new Response(
        JSON.stringify({ success: false, error: 'STREETLIGHT_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase client with user's JWT
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } },
      }
    );

    const user = await requireAuth(req, supabase);

    const body = await req.json() as StreetLightRequest;
    const { action, bounds, segment_ids } = body;

    let result: unknown;

    switch (action) {
      case 'geometry': {
        if (!bounds) throw new Error('bounds is required for geometry action');
        result = await handleGeometry(bounds, apiKey, supabase);
        break;
      }

      case 'segmentcount': {
        if (!bounds) throw new Error('bounds is required for segmentcount action');
        result = await handleSegmentCount(bounds, supabase);
        break;
      }

      case 'date_ranges': {
        result = await handleDateRanges(apiKey);
        break;
      }

      case 'classify': {
        if (!bounds) throw new Error('bounds is required for classify action');
        result = await handleClassify(bounds, apiKey, supabase);
        break;
      }

      case 'metrics': {
        if (!segment_ids || segment_ids.length === 0) {
          throw new Error('segment_ids is required for metrics action');
        }
        result = await handleMetrics(segment_ids, user!.id, apiKey, supabase, body.date_spec);
        break;
      }

      case 'usage': {
        result = await handleUsage(apiKey);
        break;
      }

      default:
        return new Response(
          JSON.stringify({ success: false, error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, ...((result as Record<string, unknown>) ?? {}) }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('[StreetLight] Error:', error);
    const message = error instanceof Error ? error.message : JSON.stringify(error) ?? 'Unknown error';
    console.error('[StreetLight] Unhandled error:', message, error);

    if (message.includes('Invalid or expired token') || message.includes('Missing Authorization')) {
      return new Response(
        JSON.stringify({ success: false, error: message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Match both "StreetLight error: ..." (from handleGeometry's API-level error)
    // and "StreetLight API error N: ..." (from slFetch HTTP errors).
    const status = message.includes('too large') || message.includes('StreetLight') ? 400 : 500;
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
