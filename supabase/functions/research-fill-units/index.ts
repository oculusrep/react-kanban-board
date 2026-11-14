/**
 * research-fill-units — "Fill missing units" on an existing run or sweep.
 *
 * Reruns only the post-run steps, no new research run:
 *   dedupe → Gemini unit backfill (current prompt) → acres × density →
 *   dedupe → anything still without a count stays a lead.
 *
 * POST body:
 *   { mode: 'preview', run_ids: uuid[], include_rejected: boolean }
 *       → { records, pending_no_count, rejected_no_count, est_cost_cents, avg_call_cents }
 *   { mode: 'run', research_run_id: uuid, include_rejected: boolean }
 *       → per-run summary. The UI loops over a sweep's runs one call at a time
 *         so no single call outlives the edge-function wall clock.
 *
 * Scope:
 *   - Pending records with no usable count, skipping any that already carry an
 *     'estimated' count (safe to run twice).
 *   - include_rejected: records rejected with no count whose reason is empty or
 *     mentions a missing count or duplicate review (auto-dedupe "Duplicate …"
 *     rejections excluded). They're restored to pending with the original
 *     rejection parked in fill_restored. If one still gets no count, it goes
 *     back to rejected with that exact reason.
 *   - Never touches committed municipal_project rows (the dedupe RPC only ever
 *     rejects staged rows).
 *
 * Auth: the caller's JWT. Requires can_approve_market_research.
 * Doc: docs/MARKET_RESEARCH_UNIT_ESTIMATES.md (Fill missing units)
 */

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';
import { estimateMissingUnits, lacksUnitCount } from '../_shared/research-unit-estimator.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type, apikey, x-client-info',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { 'Content-Type': 'application/json', ...CORS } });

// Rejections this tool may reopen: no reason, or a reason about a missing count
// or the duplicate review. Auto-dedupe "Duplicate …" rejections are excluded:
// a counted copy exists, so restoring them would only re-reject them.
const RESTORABLE_REASON = /no (unit )?count|without (a )?(unit )?count|missing (unit )?count|unit count|duplicate review/i;
const isRestorableReason = (reason: string | null) =>
  !reason || !reason.trim() || (!/^\s*duplicate\b/i.test(reason) && RESTORABLE_REASON.test(reason));

const FALLBACK_CALL_CENTS = 3.8;

// deno-lint-ignore no-explicit-any
type Row = any;

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

  let body: Row;
  try { body = await req.json(); } catch { return json({ error: 'bad_json' }, 400); }
  const includeRejected = body?.include_rejected === true;

  const loadRows = async (runIds: string[]) => {
    const { data, error } = await service
      .from('municipal_project_staging')
      .select('id, research_run_id, project_name, approval_state, total_housing_units, units_needs_review, units_confidence, reject_reason, rejected_at, rejected_by_id, auto_resolved_at, duplicate_of_staging_id, duplicate_of_project_id, fill_restored')
      .in('research_run_id', runIds);
    if (error) throw new Error(error.message);
    return (data ?? []) as Row[];
  };
  const pendingTarget = (r: Row) =>
    r.approval_state === 'pending' && lacksUnitCount(r) && r.units_confidence !== 'estimated';
  const rejectedTarget = (r: Row) =>
    r.approval_state === 'rejected' && lacksUnitCount(r) && isRestorableReason(r.reject_reason);

  // Runs still in flight can't be touched (the staging guard would refuse).
  const reviewableRuns = async (runIds: string[]) => {
    const { data, error } = await service.from('research_run').select('id, state').in('id', runIds);
    if (error) throw new Error(error.message);
    return (data ?? []).filter((r: Row) => !['pending', 'running'].includes(r.state)).map((r: Row) => r.id as string);
  };

  try {
    if (body?.mode === 'preview') {
      const runIds: string[] = Array.isArray(body.run_ids) ? body.run_ids : [];
      if (runIds.length === 0) return json({ error: 'run_ids required' }, 400);
      const ok = await reviewableRuns(runIds);
      const rows = ok.length ? await loadRows(ok) : [];
      const pending = rows.filter(pendingTarget).length;
      const rejected = includeRejected ? rows.filter(rejectedTarget).length : 0;
      const { data: hist } = await service.from('research_unit_estimate')
        .select('cost_cents').neq('method', 'error').order('created_at', { ascending: false }).limit(200);
      const avg = hist && hist.length
        ? hist.reduce((n: number, h: Row) => n + Number(h.cost_cents), 0) / hist.length
        : FALLBACK_CALL_CENTS;
      return json({
        records: pending + rejected,
        pending_no_count: pending,
        rejected_no_count: rejected,
        runs: ok.length,
        runs_in_flight_skipped: runIds.length - ok.length,
        avg_call_cents: Math.round(avg * 100) / 100,
        // Upper bound: the first dedupe pass may remove some before Gemini.
        est_cost_cents: Math.round((pending + rejected) * avg * 100) / 100,
      });
    }

    if (body?.mode !== 'run' || typeof body.research_run_id !== 'string') {
      return json({ error: 'mode must be preview (run_ids) or run (research_run_id)' }, 400);
    }
    const runId: string = body.research_run_id;
    if ((await reviewableRuns([runId])).length === 0) return json({ error: 'run_in_flight_or_missing' }, 409);
    const geminiKey = Deno.env.get('GEMINI_API_KEY');
    if (!geminiKey) return json({ error: 'GEMINI_API_KEY not set' }, 500);

    // 1. Restore rejected-for-no-count rows, parking the original rejection.
    let restored = 0;
    if (includeRejected) {
      for (const r of (await loadRows([runId])).filter(rejectedTarget)) {
        const { error } = await service.from('municipal_project_staging').update({
          approval_state: 'pending',
          fill_restored: {
            reject_reason: r.reject_reason, rejected_at: r.rejected_at, rejected_by_id: r.rejected_by_id,
            auto_resolved_at: r.auto_resolved_at,
            duplicate_of_staging_id: r.duplicate_of_staging_id, duplicate_of_project_id: r.duplicate_of_project_id,
          },
          reject_reason: null, rejected_at: null, rejected_by_id: null, auto_resolved_at: null,
        }).eq('id', r.id).eq('approval_state', 'rejected');
        if (error) throw new Error(`restore ${r.id}: ${error.message}`);
        restored++;
      }
    }

    const dedupe = async () => {
      const { data, error } = await service.rpc('research_auto_dedupe_by_name', { p_run_ids: [runId], p_dry_run: false });
      if (error) throw new Error(`dedupe: ${error.message}`);
      const d = data as Row;
      return (d?.rejected_no_count?.length ?? 0) + (d?.rejected_equal_count?.length ?? 0) + (d?.rejected_within_5pct?.length ?? 0);
    };

    // 2-4. dedupe → estimate (retrying earlier leads with the current prompt) → dedupe
    let deduped = 0;
    let est = null;
    let failure: string | null = null;
    try {
      deduped += await dedupe();
      est = await estimateMissingUnits(service, runId, geminiKey, { retryTried: true });
      deduped += await dedupe();
    } catch (e) {
      failure = e instanceof Error ? e.message : String(e);
    }

    // 5. Put back restored rows that still have no count — ALWAYS, even after
    //    a failure above, so nothing is left half-restored.
    let putBack = 0;
    for (const r of (await loadRows([runId])).filter((x) => x.fill_restored)) {
      const orig = r.fill_restored;
      const back = r.approval_state === 'pending' && lacksUnitCount(r);
      const { error } = await service.from('municipal_project_staging').update(back ? {
        approval_state: 'rejected',
        reject_reason: orig.reject_reason, rejected_at: orig.rejected_at, rejected_by_id: orig.rejected_by_id,
        auto_resolved_at: orig.auto_resolved_at,
        duplicate_of_staging_id: orig.duplicate_of_staging_id, duplicate_of_project_id: orig.duplicate_of_project_id,
        fill_restored: null,
      } : { fill_restored: null }).eq('id', r.id);
      if (error) throw new Error(`put back ${r.id}: ${error.message}`);
      if (back) putBack++;
    }

    const after = await loadRows([runId]);
    const leads = after.filter((r) => r.approval_state === 'pending' && lacksUnitCount(r)).length;
    return json({
      research_run_id: runId,
      restored, put_back: putBack,
      gemini: est?.gemini ?? 0,
      density: est?.density ?? 0,
      deduped,
      leads,
      considered: est?.considered ?? 0,
      errors: est?.error ?? 0,
      cost_cents: est?.cost_cents ?? 0,
      failure,
    }, failure ? 500 : 200);
  } catch (e) {
    return json({ error: 'fill_failed', detail: e instanceof Error ? e.message : String(e) }, 500);
  }
});
