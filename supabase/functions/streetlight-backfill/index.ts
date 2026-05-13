/**
 * StreetLight Backfill Edge Function
 *
 * Tiles a pre-defined region into bboxes within SATC's 0.07° × 0.10° max
 * polygon size, then calls /geometry per tile to pre-populate the
 * streetlight_segment catalog. Geometry is free (only /metrics is billed),
 * so this only costs StreetLight quota on subsequent AADT clicks.
 *
 * Resumable: progress is stored in streetlight_backfill_progress (one row per
 * region). Each invocation processes up to MAX_TILES_PER_RUN tiles or until
 * the timeout budget runs out. Re-invoke with the same region to continue.
 *
 * Admin-only: requires the caller's ovis_role to have
 * `can_admin_traffic_quota: true` in role.permissions.
 *
 * Body:
 *   { region?: 'georgia' | 'atlanta_metro' | 'peachtree_city', reset?: boolean }
 * Response:
 *   { region, processed_this_run, segments_added_this_run, tiles_total,
 *     tiles_processed_total, next_tile_index, done, last_error, message }
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient, SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2';

const STREETLIGHT_BASE_URL = 'https://api.streetlightdata.com/satc/v1';
const SATC_SOURCE = 'agps';
const OSM_VINTAGE: number[] = [202501];

// SATC max polygon bbox is 0.07° lat × 0.10° lng. Use slight margin.
const TILE_LAT_STEP = 0.065;
const TILE_LNG_STEP = 0.095;

// Per-invocation caps. SATC enforces 1 req/sec (we sleep 1100ms between calls).
// Supabase's edge-function workers also have a CPU/wall-time budget: at 50
// tiles/run we hit WORKER_RESOURCE_LIMIT once the catalog grew large (upserts
// got more expensive on a hot table). 20 tiles per run gives plenty of headroom.
const MAX_TILES_PER_RUN = 20;
const TIMEOUT_BUDGET_MS = 60_000;

const REGIONS: Record<string, { south: number; west: number; north: number; east: number }> = {
  // Whole state of Georgia, padded slightly past the political border.
  georgia: { south: 30.35, west: -85.62, north: 35.01, east: -80.75 },
  // 11-county metro Atlanta-ish footprint.
  atlanta_metro: { south: 33.40, west: -84.85, north: 34.20, east: -83.85 },
  // South-metro / Fayette / Coweta — small validation region.
  peachtree_city: { south: 33.30, west: -84.70, north: 33.55, east: -84.35 },
};

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Tile {
  south: number;
  west: number;
  north: number;
  east: number;
}

function generateTiles(bbox: Tile): Tile[] {
  const tiles: Tile[] = [];
  for (let lat = bbox.south; lat < bbox.north; lat += TILE_LAT_STEP) {
    for (let lng = bbox.west; lng < bbox.east; lng += TILE_LNG_STEP) {
      tiles.push({
        south: lat,
        west: lng,
        north: Math.min(lat + TILE_LAT_STEP, bbox.north),
        east: Math.min(lng + TILE_LNG_STEP, bbox.east),
      });
    }
  }
  return tiles;
}

async function fetchTileGeometry(apiKey: string, tile: Tile) {
  const res = await fetch(`${STREETLIGHT_BASE_URL}/geometry`, {
    method: 'POST',
    headers: {
      'x-stl-key': apiKey,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      country: 'us',
      mode: 'vehicle',
      source: SATC_SOURCE,
      osm_vintage: OSM_VINTAGE,
      geometry: {
        polygon: {
          type: 'Polygon',
          coordinates: [[
            [tile.west, tile.south],
            [tile.east, tile.south],
            [tile.east, tile.north],
            [tile.west, tile.north],
            [tile.west, tile.south],
          ]],
        },
      },
    }),
  });

  if (!res.ok) {
    const text = await res.text();
    return { ok: false as const, error: `HTTP ${res.status}: ${text.substring(0, 200)}`, segments: [] };
  }

  const json = (await res.json()) as {
    columns?: string[];
    data?: unknown[][];
    status?: string;
    message?: string;
  };

  if (json.status === 'error') {
    return { ok: false as const, error: json.message ?? 'unknown SATC error', segments: [] };
  }

  const cols = json.columns ?? [];
  const idIdx = cols.indexOf('segment_id');
  const geomIdx = cols.indexOf('line_geometry');
  if (idIdx < 0 || geomIdx < 0) {
    return { ok: false as const, error: `unexpected columns: ${JSON.stringify(cols)}`, segments: [] };
  }

  const rows = json.data ?? [];
  const segments = rows
    .map((row) => ({
      id: row[idIdx] as number | string,
      geometry: row[geomIdx] as { coordinates?: number[][] } | undefined,
    }))
    .filter((s) => !!s.geometry && Array.isArray(s.geometry.coordinates))
    .map((s) => ({
      id: String(s.id),
      coords: s.geometry!.coordinates as number[][],
    }));

  return { ok: true as const, error: null, segments };
}

async function requireAdmin(
  req: Request,
  supabaseAdmin: SupabaseClient,
  body: { internal_token?: string },
): Promise<{ id: string } | Response> {
  // Path A: internal_token (server-side operator auth, no browser session needed).
  // Token lives in streetlight_backfill_config and is rotated/cleared when the
  // backfill operation is done.
  if (body?.internal_token && typeof body.internal_token === 'string') {
    const { data: cfg } = await supabaseAdmin
      .from('streetlight_backfill_config')
      .select('internal_token')
      .eq('id', 1)
      .single();
    const stored = (cfg as { internal_token?: string } | null)?.internal_token;
    if (stored && stored === body.internal_token) {
      return { id: 'internal-operator' };
    }
    return new Response(JSON.stringify({ error: 'Invalid internal_token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Path B: standard admin user JWT.
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Missing Authorization header' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabaseAdmin.auth.getUser(token);
  if (authErr || !user) {
    return new Response(JSON.stringify({ error: 'Invalid or expired token' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: userRow } = await supabaseAdmin
    .from('user')
    .select('ovis_role')
    .eq('auth_user_id', user.id)
    .single();
  const roleName = (userRow as { ovis_role?: string } | null)?.ovis_role;
  if (!roleName) {
    return new Response(JSON.stringify({ error: 'No ovis_role for user' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const { data: roleRow } = await supabaseAdmin
    .from('role')
    .select('permissions')
    .eq('name', roleName)
    .single();
  const perms = (roleRow as { permissions?: Record<string, unknown> } | null)?.permissions;
  if (perms?.can_admin_traffic_quota !== true) {
    return new Response(JSON.stringify({ error: 'Forbidden: requires can_admin_traffic_quota' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  return { id: user.id };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get('STREETLIGHT_API_KEY');
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    if (!apiKey || !serviceKey || !supabaseUrl) {
      return new Response(JSON.stringify({ error: 'Server misconfigured (missing env)' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    const body = (await req.json().catch(() => ({}))) as {
      region?: string;
      reset?: boolean;
      internal_token?: string;
    };

    const authResult = await requireAdmin(req, supabase, body);
    if (authResult instanceof Response) return authResult;
    const region = body.region ?? 'georgia';
    if (!REGIONS[region]) {
      return new Response(
        JSON.stringify({
          error: `Unknown region: ${region}. Available: ${Object.keys(REGIONS).join(', ')}`,
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const tiles = generateTiles(REGIONS[region]);
    const totalTiles = tiles.length;

    let { data: progress } = await supabase
      .from('streetlight_backfill_progress')
      .select('*')
      .eq('region', region)
      .maybeSingle();

    if (body.reset || !progress) {
      const fresh = {
        region,
        tiles_total: totalTiles,
        tiles_processed: 0,
        next_tile_index: 0,
        segments_added: 0,
        started_at: new Date().toISOString(),
        last_run_at: new Date().toISOString(),
        completed_at: null,
        last_error: null,
      };
      const { data: upserted } = await supabase
        .from('streetlight_backfill_progress')
        .upsert(fresh, { onConflict: 'region' })
        .select()
        .single();
      progress = upserted!;
    } else if (progress.tiles_total !== totalTiles) {
      // Tile count changed (e.g. region bbox tweaked). Update the total but
      // keep next_tile_index so we don't lose progress.
      await supabase
        .from('streetlight_backfill_progress')
        .update({ tiles_total: totalTiles })
        .eq('region', region);
      progress.tiles_total = totalTiles;
    }

    if (progress.next_tile_index >= totalTiles) {
      return new Response(
        JSON.stringify({
          region,
          processed_this_run: 0,
          segments_added_this_run: 0,
          tiles_total: totalTiles,
          tiles_processed_total: progress.tiles_processed,
          next_tile_index: progress.next_tile_index,
          done: true,
          message: `Already complete for ${region}. Pass {"reset": true} to start over.`,
        }, null, 2),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const startIdx = progress.next_tile_index;
    const endIdx = Math.min(startIdx + MAX_TILES_PER_RUN, totalTiles);
    const runStart = Date.now();

    let processed = 0;
    let segmentsAdded = 0;
    let lastError: string | null = null;

    for (let i = startIdx; i < endIdx; i++) {
      if (Date.now() - runStart > TIMEOUT_BUDGET_MS) {
        console.warn(`[Backfill] Time budget exhausted at tile ${i}/${endIdx}`);
        break;
      }
      const tile = tiles[i];

      // SATC rate limit: 1 req/sec. Sleep between calls (skip on first).
      if (processed > 0) await new Promise((r) => setTimeout(r, 1100));

      const result = await fetchTileGeometry(apiKey, tile);
      if (!result.ok) {
        lastError = `tile ${i} (${tile.south.toFixed(3)},${tile.west.toFixed(3)}): ${result.error}`;
        console.error('[Backfill]', lastError);
      } else if (result.segments.length > 0) {
        const rows = result.segments.map((seg) => ({
          id: seg.id,
          road_name: null,
          road_type: null,
          geom: `SRID=4326;LINESTRING(${seg.coords.map((c) => c.join(' ')).join(',')})`,
          bbox_south: tile.south,
          bbox_west: tile.west,
          bbox_north: tile.north,
          bbox_east: tile.east,
          cached_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }));
        const { error: upErr } = await supabase
          .from('streetlight_segment')
          .upsert(rows, { onConflict: 'id', ignoreDuplicates: true });
        if (upErr) {
          lastError = `tile ${i} upsert: ${upErr.message}`;
          console.error('[Backfill]', lastError);
        } else {
          segmentsAdded += result.segments.length;
        }
      }
      processed++;

      // Persist progress every 25 tiles so a mid-run failure doesn't lose much work.
      if (processed % 25 === 0) {
        await supabase
          .from('streetlight_backfill_progress')
          .update({
            tiles_processed: progress.tiles_processed + processed,
            next_tile_index: i + 1,
            segments_added: progress.segments_added + segmentsAdded,
            last_run_at: new Date().toISOString(),
            last_error: lastError,
          })
          .eq('region', region);
      }
    }

    const finalIdx = startIdx + processed;
    const isDone = finalIdx >= totalTiles;

    await supabase
      .from('streetlight_backfill_progress')
      .update({
        tiles_processed: progress.tiles_processed + processed,
        next_tile_index: finalIdx,
        segments_added: progress.segments_added + segmentsAdded,
        last_run_at: new Date().toISOString(),
        completed_at: isDone ? new Date().toISOString() : null,
        last_error: lastError,
      })
      .eq('region', region);

    return new Response(
      JSON.stringify({
        region,
        processed_this_run: processed,
        segments_added_this_run: segmentsAdded,
        tiles_total: totalTiles,
        tiles_processed_total: progress.tiles_processed + processed,
        segments_added_total: progress.segments_added + segmentsAdded,
        next_tile_index: finalIdx,
        done: isDone,
        last_error: lastError,
        elapsed_ms: Date.now() - runStart,
        message: isDone
          ? `Backfill complete for ${region}.`
          : `Run again to continue (${totalTiles - finalIdx} tiles remaining).`,
      }, null, 2),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[Backfill] Fatal error:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
