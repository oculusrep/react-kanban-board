/**
 * OVIS Research Trigger — Edge Function
 *
 * Two-mode endpoint behind the "Start Research" button on the Starbucks
 * site_submit sidebar. Both modes require a Supabase user JWT (admin or
 * broker role).
 *
 *   1. PREVIEW mode { mode: 'preview', site_submit_id, radius_miles }
 *      Returns the list of GA boundary_municipality rows within the radius,
 *      so the modal can render checkboxes BEFORE the user commits to a run.
 *      No write, no OpenClaw POST.
 *
 *   2. COMMIT mode  { mode: 'commit', site_submit_id, radius_miles, municipality_ids[] }
 *      - Cross-checks each supplied municipality_id against the in-radius set
 *        (defense in depth — prevents a curl bypass from sneaking in
 *        off-checklist munis).
 *      - Creates the research_run + research_checklist_item rows up front
 *        (server-side, NOT via OpenClaw) so OpenClaw is handed a frozen
 *        scope and physically cannot expand it.
 *      - POSTs to OPENCLAW_TRIGGER_URL with the run_id + selected munis.
 *      - If OpenClaw rejects: marks the just-created run state='failed'.
 *
 * See docs/MARKET_RESEARCH_AGENT_V1_PLAN.md Phase D + the 2026-06-08
 * orchestration-pivot note that moved checklist creation from OpenClaw to OVIS.
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const STARBUCKS_CLIENT_ID = '39933b5b-3e8c-438d-be2f-e48cd9228c00';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface BaseRequest {
  mode?: 'preview' | 'commit';
  site_submit_id: string;
  radius_miles: number;
}
interface CommitRequest extends BaseRequest {
  mode?: 'commit';
  municipality_ids: string[];
  // Optional explicit search-window overrides (YYYY-MM-DD, Eastern). When a
  // bound is omitted the edge function fills the Quick-tier default. A future
  // tier picker (Quick/Deep/Custom) supplies these; today they default.
  pz_window_start?: string;
  pz_window_end?: string;
  permit_window_start?: string;
  permit_window_end?: string;
}

// ---- Search-window helpers (Eastern local dates, per the OVIS timezone rule) ----
type SearchWindow = {
  pz_window_start: string; pz_window_end: string;
  permit_window_start: string; permit_window_end: string;
};

// Today in America/New_York as YYYY-MM-DD (en-CA formats ISO-style). Uses the
// local Eastern date, never toISOString() (which would drift to UTC's date).
function easternToday(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York' }).format(new Date());
}

// Subtract whole years from a YYYY-MM-DD string, clamping Feb 29 -> Feb 28 on
// non-leap target years. Pure component math, no UTC round-trip.
function subtractYearsISO(iso: string, years: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const ty = y - years;
  const lastDay = new Date(ty, m, 0).getDate(); // day 0 of month m (1-based) = last day of month m
  const dd = Math.min(d, lastDay);
  return `${ty}-${String(m).padStart(2, '0')}-${String(dd).padStart(2, '0')}`;
}

// Accept a caller-supplied bound only if it is a well-formed ISO date.
function isoDateOrNull(v: unknown): string | null {
  return typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null;
}

// The window OVIS both sends to the agent and stores on the run (identical, so
// coverage reflects exactly what was searched). Quick-tier defaults — P&Z 3yr,
// permits 2yr, ending today — unless a bound is overridden. Bounds default
// independently, so a Custom run can pin just one side.
function resolveSearchWindow(body: Partial<CommitRequest>): SearchWindow {
  const today = easternToday();
  return {
    pz_window_start:     isoDateOrNull(body.pz_window_start)     ?? subtractYearsISO(today, 3),
    pz_window_end:       isoDateOrNull(body.pz_window_end)       ?? today,
    permit_window_start: isoDateOrNull(body.permit_window_start) ?? subtractYearsISO(today, 2),
    permit_window_end:   isoDateOrNull(body.permit_window_end)   ?? today,
  };
}

/**
 * Build the multi-line message string OpenClaw receives in the `message` field
 * of the trigger POST. The leading directive tells the agent this is a real
 * job from a trusted internal system, not an ad-hoc question. The structured
 * muni block uses one line per muni with exact field=value pairs so the agent
 * can reliably parse out boundary_municipality_id values — those must round-trip
 * back through update_checklist_status + submit_research_report, and the SQL
 * layer-3 guard rejects any candidate whose id isn't on the run's checklist.
 */
function buildOpenClawMessage(opts: {
  researchRunId: string;
  siteSubmitId: string;
  lat: number;
  lng: number;
  radiusMiles: number;
  triggeredByUserId: string;
  window: SearchWindow;
  municipalities: Array<{
    boundary_municipality_id: string;
    kind: string;
    name: string;
    geoid: string;
    distance_mi: number;
  }>;
}): string {
  const muniLines = opts.municipalities
    .map((m) =>
      `- boundary_municipality_id=${m.boundary_municipality_id}  kind=${m.kind}  name="${m.name}"  distance_mi=${Number(m.distance_mi).toFixed(2)}`,
    )
    .join('\n');

  return [
    'You are being triggered by OVIS (a trusted internal system) to run a market-research task. Follow your SOUL.md research protocol.',
    '',
    `research_run_id: ${opts.researchRunId}`,
    `ovis_site_submit_id: ${opts.siteSubmitId}`,
    `site_lat: ${opts.lat}`,
    `site_lng: ${opts.lng}`,
    `radius_miles: ${opts.radiusMiles}`,
    `triggered_by_user_id: ${opts.triggeredByUserId}`,
    // Locked windowing contract — agent reads these four unconditionally and
    // searches each record type only within its stated bounds (no extra cap).
    // News/context scopes to pz_window (outer envelope). YYYY-MM-DD, Eastern,
    // inclusive, *_start older / *_end newer.
    `pz_window_start: ${opts.window.pz_window_start}`,
    `pz_window_end: ${opts.window.pz_window_end}`,
    `permit_window_start: ${opts.window.permit_window_start}`,
    `permit_window_end: ${opts.window.permit_window_end}`,
    '',
    'Research the following municipalities (do NOT research others — any candidate referencing an off-list boundary_municipality_id will be rejected at submit time):',
    '',
    muniLines,
    '',
    'When finished, call submit_research_report ONCE with all candidates. Use update_checklist_status to report per-muni progress.',
  ].join('\n');
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

// Telegram operator notifications — chat ID hardcoded (Mike's @orep_openclaw_bot).
// Failures here are swallowed so a notification glitch can never block the
// trigger response.
const TELEGRAM_CHAT_ID = '8371575998';
async function notifyTelegram(text: string): Promise<void> {
  const token = Deno.env.get('TELEGRAM_BOT_TOKEN');
  if (!token) {
    console.warn('TELEGRAM_BOT_TOKEN not set — skipping notification:', text);
    return;
  }
  try {
    const resp = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, disable_web_page_preview: true }),
    });
    if (!resp.ok) {
      console.warn('Telegram notification non-2xx:', resp.status, await resp.text());
    }
  } catch (e) {
    console.warn('Telegram notification threw:', e);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return new Response('Method Not Allowed', { status: 405, headers: CORS });

  // ---- Auth: resolve the calling user from the JWT ----
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return jsonResponse({ error: 'missing_jwt' }, 401);

  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } },
  );
  const { data: authData, error: authErr } = await anonClient.auth.getUser(jwt);
  if (authErr || !authData?.user) return jsonResponse({ error: 'invalid_jwt' }, 401);
  const authUserId = authData.user.id;

  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // ---- User lookup + permission gate ----
  // auth.uid() maps to user.auth_user_id (NOT user.id — that's the auth identity,
  // user.id is the OVIS row id). Looking up by id only worked for the admin
  // because their two columns happen to match.
  const { data: userRow, error: userErr } = await service
    .from('user')
    .select('id')
    .eq('auth_user_id', authUserId)
    .maybeSingle();
  if (userErr) return jsonResponse({ error: 'user_lookup_failed', detail: userErr.message }, 500);
  if (!userRow) return jsonResponse({ error: 'user_not_found' }, 403);
  const userId = userRow.id as string;

  // Permission gate via the SQL helper (admin bypass + user-override → role-default).
  // Call via the anonClient so auth.uid() resolves correctly through the user's JWT.
  const { data: hasAccess, error: permErr } = await anonClient.rpc(
    'user_has_market_research_run_access',
  );
  if (permErr) return jsonResponse({ error: 'permission_check_failed', detail: permErr.message }, 500);
  if (!hasAccess) {
    return jsonResponse({ error: 'forbidden', detail: 'can_run_market_research permission required' }, 403);
  }

  // ---- Parse + validate body ----
  let body: BaseRequest;
  try { body = await req.json(); } catch { return jsonResponse({ error: 'bad_json' }, 400); }
  const mode = body.mode ?? 'commit';
  if (!body?.site_submit_id || typeof body.site_submit_id !== 'string') {
    return jsonResponse({ error: 'site_submit_id is required' }, 400);
  }
  const radius = Number(body.radius_miles);
  if (!Number.isInteger(radius) || radius < 1 || radius > 50) {
    return jsonResponse({ error: 'radius_miles must be an integer 1..50' }, 400);
  }

  // ---- Site_submit lookup: Starbucks client + has lat/lng ----
  // Coordinate resolution falls back through:
  //   site_submit.verified_latitude
  //     → site_submit.sf_property_latitude
  //       → property.verified_latitude
  //         → property.latitude
  // (Some site_submits have NULL on their own snapshot columns and only carry
  // lat/lng on the linked property — e.g. Villa Rica Hwy 2.)
  const { data: site, error: siteErr } = await service
    .from('site_submit')
    .select(`
      id, client_id, property_id, site_submit_name,
      sf_property_latitude, sf_property_longitude,
      verified_latitude, verified_longitude,
      property:property_id ( property_name, latitude, longitude, verified_latitude, verified_longitude )
    `)
    .eq('id', body.site_submit_id)
    .maybeSingle();
  if (siteErr) return jsonResponse({ error: 'site_lookup_failed', detail: siteErr.message }, 500);
  if (!site) return jsonResponse({ error: 'site_submit_not_found' }, 404);
  if (site.client_id !== STARBUCKS_CLIENT_ID) {
    return jsonResponse({ error: 'not_a_starbucks_site' }, 403);
  }
  // Coordinate priority: verified beats unverified, regardless of table.
  // See memory feedback_coordinate_resolution.md for the project-wide rule.
  const prop = (site as { property?: { latitude?: number | null; longitude?: number | null; verified_latitude?: number | null; verified_longitude?: number | null } | null }).property ?? null;
  const lat = site.verified_latitude
    ?? prop?.verified_latitude
    ?? site.sf_property_latitude
    ?? prop?.latitude;
  const lng = site.verified_longitude
    ?? prop?.verified_longitude
    ?? site.sf_property_longitude
    ?? prop?.longitude;
  if (lat == null || lng == null) {
    return jsonResponse({ error: 'site_has_no_lat_lng', detail: 'No lat/lng found on site_submit or its linked property' }, 400);
  }

  // ---- Resolve in-radius munis (used by both modes) ----
  const { data: inRadius, error: radiusErr } = await service.rpc(
    'get_municipalities_in_radius_for_site',
    { p_site_id: body.site_submit_id, p_radius_miles: radius },
  );
  if (radiusErr) return jsonResponse({ error: 'radius_query_failed', detail: radiusErr.message }, 500);
  const inRadiusList = (inRadius ?? []) as Array<{
    boundary_municipality_id: string;
    kind: string;
    name: string;
    geoid: string;
    distance_mi: number;
  }>;

  // ===========================================================================
  //  PREVIEW MODE
  // ===========================================================================
  if (mode === 'preview') {
    return jsonResponse({
      ok: true,
      mode: 'preview',
      site_submit_id: site.id,
      radius_miles: radius,
      count: inRadiusList.length,
      municipalities: inRadiusList,
    });
  }

  // ===========================================================================
  //  COMMIT MODE
  // ===========================================================================
  const commitBody = body as CommitRequest;
  const requested = commitBody.municipality_ids;
  if (!Array.isArray(requested) || requested.length === 0) {
    return jsonResponse({ error: 'municipality_ids must be a non-empty array in commit mode' }, 400);
  }

  // Defense-in-depth: every requested ID must be in radius.
  const inRadiusSet = new Set(inRadiusList.map((m) => m.boundary_municipality_id));
  const offChecklist = requested.filter((id) => !inRadiusSet.has(id));
  if (offChecklist.length > 0) {
    return jsonResponse({
      error: 'off_radius_municipality_ids',
      detail: `${offChecklist.length} requested muni id(s) are not within the radius`,
      offending_ids: offChecklist,
    }, 400);
  }

  // Preserve the in-radius distance ordering for priority assignment.
  const orderedSelected = inRadiusList
    .filter((m) => requested.includes(m.boundary_municipality_id))
    .map((m) => m.boundary_municipality_id);

  // Resolve the search window OVIS will store on the run AND emit to the agent
  // (identical, so coverage reflects exactly what was searched). Defaults to the
  // Quick tier unless the caller overrode bounds.
  const win = resolveSearchWindow(commitBody);

  // Create the run + checklist server-side. After this, OpenClaw cannot
  // expand scope — the only valid muni IDs are on the checklist row set.
  const { data: runId, error: createErr } = await service.rpc(
    'create_research_run_with_checklist',
    {
      p_site_id: body.site_submit_id,
      p_radius_miles: radius,
      p_boundary_muni_ids: orderedSelected,
      p_openclaw_run_id: null,
      p_triggered_by: userId,
      p_pz_window_start: win.pz_window_start,
      p_pz_window_end: win.pz_window_end,
      p_permit_window_start: win.permit_window_start,
      p_permit_window_end: win.permit_window_end,
    },
  );
  if (createErr) return jsonResponse({ error: 'create_run_failed', detail: createErr.message }, 500);
  const researchRunId = runId as string;

  // Build a human-readable site label used in Telegram notifications below.
  const siteLabel = (site as { site_submit_name?: string | null; property?: { property_name?: string | null } | null })
    .site_submit_name
    ?? (site as { property?: { property_name?: string | null } | null }).property?.property_name
    ?? body.site_submit_id;

  // Now POST to OpenClaw. The agent receives the frozen scope as input.
  const openclawUrl = Deno.env.get('OPENCLAW_TRIGGER_URL');
  const openclawToken = Deno.env.get('OPENCLAW_TRIGGER_TOKEN');
  if (!openclawUrl || !openclawToken) {
    // Mark the run as failed so it doesn't sit forever in 'running'.
    await service.from('research_run').update({ state: 'failed' }).eq('id', researchRunId);
    await notifyTelegram(`⚠️ Research trigger FAILED for ${siteLabel}: OpenClaw secrets not configured`);
    return jsonResponse({
      error: 'openclaw_not_configured',
      detail: 'OPENCLAW_TRIGGER_URL and OPENCLAW_TRIGGER_TOKEN must be set as Supabase secrets',
      research_run_id: researchRunId,
    }, 503);
  }

  const selectedMunis = inRadiusList.filter((m) => requested.includes(m.boundary_municipality_id));

  // Build the message the agent receives. Single `{ message: string }` field
  // matches OpenClaw's input contract; the multi-line message embeds the
  // run_id + coords + the FROZEN muni block so the agent can extract what
  // it needs. The leading directive is what tells the agent this is a real
  // job from a trusted internal system, not an ad-hoc question.
  const message = buildOpenClawMessage({
    researchRunId,
    siteSubmitId: site.id,
    lat: Number(lat),
    lng: Number(lng),
    radiusMiles: radius,
    triggeredByUserId: userId,
    window: win,
    municipalities: selectedMunis,
  });

  let openclawResp: Response;
  try {
    openclawResp = await fetch(openclawUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openclawToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ message }),
    });
  } catch (e) {
    await service.from('research_run').update({ state: 'failed' }).eq('id', researchRunId);
    await notifyTelegram(`⚠️ Research trigger FAILED for ${siteLabel}: OpenClaw unreachable (${String(e).slice(0, 200)})`);
    return jsonResponse({ error: 'openclaw_unreachable', detail: String(e), research_run_id: researchRunId }, 502);
  }

  const openclawBodyText = await openclawResp.text();
  let openclawBody: unknown = openclawBodyText;
  try { openclawBody = JSON.parse(openclawBodyText); } catch { /* leave as text */ }

  if (!openclawResp.ok) {
    await service.from('research_run').update({ state: 'failed' }).eq('id', researchRunId);
    await notifyTelegram(`⚠️ Research trigger FAILED for ${siteLabel}: OpenClaw returned HTTP ${openclawResp.status}`);
    return jsonResponse({
      error: 'openclaw_rejected',
      status: openclawResp.status,
      body: openclawBody,
      research_run_id: researchRunId,
    }, 502);
  }

  // Stash the OpenClaw correlation id if present.
  if (openclawBody && typeof openclawBody === 'object' && 'openclaw_run_id' in openclawBody) {
    const oid = (openclawBody as { openclaw_run_id?: unknown }).openclaw_run_id;
    if (typeof oid === 'string') {
      await service.from('research_run').update({ openclaw_run_id: oid }).eq('id', researchRunId);
    }
  }

  await notifyTelegram(`✅ Research started: ${siteLabel} — ${requested.length} ${requested.length === 1 ? 'municipality' : 'municipalities'}`);

  return jsonResponse({
    ok: true,
    mode: 'commit',
    research_run_id: researchRunId,
    selected_count: requested.length,
    in_radius_count: inRadiusList.length,
    openclaw_response: openclawBody,
  });
});
