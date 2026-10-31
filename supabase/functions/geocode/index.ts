/**
 * Geocode proxy — the only way OVIS's browser code reaches Google Geocoding.
 *
 * WHY THIS EXISTS (2026-10-31): the frontend called the Geocoding REST endpoint
 * with VITE_GOOGLE_GEOCODING_API_KEY, which Vite inlines into the public bundle.
 * Google refuses website-restricted keys on that endpoint, so the key could not be
 * locked to our sites either — it had to leave the browser. The server key
 * (GOOGLE_GEOCODING_API_KEY, Geocoding-API-only) lives in a function secret, and
 * every request is authorized here. Plan: docs/GEOCODE_PROXY_PLAN.md.
 *
 * Callers (user JWT, gateway verify_jwt on):
 *   internal user — public.is_internal_user()
 *   portal user   — public.portal_user_contact_id() is not null (PortalMapPage search)
 *   anyone else   — 403 (coach, users with no OVIS or portal record); no JWT → 401
 *
 * Request:  POST { address } or POST { latlng: "lat,lng" }, optional region / components.
 *           Nothing else is forwarded, so this is not an open Google proxy.
 * Response: Google's JSON body unchanged (status, results, error_message), so the
 *           browser's existing parsing stays as it was.
 * Logs: status + user id only — never the address (it can be client-confidential).
 *
 * Google API: https://developers.google.com/maps/documentation/geocoding/requests-geocoding
 *             https://developers.google.com/maps/documentation/geocoding/requests-reverse-geocoding
 */
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const GOOGLE = 'https://maps.googleapis.com/maps/api/geocode/json';

// Per-user speed bump against a stolen session hammering the key. In-memory per
// isolate, so not exact; the real ceiling is the daily quota on the server key.
const RATE_PER_MIN = 300;
const hits = new Map<string, number[]>();
function overLimit(userId: string): boolean {
  const now = Date.now();
  const recent = (hits.get(userId) ?? []).filter((t) => now - t < 60_000);
  recent.push(now);
  hits.set(userId, recent);
  return recent.length > RATE_PER_MIN;
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

const str = (v: unknown, max: number): string | null => {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s && s.length <= max ? s : null;
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
    if (!bearer) return json({ error: 'missing_jwt' }, 401);

    const url = Deno.env.get('SUPABASE_URL')!;
    const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, {
      auth: { persistSession: false },
    });
    const { data: authData, error: authErr } = await service.auth.getUser(bearer);
    if (authErr || !authData?.user) return json({ error: 'invalid_jwt' }, 401);
    const userId = authData.user.id;

    const asUser = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: `Bearer ${bearer}` } },
      auth: { persistSession: false },
    });
    const { data: internal, error: rpcErr } = await asUser.rpc('is_internal_user');
    if (rpcErr) return json({ error: 'permission_check_failed' }, 403);
    if (internal !== true) {
      const { data: contactId } = await asUser.rpc('portal_user_contact_id');
      if (!contactId) return json({ error: 'forbidden' }, 403);
    }

    if (overLimit(userId)) return json({ error: 'rate_limited' }, 429);

    const body = await req.json().catch(() => ({}));
    const address = str(body.address, 300);
    const latlng = str(body.latlng, 60);
    if (!address === !latlng) return json({ error: 'send exactly one of address or latlng' }, 400);
    if (latlng && !/^-?\d{1,2}(\.\d+)?,\s*-?\d{1,3}(\.\d+)?$/.test(latlng)) {
      return json({ error: 'latlng must be "lat,lng"' }, 400);
    }

    const key = Deno.env.get('GOOGLE_GEOCODING_API_KEY');
    if (!key) {
      console.error('[geocode] GOOGLE_GEOCODING_API_KEY not set');
      return json({ error: 'geocoding_not_configured' }, 503);
    }

    const params = new URLSearchParams({ key });
    if (address) params.set('address', address);
    if (latlng) params.set('latlng', latlng.replace(/\s+/g, ''));
    const region = str(body.region, 10);
    if (region) params.set('region', region);
    const components = str(body.components, 200);
    if (components) params.set('components', components);

    const res = await fetch(`${GOOGLE}?${params}`, { signal: AbortSignal.timeout(10_000) });
    const data = await res.json();
    if (data?.status !== 'OK' && data?.status !== 'ZERO_RESULTS') {
      console.warn('[geocode]', data?.status, 'user', userId);
    }
    return json(data, res.ok ? 200 : 502);
  } catch (err) {
    console.error('[geocode] unexpected', err instanceof Error ? err.message : err);
    return json({ error: 'Internal error' }, 500);
  }
});
