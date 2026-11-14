/**
 * "Fill missing units" on an existing run or sweep. Shared by the
 * research-fill-units edge function (button on the approval view) and
 * one-off scripts.
 *
 * Reruns only the post-run steps, with no new research run:
 *   dedupe → Gemini unit backfill (current prompt, earlier leads re-asked) →
 *   acres × density → dedupe → anything still without a count stays a lead.
 *
 * Scope:
 *   - Pending records with no usable count, skipping any that already carry an
 *     'estimated' count (safe to run twice).
 *   - includeRejected: rejected records with no count whose reason is empty or
 *     mentions a missing count or duplicate review. Auto-dedupe "Duplicate …"
 *     rejections are excluded. Each is restored to pending with the original
 *     rejection parked in fill_restored; if it still gets no count it goes
 *     back to rejected with exactly that reason.
 *   - Never touches committed municipal_project rows.
 *
 * Doc: docs/MARKET_RESEARCH_UNIT_ESTIMATES.md (Fill missing units)
 */

import { estimateMissingUnits, lacksUnitCount } from './research-unit-estimator.ts';

// deno-lint-ignore no-explicit-any
type Supa = any;
// deno-lint-ignore no-explicit-any
type Row = any;

const RESTORABLE_REASON = /no (unit )?count|without (a )?(unit )?count|missing (unit )?count|unit count|duplicate review/i;
export const isRestorableReason = (reason: string | null) =>
  !reason || !reason.trim() || (!/^\s*duplicate\b/i.test(reason) && RESTORABLE_REASON.test(reason));

const FALLBACK_CALL_CENTS = 3.8;

async function loadRows(service: Supa, runIds: string[]): Promise<Row[]> {
  const { data, error } = await service
    .from('municipal_project_staging')
    .select('id, research_run_id, project_name, approval_state, total_housing_units, units_needs_review, units_confidence, reject_reason, rejected_at, rejected_by_id, auto_resolved_at, duplicate_of_staging_id, duplicate_of_project_id, fill_restored')
    .in('research_run_id', runIds);
  if (error) throw new Error(error.message);
  return data ?? [];
}

const pendingTarget = (r: Row) =>
  r.approval_state === 'pending' && lacksUnitCount(r) && r.units_confidence !== 'estimated';
const rejectedTarget = (r: Row) =>
  r.approval_state === 'rejected' && lacksUnitCount(r) && isRestorableReason(r.reject_reason);

/** Runs still in flight can't be touched (the staging guard would refuse). */
export async function reviewableRuns(service: Supa, runIds: string[]): Promise<string[]> {
  const { data, error } = await service.from('research_run').select('id, state').in('id', runIds);
  if (error) throw new Error(error.message);
  return (data ?? []).filter((r: Row) => !['pending', 'running'].includes(r.state)).map((r: Row) => r.id as string);
}

export async function previewFill(service: Supa, runIds: string[], includeRejected: boolean) {
  const ok = await reviewableRuns(service, runIds);
  const rows = ok.length ? await loadRows(service, ok) : [];
  const pending = rows.filter(pendingTarget).length;
  const rejected = includeRejected ? rows.filter(rejectedTarget).length : 0;
  const { data: hist } = await service.from('research_unit_estimate')
    .select('cost_cents').neq('method', 'error').order('created_at', { ascending: false }).limit(200);
  const avg = hist && hist.length
    ? hist.reduce((n: number, h: Row) => n + Number(h.cost_cents), 0) / hist.length
    : FALLBACK_CALL_CENTS;
  return {
    records: pending + rejected,
    pending_no_count: pending,
    rejected_no_count: rejected,
    runs: ok.length,
    runs_in_flight_skipped: runIds.length - ok.length,
    avg_call_cents: Math.round(avg * 100) / 100,
    // Upper bound: the first dedupe pass may remove some before Gemini.
    est_cost_cents: Math.round((pending + rejected) * avg * 100) / 100,
  };
}

export interface FillRunResult {
  research_run_id: string;
  restored: number;
  put_back: number;
  gemini: number;
  density: number;
  deduped: number;
  leads: number;
  considered: number;
  errors: number;
  cost_cents: number;
  failure: string | null;
}

export async function fillRun(
  service: Supa, runId: string, includeRejected: boolean, geminiKey: string,
): Promise<FillRunResult> {
  // 1. Restore rejected-for-no-count rows, parking the original rejection.
  let restored = 0;
  if (includeRejected) {
    for (const r of (await loadRows(service, [runId])).filter(rejectedTarget)) {
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
    return (d?.rejected_no_count?.length ?? 0) + (d?.rejected_equal_count?.length ?? 0)
      + (d?.rejected_within_5pct?.length ?? 0);
  };

  // 2-4. dedupe → estimate (earlier leads re-asked with the current prompt) → dedupe
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

  // 5. Put back restored rows that still have no count. Runs even after a
  //    failure above, so nothing is left half-restored. A restored row that
  //    dedupe rejected keeps the dedupe reason.
  let putBack = 0;
  for (const r of (await loadRows(service, [runId])).filter((x) => x.fill_restored)) {
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

  const after = await loadRows(service, [runId]);
  return {
    research_run_id: runId,
    restored, put_back: putBack,
    gemini: est?.gemini ?? 0,
    density: est?.density ?? 0,
    deduped,
    leads: after.filter((r) => r.approval_state === 'pending' && lacksUnitCount(r)).length,
    considered: est?.considered ?? 0,
    errors: est?.error ?? 0,
    cost_cents: est?.cost_cents ?? 0,
    failure,
  };
}
