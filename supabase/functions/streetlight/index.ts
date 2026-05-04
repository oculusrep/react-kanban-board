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
  date_spec?: { year_month: string; day_type: string; day_part: string };
}

// ─── StreetLight API Helpers ──────────────────────────────────────────────────

async function slFetch(path: string, apiKey: string, body?: unknown): Promise<unknown> {
  const url = `${STREETLIGHT_BASE_URL}${path}`;
  const method = body ? 'POST' : 'GET';

  console.log(`[StreetLight] ${method} ${url}`);

  const res = await fetch(url, {
    method,
    headers: {
      'x-stl-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error(`[StreetLight] ${res.status} from ${path}:`, text.substring(0, 500));
    throw new Error(`StreetLight API error ${res.status}: ${text.substring(0, 200)}`);
  }

  return await res.json();
}

// ─── Auth Helper ──────────────────────────────────────────────────────────────

async function requireAuth(req: Request, supabase: ReturnType<typeof createClient>) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) throw new Error('Missing Authorization header');

  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Invalid or expired token');
  return user;
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
      type: 'polygon',
      bbox: [bounds.west, bounds.south, bounds.east, bounds.north],
    },
  }) as { segments?: Array<{
    id: string;
    road_name?: string;
    road_type?: string;
    geometry: { type: string; coordinates: number[][] };
  }> };

  const segments = data.segments ?? [];

  if (segments.length > 0) {
    // Upsert segments into DB (geometry as WKT)
    const rows = segments.map((seg) => ({
      id: seg.id,
      road_name: seg.road_name ?? null,
      road_type: seg.road_type ?? null,
      // PostGIS: store as GeoJSON string for st_geomfromgeojson
      geom: `SRID=4326;LINESTRING(${seg.geometry.coordinates.map((c) => c.join(' ')).join(',')})`,
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

  return { segments };
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
  // 1. Get available date ranges
  const dateRangesData = await handleDateRanges(apiKey) as { date_ranges: Array<{ start_date: string; end_date: string }> };
  const dateRanges = dateRangesData.date_ranges ?? [];
  const latestRange = dateRanges.length > 0 ? dateRanges[dateRanges.length - 1] : null;

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
  dateSpec?: { year_month: string; day_type: string; day_part: string }
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
    .gte('called_at', contractStartDate)
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
    .gte('called_at', todayStart.toISOString())
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
    .gte('called_at', todayStart.toISOString())
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

  // FIX 4: Re-verify — remove segments that got cached since the modal opened
  const resolvedDateSpec = dateSpec ?? { year_month: '2024-annual', day_type: 'all_days', day_part: 'all_day' };

  const { data: alreadyCached } = await supabase
    .from('streetlight_segment_metrics')
    .select('segment_id')
    .in('segment_id', segmentIds)
    .eq('year_month', resolvedDateSpec.year_month)
    .eq('day_type', resolvedDateSpec.day_type)
    .eq('day_part', resolvedDateSpec.day_part);

  const cachedIds = new Set(alreadyCached?.map((r: { segment_id: string }) => r.segment_id) ?? []);
  const finalSegmentIds = segmentIds.filter(id => !cachedIds.has(id));

  if (finalSegmentIds.length === 0) {
    return { success: true, usage_log_id: null, segment_count: 0, metrics: [], message: 'All segments already cached' };
  }

  const finalCount = finalSegmentIds.length;

  // Fetch date ranges to get latest
  const dateRangesData = await handleDateRanges(apiKey) as { date_ranges: Array<{ start_date: string; end_date: string }> };
  const dateRanges = dateRangesData.date_ranges ?? [];
  const latestRange = dateRanges.length > 0 ? dateRanges[dateRanges.length - 1] : { start_date: '2023-01-01', end_date: '2023-12-31' };

  // Call StreetLight API for metrics
  let apiMetrics: Array<{ segment_id: string; aadt?: number; [key: string]: unknown }> = [];
  let apiError: string | null = null;

  try {
    const metricsData = await slFetch('/metrics', apiKey, {
      segment_ids: finalSegmentIds,
      date_range: { start_date: latestRange.start_date, end_date: latestRange.end_date },
    }) as { metrics?: Array<{ segment_id: string; aadt?: number; [key: string]: unknown }> };

    apiMetrics = metricsData.metrics ?? [];
  } catch (err) {
    apiError = err instanceof Error ? err.message : String(err);
    console.error('[StreetLight] Metrics API error:', apiError);
  }

  // FIX 1: Use atomic RPC instead of 3 separate inserts
  const usageLogRow = {
    user_id: userId,
    called_at: new Date().toISOString(),
    segments_requested: count,
    segments_billed: apiError ? 0 : finalCount,
    segments_new: apiError ? 0 : finalCount,
    segments_refresh: 0,
    request_geometry: null,
    checked_segment_ids: segmentIds.map(id => parseInt(id, 10)).filter(n => !isNaN(n)),
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
    aadt: apiMetrics.find(m => m.segment_id === sid)?.aadt ?? null,
  }));

  const metricRows = apiMetrics.map((m) => ({
    segment_id: m.segment_id,
    year_month: resolvedDateSpec.year_month,
    day_type: resolvedDateSpec.day_type,
    day_part: resolvedDateSpec.day_part,
    aadt: m.aadt ?? null,
    fetched_at: new Date().toISOString(),
    fetched_by: userId,
    usage_log_id: null as string | null, // filled by RPC return
  }));

  let logId: string | null = null;

  if (!apiError && metricRows.length > 0) {
    const { data: rpcResult, error: rpcError } = await supabase.rpc('streetlight_record_spend', {
      p_usage_log: usageLogRow,
      p_segments: segmentLogRows,
      p_metrics: metricRows,
    });

    if (rpcError) {
      console.error('[StreetLight] Atomic RPC error:', rpcError.message);
      // Fallback: best-effort insert just the log
      const { data: logRow } = await supabase
        .from('streetlight_usage_log')
        .insert(usageLogRow)
        .select('id')
        .single();
      logId = logRow?.id ?? null;
    } else {
      logId = rpcResult as string;
    }
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
    metrics: apiMetrics,
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

    // Auth required for all actions
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
        result = await handleMetrics(segment_ids, user.id, apiKey, supabase, body.date_spec);
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
    const message = error instanceof Error ? error.message : 'Unknown error';

    if (message.includes('Invalid or expired token') || message.includes('Missing Authorization')) {
      return new Response(
        JSON.stringify({ success: false, error: message }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
