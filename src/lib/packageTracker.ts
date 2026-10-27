// Package Tracker — types, config, reads/writes and pace.
// Spec: docs/PACKAGE_TRACKER_SPEC.md. Decisions: STARBUCKS_DEAL_BOARD_DECISIONS.md §2.29.
//
// The database owns the rules: Starbucks-family eligibility (trigger), input
// resolution and gate states (v_deal_package_slide / v_deal_package_progress),
// and Start Package (start_deal_package RPC — package + slides + owner tasks in
// one transaction). This module only reads those and writes person-set state.
// Package writes never touch deal_activity_state, so they never move card heat.

import type { CSSProperties } from 'react';
import { supabase } from './supabaseClient';

// Tunable, beside the board's heat thresholds in spirit (§2.9).
export const PACKAGE_STALE_DAYS = 3; // "Sent to Noree" with nothing started → terracotta outline
export const PACKAGE_LATE_DAYS = 7;  // behind a gate this long → late

export const BRAND = {
  navy: '#002147',
  steel: '#4A6B94',
  slate: '#8FA9C8',
  terracotta: '#A27B5C',
  page: '#F8FAFC',
} as const;

export type SlideStatus = 'not_started' | 'in_progress' | 'waiting_on_mike' | 'done' | 'na';
export type Handoff = 'none' | 'approve' | 'finish';
export type InputKey = 'market_research' | 'site_story' | 'site_plan' | 'dot_study' | 'final_loi';
export type GateState = 'reached' | 'not_reached' | 'unknown';
export type Pace = 'on_pace' | 'behind' | 'late' | 'unknown';

export const INPUT_LABEL: Record<InputKey, string> = {
  market_research: 'Market Research',
  site_story: 'Site Story',
  site_plan: 'Site plan',
  dot_study: 'DOT study',
  final_loi: 'Final LOI',
};

export const STATUS_LABEL: Record<SlideStatus, string> = {
  not_started: 'Not started',
  in_progress: 'In progress',
  waiting_on_mike: 'Waiting on Mike',
  done: 'Done',
  na: 'N/A',
};

export interface PackageRow {
  id: string;
  deal_id: string;
  started_at: string;
  started_by: string | null;
  site_plan_received_at: string | null;
  dot_study_received_at: string | null;
  final_loi_at: string | null;
}

export interface SlideRow {
  id: string;
  package_id: string;
  template_key: string;
  label: string;
  position: number;
  owner_user_id: string;
  handoff: Handoff;
  inputs: InputKey[];
  allows_na: boolean;
  status: SlideStatus;
  owner_done_at: string | null;
  done_at: string | null;
  missing_inputs: InputKey[];
  inputs_ready: boolean;
  effective_status: SlideStatus;
  waiting_reason: 'input' | 'review' | null;
  done_by: string | null; // 20261026120345: who marked it done
}

export interface ProgressRow {
  package_id: string;
  deal_id: string;
  started_at: string;
  deal_stage: string | null;
  applicable: number;
  done: number;
  waiting_on_mike: number;
  waiting_on_input: number;
  any_started: boolean;
  gate1_at: string | null; gate1_state: GateState; gate1_missing: number;
  gate2_at: string | null; gate2_state: GateState; gate2_missing: number;
  gate3_at: string | null; gate3_state: GateState; gate3_missing: number;
  gates_unknown: boolean;
  gates_confirmed_at: string | null;
  behind_since: string | null;
  // 20261022110117: board stage (deal's, else the site's), Tour-ready, missing inputs
  site_submit_id: string | null;
  stage: string | null;
  tour_ready_done: number;
  tour_ready: boolean;
  missing_inputs: InputKey[];
}

export interface GateDateRow {
  deal_id: string;
  first_draft_sent_on: string | null;
  first_response_on: string | null;
  confirmed_at: string;
}

export interface DealPackageInfo {
  eligible: boolean;          // Starbucks family (client or a parent_id ancestor flagged)
  dealStage: string | null;
  dealName: string | null;
  pkg: PackageRow | null;
  slides: SlideRow[];
  progress: ProgressRow | null;
  gateDates: GateDateRow | null;
  owners: Record<string, string>; // user.id → first name
}

export interface TemplateRow {
  key: string;
  label: string;
  position: number;
  owner_user_id: string;
  handoff: Handoff;
  inputs: InputKey[];
  allows_na: boolean;
  after_key: string | null;
  done_by_gate: number;
  started_by_gate: number | null;
  note: string | null;
  active: boolean;
}

// Local date "YYYY-MM-DD" (Eastern, per CLAUDE.md — never toISOString for dates).
export function localDate(d = new Date()): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function shortDate(iso: string | null): string {
  if (!iso) return '';
  // DATE strings ("2026-09-14") parse as UTC midnight — format them without a timezone shift.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(iso) ? new Date(`${iso}T12:00:00`) : new Date(iso);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'America/New_York' });
}

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export function paceOf(p: ProgressRow | null): Pace {
  if (!p) return 'on_pace';
  if (p.behind_since) return daysSince(p.behind_since) >= PACKAGE_LATE_DAYS ? 'late' : 'behind';
  if (p.gates_unknown) return 'unknown';
  return 'on_pace';
}

export function isStale(p: ProgressRow | null): boolean {
  return !!p && !p.any_started && daysSince(p.started_at) >= PACKAGE_STALE_DAYS;
}

// Bar colours (locked 2026-10-12): slate on pace, terracotta outline behind,
// solid terracotta late, dashed dim when gate dates are unknown. No green.
export function paceStyle(pace: Pace): { fill: string; track: CSSProperties } {
  switch (pace) {
    case 'late':    return { fill: BRAND.terracotta, track: { border: `1px solid ${BRAND.terracotta}` } };
    case 'behind':  return { fill: BRAND.slate,      track: { border: `1px solid ${BRAND.terracotta}` } };
    case 'unknown': return { fill: BRAND.slate,      track: { border: `1px dashed ${BRAND.slate}`, opacity: 0.7 } };
    default:        return { fill: BRAND.steel,      track: { border: `1px solid ${BRAND.slate}` } };
  }
}

export const PACE_LABEL: Record<Pace, string> = {
  on_pace: 'On pace',
  behind: 'Behind',
  late: 'Late',
  unknown: 'Gate date unknown',
};

// ─── Change notifications (badge + panel stay in sync without prop drilling) ──

const EVENT = 'ovis:package-updated';
export function notifyPackageChanged(dealId: string) {
  window.dispatchEvent(new CustomEvent(EVENT, { detail: { dealId } }));
}
export function onPackageChanged(dealId: string, fn: () => void): () => void {
  const h = (e: Event) => { if ((e as CustomEvent).detail?.dealId === dealId) fn(); };
  window.addEventListener(EVENT, h);
  return () => window.removeEventListener(EVENT, h);
}

// ─── Reads ──────────────────────────────────────────────────────────────────

export async function fetchDealPackage(dealId: string): Promise<DealPackageInfo> {
  const { data: deal, error: dErr } = await supabase
    .from('deal')
    .select('id, deal_name, stage:stage_id ( label ), client:client_id ( id, in_starbucks_family )')
    .eq('id', dealId)
    .maybeSingle();
  if (dErr) throw dErr;
  const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);
  const client = one((deal as any)?.client) as { in_starbucks_family: boolean | null } | null;
  const eligible = !!client?.in_starbucks_family;
  const base: DealPackageInfo = {
    eligible,
    dealStage: (one((deal as any)?.stage) as { label: string | null } | null)?.label ?? null,
    dealName: (deal as any)?.deal_name ?? null,
    pkg: null, slides: [], progress: null, gateDates: null, owners: {},
  };
  if (!eligible) return base;

  const [pkgRes, gateRes] = await Promise.all([
    supabase.from('deal_package')
      .select('id, deal_id, started_at, started_by, site_plan_received_at, dot_study_received_at, final_loi_at')
      .eq('deal_id', dealId).maybeSingle(),
    supabase.from('deal_gate_date')
      .select('deal_id, first_draft_sent_on, first_response_on, confirmed_at')
      .eq('deal_id', dealId).maybeSingle(),
  ]);
  if (pkgRes.error) throw pkgRes.error;
  if (gateRes.error) throw gateRes.error;
  base.gateDates = (gateRes.data as GateDateRow) ?? null;
  const pkg = (pkgRes.data as PackageRow) ?? null;
  if (!pkg) return base;
  base.pkg = pkg;

  const [slideRes, progRes] = await Promise.all([
    supabase.from('v_deal_package_slide').select('*').eq('package_id', pkg.id).order('position'),
    supabase.from('v_deal_package_progress').select('*').eq('package_id', pkg.id).maybeSingle(),
  ]);
  if (slideRes.error) throw slideRes.error;
  if (progRes.error) throw progRes.error;
  base.slides = (slideRes.data as SlideRow[]) ?? [];
  base.progress = (progRes.data as ProgressRow) ?? null;

  const ownerIds = [...new Set(base.slides.flatMap((s) => [s.owner_user_id, s.done_by]).filter((x): x is string => !!x))];
  if (ownerIds.length) {
    const { data: users } = await supabase.from('user').select('id, first_name, name').in('id', ownerIds);
    for (const u of (users as { id: string; first_name: string | null; name: string | null }[]) ?? []) {
      base.owners[u.id] = u.first_name || u.name || 'Owner';
    }
  }
  return base;
}

// ─── Writes ─────────────────────────────────────────────────────────────────

export async function startPackage(dealId: string): Promise<string> {
  const { data, error } = await supabase.rpc('start_package', { p_site_submit_id: null, p_deal_id: dealId });
  if (error) throw error;
  notifyPackageChanged(dealId);
  return data as string;
}

// Start on a board card: site_submit and/or deal (20261022110117). The RPC fills
// in the other key; tasks only for slides whose inputs are already in.
export async function startPackageForCard(siteSubmitId: string | null, dealId: string | null): Promise<string> {
  const { data, error } = await supabase.rpc('start_package', { p_site_submit_id: siteSubmitId, p_deal_id: dealId });
  if (error) throw error;
  if (dealId) notifyPackageChanged(dealId);
  return data as string;
}

// Every package's progress row (one per package; the view is Starbucks-family only).
export async function fetchAllPackageProgress(): Promise<ProgressRow[]> {
  const { data, error } = await supabase.from('v_deal_package_progress').select('*');
  if (error) throw error;
  return (data as ProgressRow[]) ?? [];
}

// Which sites already have the two research inputs (for cards with no package yet).
export async function fetchResearchInputs(siteIds: string[]): Promise<{ marketResearch: Set<string>; siteStory: Set<string> }> {
  const marketResearch = new Set<string>();
  const siteStory = new Set<string>();
  if (!siteIds.length) return { marketResearch, siteStory };
  const [mr, ss] = await Promise.all([
    supabase.from('research_run').select('site_submit_id').eq('state', 'approved').in('site_submit_id', siteIds),
    supabase.from('research_thread')
      .select('site_submit_id, runs:research_thread_run!research_thread_run_thread_id_fkey!inner ( kind, state )')
      .in('site_submit_id', siteIds)
      .eq('runs.kind', 'deep_pass')
      .eq('runs.state', 'complete'),
  ]);
  if (mr.error) throw mr.error;
  if (ss.error) throw ss.error;
  for (const r of (mr.data as { site_submit_id: string }[]) ?? []) marketResearch.add(r.site_submit_id);
  for (const r of (ss.data as { site_submit_id: string }[]) ?? []) siteStory.add(r.site_submit_id);
  return { marketResearch, siteStory };
}

// Person-set transitions. Owner check-off on a handoff slide goes to
// waiting_on_mike; Mike's approve/finish (or a 'none' slide's check-off) → done.
// The linked owner task is kept in step by the Phase 3 sync, not here.
export async function setSlideStatus(dealId: string, slide: SlideRow, status: SlideStatus): Promise<void> {
  const now = new Date().toISOString();
  const patch: Record<string, unknown> = {
    status,
    status_changed_at: now,
    done_at: status === 'done' ? now : null,
  };
  if (status === 'waiting_on_mike') patch.owner_done_at = now;
  if (status === 'not_started' || status === 'in_progress') patch.owner_done_at = null;
  const { error } = await supabase.from('deal_package_slide').update(patch).eq('id', slide.id);
  if (error) throw error;
  notifyPackageChanged(dealId);
}

// Quick-complete override (20261026120345): Done regardless of owner, handoff or
// missing inputs; the linked task closes (or reopens) by trigger, with no timeline
// post, so the board clock never moves. Unchecking returns the slide to Not started.
export async function setSlideDone(dealId: string | null, slideId: string, done: boolean): Promise<void> {
  const { error } = await supabase.rpc('set_package_slide_done', { p_slide_id: slideId, p_done: done });
  if (error) throw error;
  if (dealId) notifyPackageChanged(dealId);
}

// Every package's slides (dashboard expandable rows); grouped by package id.
export async function fetchAllSlides(): Promise<Map<string, SlideRow[]>> {
  const { data, error } = await supabase.from('v_deal_package_slide').select('*').order('position');
  if (error) throw error;
  const m = new Map<string, SlideRow[]>();
  for (const s of (data as SlideRow[]) ?? []) m.set(s.package_id, [...(m.get(s.package_id) ?? []), s]);
  return m;
}

// Client-side effective status after a local Done toggle (mirrors v_deal_package_slide).
export function localEffective(s: SlideRow): SlideStatus {
  if (s.status === 'done' || s.status === 'na') return s.status;
  return s.missing_inputs.length > 0 ? 'waiting_on_mike' : s.status;
}

// Next step for the primary action on a slide row.
export function nextAction(slide: SlideRow): { label: string; to: SlideStatus } | null {
  switch (slide.status) {
    case 'not_started':     return { label: 'Start', to: 'in_progress' };
    case 'in_progress':     return slide.handoff === 'none'
                              ? { label: 'Done', to: 'done' }
                              : { label: slide.handoff === 'approve' ? 'Submit for approval' : 'Set up — hand to Mike', to: 'waiting_on_mike' };
    case 'waiting_on_mike': return { label: slide.handoff === 'finish' ? 'Finish' : 'Approve', to: 'done' };
    default:                return null;
  }
}

export type ManualInput = 'site_plan_received_at' | 'dot_study_received_at' | 'final_loi_at';

export async function setPackageInput(dealId: string, pkgId: string, field: ManualInput, on: boolean): Promise<void> {
  const { error } = await supabase
    .from('deal_package')
    .update({ [field]: on ? new Date().toISOString() : null })
    .eq('id', pkgId);
  if (error) throw error;
  notifyPackageChanged(dealId);
}

// Once-only gate dates. A saved row means "answered": blank = hasn't happened.
export async function saveGateDates(dealId: string, firstDraft: string | null, firstResponse: string | null): Promise<void> {
  const { error } = await supabase
    .from('deal_gate_date')
    .upsert(
      { deal_id: dealId, first_draft_sent_on: firstDraft, first_response_on: firstResponse, confirmed_at: new Date().toISOString() },
      { onConflict: 'deal_id' },
    );
  if (error) throw error;
  notifyPackageChanged(dealId);
}

// ─── Template settings (admin; RLS enforces) ────────────────────────────────

export async function fetchTemplate(): Promise<TemplateRow[]> {
  const { data, error } = await supabase
    .from('package_slide_template')
    .select('key, label, position, owner_user_id, handoff, inputs, allows_na, after_key, done_by_gate, started_by_gate, note, active')
    .order('position');
  if (error) throw error;
  return (data as TemplateRow[]) ?? [];
}

export async function updateTemplate(key: string, patch: Partial<Omit<TemplateRow, 'key'>>): Promise<void> {
  const { data, error } = await supabase.from('package_slide_template').update(patch).eq('key', key).select('key');
  if (error) throw error;
  if (!data?.length) throw new Error('Not saved — slide settings are admin-only.');
}
