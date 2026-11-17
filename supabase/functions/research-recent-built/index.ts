/**
 * research-recent-built — the "Recently built" pass (OVIS + Gemini, not the
 * agent). Logic lives in _shared/research-recent.ts.
 *
 * POST body:
 *   { mode: 'preview', site_id: uuid, radius_miles: int }
 *       → { municipalities[], search_calls, est_search_cents, est_locate_cents, est_total_cents, basis }
 *   { mode: 'run', site_id: uuid, radius_miles: int, sweep_id?: uuid }
 *       → { research_run_id } immediately; the search + post-run steps
 *         (already-in-OVIS, dedupe, locate, parcel fetch, distance check) run in
 *         the background. Locate stops starting new calls near the wall clock;
 *         Fill missing units & locations picks up the rest.
 *   { mode: 'parcel_preview' | 'parcel_run', site_id, radius_miles }
 *       → the parcel subdivisions pass (county parcel layer grouped by
 *         subdivision, Gemini year built per subdivision). parcel_run returns
 *         { research_run_id } and runs in the background.
 *         Doc: docs/MARKET_RESEARCH_PARCEL_SUBDIVISIONS.md
 *
 * Auth: the caller's JWT; requires can_approve_market_research.
 * Doc: docs/MARKET_RESEARCH_RECENTLY_BUILT.md
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { createRecentRun, previewRecent, processRecentRun } from '../_shared/research-recent.ts';
import { createParcelRun, previewParcelSubdivisions, processParcelRun } from '../_shared/research-parcel-subdivisions.ts';

declare const EdgeRuntime: { waitUntil(p: Promise<unknown>): void } | undefined;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

// Background budget: stop starting locate calls after this, leaving room for
// the parcel fetch and distance check inside the wall clock.
const LOCATE_BUDGET_MS = 240_000;
// Parcel pass: stop starting new subdivisions after this (an unfinished one is
// reported "out of time"; a re-run skips everything already handled).
const PARCEL_BUDGET_MS = 330_000;

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);
  const started = Date.now();

  const url = Deno.env.get('SUPABASE_URL')!;
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (!bearer) return json({ error: 'missing_jwt' }, 401);
  const userClient = createClient(url, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: `Bearer ${bearer}` } }, auth: { persistSession: false },
  });
  const { data: auth, error: authErr } = await userClient.auth.getUser(bearer);
  if (authErr || !auth?.user) return json({ error: 'invalid_jwt' }, 401);
  const { data: canApprove, error: permErr } = await userClient.rpc('user_has_market_research_approve_access');
  if (permErr) return json({ error: 'permission_check_failed', detail: permErr.message }, 500);
  if (!canApprove) return json({ error: 'forbidden', detail: 'can_approve_market_research required' }, 403);

  const service = createClient(url, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!, { auth: { persistSession: false } });

  // deno-lint-ignore no-explicit-any
  let body: any;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const siteId = body?.site_id;
  const radius = Number(body?.radius_miles);
  if (typeof siteId !== 'string' || !Number.isInteger(radius) || radius < 1 || radius > 50) {
    return json({ error: 'site_id and radius_miles (1..50) required' }, 400);
  }

  try {
    if (body.mode === 'preview') return json(await previewRecent(service, siteId, radius));
    if (body.mode === 'parcel_preview') return json(await previewParcelSubdivisions(service, siteId, radius));
    if (body.mode === 'parcel_run') {
      const gemini = Deno.env.get('GEMINI_API_KEY');
      if (!gemini) return json({ error: 'GEMINI_API_KEY not set' }, 500);
      const { runId } = await createParcelRun(service, { siteId, radiusMiles: radius, triggeredBy: auth.user.id });
      const job = processParcelRun(service, runId, { gemini }, { deadlineMs: started + PARCEL_BUDGET_MS })
        .then((s) => console.log('[parcel-subdivisions]', JSON.stringify({ ...s, results: s.results.length })))
        .catch(async (e) => {
          console.error('[parcel-subdivisions] failed', runId, e);
          await service.from('research_run').update({ state: 'awaiting_review', post_run_done_at: new Date().toISOString() }).eq('id', runId);
        });
      if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(job); else await job;
      return json({ research_run_id: runId });
    }
    if (body.mode !== 'run') return json({ error: 'mode must be preview, run, parcel_preview or parcel_run' }, 400);

    const gemini = Deno.env.get('GEMINI_API_KEY');
    if (!gemini) return json({ error: 'GEMINI_API_KEY not set' }, 500);
    const { runId, munis } = await createRecentRun(service, {
      siteId, radiusMiles: radius, sweepId: typeof body.sweep_id === 'string' ? body.sweep_id : null,
      triggeredBy: auth.user.id,
    });
    const job = processRecentRun(service, runId, munis,
      { gemini, geocode: Deno.env.get('GOOGLE_GEOCODING_API_KEY') ?? null },
      { deadlineMs: started + LOCATE_BUDGET_MS })
      .then((s) => console.log('[recent-built]', JSON.stringify(s)))
      .catch(async (e) => {
        console.error('[recent-built] failed', runId, e);
        await service.from('research_run').update({ post_run_done_at: new Date().toISOString() }).eq('id', runId);
      });
    if (typeof EdgeRuntime !== 'undefined') EdgeRuntime.waitUntil(job); else await job;
    return json({ research_run_id: runId, municipalities: munis.length });
  } catch (e) {
    return json({ error: 'recent_built_failed', detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
