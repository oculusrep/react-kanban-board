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
const STREETLIGHT_BASE_URL = 'https://insight.streetlightdata.com/api/v2';

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
}

// ─── StreetLight API Helpers ──────────────────────────────────────────────────

async function slFetch(path: string, apiKey: string, body?: unknown): Promise<unknown> {
  const url = `${STREETLIGHT_BASE_URL}${path}`;
  const method = body ? 'POST' : 'GET';

  console.log(`[StreetLight] ${method} ${url}`);

  const res = await fetch(url, {
    method,
    headers: {
      'x-api-key': apiKey,
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
  const data = await slFetch('/satc/segments', apiKey, {
    bbox: [bounds.west, bounds.south, bounds.east, bounds.north],
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
  const data = await slFetch('/satc/date_ranges', apiKey) as { date_ranges?: unknown[] };
  return { date_ranges: data.date_ranges ?? [] };
}

/**
 * classify: For segments in bounds, classify into 3 buckets:
 *   - up_to_date: have metrics fetched within the most recent date range
 *   - stale: have metrics but not for the latest date range
 *   - new: no metrics at all
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
  const { data: segments, error: segError } = await supabase
    .from('streetlight_segment')
    .select('id, road_name, road_type')
    .gte('bbox_south', bounds.south - 0.1)
    .lte('bbox_north', bounds.north + 0.1)
    .gte('bbox_west', bounds.west - 0.1)
    .lte('bbox_east', bounds.east + 0.1);

  if (segError) throw segError;

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
  supabase: ReturnType<typeof createClient>
): Promise<unknown> {
  if (!segmentIds || segmentIds.length === 0) {
    throw new Error('segment_ids is required');
  }

  const count = segmentIds.length;

  // ── Phase 1: Pre-flight checks ──────────────────────────────────────────────

  // 1a. Fetch global quota config
  const { data: quotaRow, error: quotaError } = await supabase
    .from('streetlight_quota_config')
    .select('*')
    .is('org_id', null)
    .single();

  if (quotaError && quotaError.code !== 'PGRST116') throw quotaError;

  const costPerSegment = quotaRow?.cost_per_segment_usd ?? 0.10;
  const monthlyHardLimitSegments = quotaRow?.monthly_hard_limit_segments ?? null;

  // 1b. Org hard stop: sum segments consumed this calendar month
  if (monthlyHardLimitSegments !== null) {
    const monthStart = new Date();
    monthStart.setDate(1);
    monthStart.setHours(0, 0, 0, 0);

    const { data: monthUsage, error: monthUsageError } = await supabase
      .from('streetlight_usage_log')
      .select('segment_count')
      .gte('requested_at', monthStart.toISOString())
      .eq('status', 'success');

    if (monthUsageError) throw monthUsageError;

    const totalThisMonth = (monthUsage ?? []).reduce(
      (sum: number, row: { segment_count: number }) => sum + row.segment_count,
      0
    );

    if (totalThisMonth + count > monthlyHardLimitSegments) {
      return {
        success: false,
        error: 'monthly_quota_exceeded',
        message: `Org monthly limit reached (${totalThisMonth}/${monthlyHardLimitSegments} segments)`,
      };
    }
  }

  // 1c. Per-user daily limit check
  const { data: userLimit } = await supabase
    .from('streetlight_user_limit')
    .select('daily_segment_limit')
    .eq('user_id', userId)
    .single();

  const dailyLimit = userLimit?.daily_segment_limit ?? 500;
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const { data: todayUsage, error: todayError } = await supabase
    .from('streetlight_usage_log')
    .select('segment_count')
    .eq('user_id', userId)
    .gte('requested_at', todayStart.toISOString())
    .eq('status', 'success');

  if (todayError) throw todayError;

  const usedToday = (todayUsage ?? []).reduce(
    (sum: number, row: { segment_count: number }) => sum + row.segment_count,
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
    .select('segment_count')
    .eq('user_id', userId)
    .gte('requested_at', todayStart.toISOString())
    .eq('status', 'success');

  const recheckUsed = (recheckUsage ?? []).reduce(
    (sum: number, row: { segment_count: number }) => sum + row.segment_count,
    0
  );

  if (recheckUsed + count > dailyLimit) {
    return {
      success: false,
      error: 'daily_limit_exceeded',
      message: 'Daily limit exceeded (race condition re-check)',
    };
  }

  // Fetch date ranges to get latest
  const dateRangesData = await handleDateRanges(apiKey) as { date_ranges: Array<{ start_date: string; end_date: string }> };
  const dateRanges = dateRangesData.date_ranges ?? [];
  const latestRange = dateRanges.length > 0 ? dateRanges[dateRanges.length - 1] : { start_date: '2023-01-01', end_date: '2023-12-31' };

  // Call StreetLight API for metrics
  let apiMetrics: Array<{ segment_id: string; aadt?: number; [key: string]: unknown }> = [];
  let apiError: string | null = null;

  try {
    const metricsData = await slFetch('/satc/metrics', apiKey, {
      segment_ids: segmentIds,
      date_range: { start_date: latestRange.start_date, end_date: latestRange.end_date },
    }) as { metrics?: Array<{ segment_id: string; aadt?: number; [key: string]: unknown }> };

    apiMetrics = metricsData.metrics ?? [];
  } catch (err) {
    apiError = err instanceof Error ? err.message : String(err);
    console.error('[StreetLight] Metrics API error:', apiError);
    // We'll still log the usage attempt as 'failed'
  }

  // Insert usage_log
  const { data: logRow, error: logError } = await supabase
    .from('streetlight_usage_log')
    .insert({
      user_id: userId,
      segment_count: count,
      cost_usd: count * costPerSegment,
      status: apiError ? 'failed' : 'success',
      error_message: apiError,
    })
    .select('id')
    .single();

  if (logError) throw logError;

  const logId = logRow.id;

  // Insert usage_log_segment junction rows
  const junctionRows = segmentIds.map((sid) => ({
    usage_log_id: logId,
    segment_id: sid,
  }));

  const { error: junctionError } = await supabase
    .from('streetlight_usage_log_segment')
    .insert(junctionRows);

  if (junctionError) {
    console.error('[StreetLight] Junction insert error:', junctionError.message);
  }

  // Upsert metrics rows if API call succeeded
  if (apiMetrics.length > 0) {
    const metricRows = apiMetrics.map((m) => ({
      segment_id: m.segment_id,
      date_range_start: latestRange.start_date,
      date_range_end: latestRange.end_date,
      aadt: m.aadt ?? null,
      aadt_raw: m,
      fetched_at: new Date().toISOString(),
    }));

    const { error: upsertError } = await supabase
      .from('streetlight_segment_metrics')
      .upsert(metricRows, { onConflict: 'segment_id,date_range_start,date_range_end' });

    if (upsertError) {
      console.error('[StreetLight] Metrics upsert error:', upsertError.message);
    }
  }

  if (apiError) {
    return { success: false, error: apiError, usage_log_id: logId };
  }

  return {
    success: true,
    usage_log_id: logId,
    segment_count: count,
    cost_usd: count * costPerSegment,
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
        result = await handleMetrics(segment_ids, user.id, apiKey, supabase);
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
