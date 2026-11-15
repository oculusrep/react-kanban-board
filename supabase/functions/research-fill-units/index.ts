/**
 * research-fill-units — "Fill missing units" button on the run / sweep
 * approval view. Logic lives in _shared/research-fill.ts.
 *
 * POST body:
 *   { mode: 'preview', run_ids: uuid[], include_rejected: boolean }
 *       → { records, pending_no_count, rejected_no_count, est_cost_cents, avg_call_cents, ... }
 *   { mode: 'run', research_run_id: uuid, include_rejected: boolean }
 *       → per-run result. The UI loops over a sweep's runs one call at a time
 *         so no single call outlives the edge-function wall clock.
 *
 * Auth: the caller's JWT; requires can_approve_market_research.
 * Doc: docs/MARKET_RESEARCH_UNIT_ESTIMATES.md (Fill missing units)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { fillRun, previewFill, reviewableRuns } from '../_shared/research-fill.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: CORS });
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

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
  const includeRejected = body?.include_rejected === true;

  try {
    if (body?.mode === 'preview') {
      const runIds: string[] = Array.isArray(body.run_ids) ? body.run_ids : [];
      if (runIds.length === 0) return json({ error: 'run_ids required' }, 400);
      return json(await previewFill(service, runIds, includeRejected));
    }
    if (body?.mode !== 'run' || typeof body.research_run_id !== 'string') {
      return json({ error: 'mode must be preview (run_ids) or run (research_run_id)' }, 400);
    }
    if ((await reviewableRuns(service, [body.research_run_id])).length === 0) {
      return json({ error: 'run_in_flight_or_missing' }, 409);
    }
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) return json({ error: 'GEMINI_API_KEY not set' }, 500);
    const result = await fillRun(service, body.research_run_id, includeRejected, geminiKey,
      Deno.env.get('GOOGLE_GEOCODING_API_KEY') ?? null);
    return json(result, result.failure ? 500 : 200);
  } catch (e) {
    return json({ error: 'fill_failed', detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
