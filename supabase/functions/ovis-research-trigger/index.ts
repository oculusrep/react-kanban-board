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
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
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

  // ---- Role gate ----
  const { data: userRow, error: roleErr } = await service
    .from('user')
    .select('id, ovis_role')
    .eq('id', authUserId)
    .maybeSingle();
  if (roleErr) return jsonResponse({ error: 'role_lookup_failed', detail: roleErr.message }, 500);
  if (!userRow) return jsonResponse({ error: 'user_not_found' }, 403);
  if (!['admin', 'broker'].includes(userRow.ovis_role ?? '')) {
    return jsonResponse({ error: 'forbidden', detail: 'admin or broker role required' }, 403);
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
  const { data: site, error: siteErr } = await service
    .from('site_submit')
    .select('id, client_id, sf_property_latitude, sf_property_longitude, verified_latitude, verified_longitude')
    .eq('id', body.site_submit_id)
    .maybeSingle();
  if (siteErr) return jsonResponse({ error: 'site_lookup_failed', detail: siteErr.message }, 500);
  if (!site) return jsonResponse({ error: 'site_submit_not_found' }, 404);
  if (site.client_id !== STARBUCKS_CLIENT_ID) {
    return jsonResponse({ error: 'not_a_starbucks_site' }, 403);
  }
  const lat = site.verified_latitude ?? site.sf_property_latitude;
  const lng = site.verified_longitude ?? site.sf_property_longitude;
  if (lat == null || lng == null) {
    return jsonResponse({ error: 'site_has_no_lat_lng' }, 400);
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

  // Create the run + checklist server-side. After this, OpenClaw cannot
  // expand scope — the only valid muni IDs are on the checklist row set.
  const { data: runId, error: createErr } = await service.rpc(
    'create_research_run_with_checklist',
    {
      p_site_id: body.site_submit_id,
      p_radius_miles: radius,
      p_boundary_muni_ids: orderedSelected,
      p_openclaw_run_id: null,
      p_triggered_by: authUserId,
    },
  );
  if (createErr) return jsonResponse({ error: 'create_run_failed', detail: createErr.message }, 500);
  const researchRunId = runId as string;

  // Now POST to OpenClaw. The agent receives the frozen scope as input.
  const openclawUrl = Deno.env.get('OPENCLAW_TRIGGER_URL');
  const openclawToken = Deno.env.get('OPENCLAW_TRIGGER_TOKEN');
  if (!openclawUrl || !openclawToken) {
    // Mark the run as failed so it doesn't sit forever in 'running'.
    await service.from('research_run').update({ state: 'failed' }).eq('id', researchRunId);
    return jsonResponse({
      error: 'openclaw_not_configured',
      detail: 'OPENCLAW_TRIGGER_URL and OPENCLAW_TRIGGER_TOKEN must be set as Supabase secrets',
      research_run_id: researchRunId,
    }, 503);
  }

  const selectedMunis = inRadiusList.filter((m) => requested.includes(m.boundary_municipality_id));
  const openclawPayload = {
    ovis_site_submit_id: site.id,
    research_run_id: researchRunId,
    lat: Number(lat),
    lng: Number(lng),
    radius_miles: radius,
    triggered_by_user_id: authUserId,
    municipalities: selectedMunis, // frozen — agent can only research these
  };

  let openclawResp: Response;
  try {
    openclawResp = await fetch(openclawUrl, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openclawToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(openclawPayload),
    });
  } catch (e) {
    await service.from('research_run').update({ state: 'failed' }).eq('id', researchRunId);
    return jsonResponse({ error: 'openclaw_unreachable', detail: String(e), research_run_id: researchRunId }, 502);
  }

  const openclawBodyText = await openclawResp.text();
  let openclawBody: unknown = openclawBodyText;
  try { openclawBody = JSON.parse(openclawBodyText); } catch { /* leave as text */ }

  if (!openclawResp.ok) {
    await service.from('research_run').update({ state: 'failed' }).eq('id', researchRunId);
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

  return jsonResponse({
    ok: true,
    mode: 'commit',
    research_run_id: researchRunId,
    selected_count: requested.length,
    in_radius_count: inRadiusList.length,
    openclaw_response: openclawBody,
  });
});
