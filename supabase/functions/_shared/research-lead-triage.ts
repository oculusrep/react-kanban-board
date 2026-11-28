/**
 * Lead triage: the last post-run step. Rejects pending leads (no usable unit
 * count) that the count steps have already tried and that can't become
 * records anyway:
 *
 *   - outside the run's radius (a distance lead_reason);
 *   - from the recently built pass (gemini_recent): the parcel layer, the
 *     document reader and the web search all came up empty;
 *   - every cited source is a listing / aggregator site.
 *
 * Rejected, never deleted: reject_reason starts "Auto-triage:", and
 * auto_resolved_at is set, like auto-dedupe. Undo on the approval screen sets
 * auto_dedupe_skip, and a row with that flag is never triaged again. "Fill
 * missing units" with "include rejected" restores these (the reason mentions
 * a missing count) and re-rejects any that still have none.
 *
 * Leads that came from P&Z agendas, permit portals, news or activity PDFs and
 * are inside the radius stay leads: their documents exist but couldn't be read.
 *
 * Doc: docs/MARKET_RESEARCH_LEAD_PASS_2026-11-26.md (Automation)
 */

import { lacksUnitCount } from './research-unit-estimator.ts';
import { isListingHost } from './source-rules.ts';
import { extractUrls } from './research-unit-documents.ts';

// deno-lint-ignore no-explicit-any
type Supa = any;

export interface TriageRow {
  id: string;
  approval_state: string;
  total_housing_units: number | null;
  units_needs_review: boolean;
  lead_reason: string | null;
  discovery_source: string | null;
  source: string | null;
  permit_url: string | null;
  auto_dedupe_skip: boolean | null;
  fill_restored: unknown;
}

/** Domains named in a source line: URLs and bare "drbhomes.com"-style mentions. */
export function sourceHosts(...texts: (string | null)[]): string[] {
  const out = new Set<string>();
  for (const u of extractUrls(...texts)) {
    try { out.add(new URL(u).hostname.toLowerCase().replace(/^www\./, '')); } catch { /* skip */ }
  }
  for (const t of texts) {
    for (const m of (t ?? '').matchAll(/\b((?:[a-z0-9-]+\.)+(?:com|net|org|gov|us|info|news|biz))\b/gi)) out.add(m[1].toLowerCase().replace(/^www\./, ''));
  }
  return [...out];
}

/** Why this lead should be rejected, or null to keep it. tried = a count step already ran on it. */
export function triageReason(r: TriageRow, tried: boolean): string | null {
  if (r.approval_state !== 'pending' || !lacksUnitCount(r) || !tried) return null;
  if (r.auto_dedupe_skip || r.fill_restored) return null;
  if (r.lead_reason && /^outside the/i.test(r.lead_reason.trim())) {
    return `Auto-triage: lead with no unit count, outside the radius (${r.lead_reason.trim()})`;
  }
  if (r.discovery_source === 'gemini_recent') {
    return 'Auto-triage: recently built lead with no unit count from the parcel layer, documents or web search';
  }
  const hosts = sourceHosts(r.source, r.permit_url);
  if (hosts.length && hosts.every((h) => isListingHost(h))) {
    return `Auto-triage: lead with no unit count, only listing-site sources (${hosts.join(', ')})`;
  }
  return null;
}

export async function triageLeads(supabase: Supa, runIds: string[]): Promise<{ rejected: { id: string; reason: string }[] }> {
  if (!runIds.length) return { rejected: [] };
  const { data: rows, error } = await supabase
    .from('municipal_project_staging')
    .select('id, approval_state, total_housing_units, units_needs_review, lead_reason, discovery_source, source, permit_url, auto_dedupe_skip, fill_restored')
    .in('research_run_id', runIds)
    .eq('approval_state', 'pending');
  if (error) throw new Error(`triage load: ${error.message}`);
  const leads = (rows as TriageRow[]).filter((r) => lacksUnitCount(r));
  if (!leads.length) return { rejected: [] };

  const { data: tries, error: tErr } = await supabase
    .from('research_unit_estimate').select('staging_id')
    .in('staging_id', leads.map((r) => r.id)).neq('method', 'error');
  if (tErr) throw new Error(`triage tries: ${tErr.message}`);
  const tried = new Set((tries ?? []).map((t: { staging_id: string }) => t.staging_id));

  const rejected: { id: string; reason: string }[] = [];
  const now = new Date().toISOString();
  for (const r of leads) {
    const reason = triageReason(r, tried.has(r.id));
    if (!reason) continue;
    const { error: uErr } = await supabase.from('municipal_project_staging').update({
      approval_state: 'rejected', reject_reason: reason, rejected_at: now, auto_resolved_at: now,
    }).eq('id', r.id).eq('approval_state', 'pending');
    if (uErr) throw new Error(`triage ${r.id}: ${uErr.message}`);
    rejected.push({ id: r.id, reason });
  }
  return { rejected };
}
