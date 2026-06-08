/**
 * OVIS Research Trigger — Edge Function
 *
 * Browser-facing endpoint behind the "Start Research" button on the Starbucks
 * site_submit sidebar. Proxies the trigger to OpenClaw's gateway so the
 * OpenClaw bearer token never touches the client.
 *
 * Flow:
 *   1. Browser POST { site_submit_id, radius_miles } with the user's Supabase JWT.
 *   2. Function validates: user is admin or broker, site is a Starbucks site
 *      with lat/lng, radius in range.
 *   3. Function POSTs { ovis_site_submit_id, lat, lng, radius_miles } to
 *      OPENCLAW_TRIGGER_URL with bearer OPENCLAW_TRIGGER_TOKEN.
 *   4. Returns OpenClaw's response to the browser (typically { openclaw_run_id }).
 *
 * If OPENCLAW_TRIGGER_URL is not set, returns 503 with a clear message — the
 * UI surfaces this as "OpenClaw not configured" rather than a generic failure.
 *
 * See docs/MARKET_RESEARCH_AGENT_V1_PLAN.md Phase D + spec §8 "Trigger endpoint".
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const STARBUCKS_CLIENT_ID = '39933b5b-3e8c-438d-be2f-e48cd9228c00';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface TriggerRequest {
  site_submit_id: string;
  radius_miles: number;
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: CORS });
  }

  // ---- Auth: resolve the calling user from the JWT supplied by supabase-js ----
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '');
  if (!jwt) return jsonResponse({ error: 'missing_jwt' }, 401);

  // Use anon key to verify the JWT and resolve the auth user.
  const anonClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } },
  );
  const { data: authData, error: authErr } = await anonClient.auth.getUser(jwt);
  if (authErr || !authData?.user) return jsonResponse({ error: 'invalid_jwt' }, 401);
  const authUserId = authData.user.id;

  // Service-role client for the rest of the lookups (bypasses RLS for the role/site queries).
  const service = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    { auth: { persistSession: false } },
  );

  // ---- Role gate: only admin + broker may trigger ----
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
  let body: TriggerRequest;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'bad_json' }, 400);
  }
  if (!body?.site_submit_id || typeof body.site_submit_id !== 'string') {
    return jsonResponse({ error: 'site_submit_id is required' }, 400);
  }
  const radius = Number(body.radius_miles);
  if (!Number.isInteger(radius) || radius < 1 || radius > 50) {
    return jsonResponse({ error: 'radius_miles must be an integer between 1 and 50' }, 400);
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

  // ---- OpenClaw forward ----
  const openclawUrl = Deno.env.get('OPENCLAW_TRIGGER_URL');
  const openclawToken = Deno.env.get('OPENCLAW_TRIGGER_TOKEN');
  if (!openclawUrl || !openclawToken) {
    return jsonResponse({
      error: 'openclaw_not_configured',
      detail: 'OPENCLAW_TRIGGER_URL and OPENCLAW_TRIGGER_TOKEN must be set as Supabase secrets',
    }, 503);
  }

  const openclawPayload = {
    ovis_site_submit_id: site.id,
    lat: Number(lat),
    lng: Number(lng),
    radius_miles: radius,
    triggered_by_user_id: authUserId,
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
    return jsonResponse({ error: 'openclaw_unreachable', detail: String(e) }, 502);
  }

  const openclawBodyText = await openclawResp.text();
  let openclawBody: unknown = openclawBodyText;
  try { openclawBody = JSON.parse(openclawBodyText); } catch { /* leave as text */ }

  if (!openclawResp.ok) {
    return jsonResponse({
      error: 'openclaw_rejected',
      status: openclawResp.status,
      body: openclawBody,
    }, 502);
  }

  return jsonResponse({
    ok: true,
    site_submit_id: site.id,
    radius_miles: radius,
    openclaw_response: openclawBody,
  });
});
