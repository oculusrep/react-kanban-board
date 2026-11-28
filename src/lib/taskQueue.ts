// Tasks queue (Package Tracker Phase 3, spec §7): one ordered list of a person's
// open tasks — package slides and everything else — plus the package slides
// still held until their inputs arrive. Reads stay off site_submit (its RLS
// seq-scans per row for signed-in users; see decisions §4): names come from the
// task subject.

import { supabase } from './supabaseClient';
import { InputKey, localDate } from './packageTracker';

export interface QueueTask {
  id: string;
  subject: string;
  description: string | null;
  status: 'open' | 'in_progress' | 'completed' | 'cancelled';
  due_at: string | null;
  queue_rank: number | null;
  created_at: string;
  deal_id: string | null;
  site_submit_id: string | null;
  package_slide_id: string | null;
  slide: { label: string; handoff: 'none' | 'approve' | 'finish'; template_key: string; package_id: string; done_by_gate: number | null; position: number } | null;
}

export interface HeldSlide {
  id: string;
  label: string;
  package_id: string;
  deal_id: string | null;
  site_submit_id: string | null;
  missing_inputs: InputKey[];
  position: number;
}

export interface QueueOwner { id: string; name: string; role: string | null }

const one = <T,>(x: T | T[] | null | undefined): T | null => (Array.isArray(x) ? x[0] ?? null : x ?? null);

export async function fetchQueueOwners(): Promise<QueueOwner[]> {
  const { data, error } = await supabase
    .from('user')
    .select('id, first_name, last_name, ovis_role, active')
    .in('ovis_role', ['admin', 'broker_full', 'broker_lite', 'va'])
    .eq('active', true);
  if (error) throw error;
  return ((data as any[]) ?? [])
    .map((u) => ({ id: u.id, name: [u.first_name, u.last_name].filter(Boolean).join(' ') || 'User', role: u.ovis_role }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

// Open + in-progress tasks for one owner, in queue order (rank, then oldest first).
export async function fetchQueue(ownerId: string): Promise<QueueTask[]> {
  const { data, error } = await supabase
    .from('task')
    .select('id, subject, description, status, due_at, queue_rank, created_at, deal_id, site_submit_id, package_slide_id, slide:deal_package_slide!task_package_slide_id_fkey ( label, handoff, template_key, package_id, done_by_gate, position )')
    .eq('owner_id', ownerId)
    .in('status', ['open', 'in_progress'])
    .order('queue_rank', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data as any[]) ?? []).map((t) => ({ ...t, slide: one(t.slide) }));
}

// Package slides this owner will get once their inputs arrive: not done / N/A,
// inputs missing, and no task yet (Start Package holds them; release creates them).
// Paused packages are left out: nothing is released while paused, so they're not "up next".
export async function fetchHeldSlides(ownerId: string): Promise<HeldSlide[]> {
  const { data, error } = await supabase
    .from('v_deal_package_slide')
    .select('id, label, package_id, deal_id, site_submit_id, missing_inputs, status, position')
    .eq('owner_user_id', ownerId)
    .eq('inputs_ready', false)
    .not('status', 'in', '(done,na)')
    .order('position');
  if (error) throw error;
  const slides = (data as (HeldSlide & { status: string })[]) ?? [];
  if (!slides.length) return [];
  const [{ data: tasks, error: tErr }, { data: paused, error: pErr }] = await Promise.all([
    supabase.from('task').select('package_slide_id').in('package_slide_id', slides.map((s) => s.id)),
    supabase.from('deal_package').select('id').in('id', [...new Set(slides.map((s) => s.package_id))]).not('paused_at', 'is', null),
  ]);
  if (tErr) throw tErr;
  if (pErr) throw pErr;
  const hasTask = new Set(((tasks as { package_slide_id: string }[]) ?? []).map((t) => t.package_slide_id));
  const isPaused = new Set(((paused as { id: string }[]) ?? []).map((x) => x.id));
  return slides.filter((s) => !hasTask.has(s.id) && !isPaused.has(s.package_id));
}

// Names for held slides' packages (deal name; else the package's first task subject).
export async function fetchPackageNames(packageIds: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!packageIds.length) return out;
  const { data, error } = await supabase
    .from('task')
    .select('subject, slide:deal_package_slide!task_package_slide_id_fkey!inner ( package_id )')
    .in('slide.package_id', packageIds);
  if (error) throw error;
  for (const t of (data as any[]) ?? []) {
    const pkg = one(t.slide)?.package_id;
    const name = String(t.subject).split(' — ').slice(1).join(' — ');
    if (pkg && name && !out[pkg]) out[pkg] = name;
  }
  return out;
}

// Ranks of this owner's fully-held package cards (no tasks to carry a queue_rank).
export async function fetchHeldCardRanks(ownerId: string): Promise<Map<string, number>> {
  const { data, error } = await supabase.from('package_queue_rank').select('package_id, queue_rank').eq('owner_id', ownerId);
  if (error) throw error;
  return new Map(((data as { package_id: string; queue_rank: number }[]) ?? []).map((r) => [r.package_id, r.queue_rank]));
}

// Queue order as one list (20261103144723): 't:<task id>' or 'p:<package id>'. Position
// n → rank n*1000 on the task, or on the package's card (package_queue_rank), which is
// where a newly released slide task of that package starts. Ranks only — no clock.
export type QueueItem = `t:${string}` | `p:${string}`;
export async function saveQueueOrder(ownerId: string, items: QueueItem[]): Promise<void> {
  const { error } = await supabase.rpc('set_queue_order', { p_owner: ownerId, p_items: items });
  if (error) throw error;
}

// Check-off. Status only — no timeline post (package tasks must not touch the
// board clock; trg_sync_slide_from_task moves the slide).
export async function setQueueTaskStatus(id: string, status: 'open' | 'in_progress' | 'completed'): Promise<void> {
  const { error } = await supabase
    .from('task')
    .update({ status, completed_at: status === 'completed' ? new Date().toISOString() : null })
    .eq('id', id);
  if (error) throw error;
}

// ─── Command center (2026-11-02) ────────────────────────────────────────────

// Slides this owner has handed off and that now sit with Mike (approve / finish).
export interface WaitingSlide {
  id: string;
  label: string;
  package_id: string;
  deal_id: string | null;
  site_submit_id: string | null;
  owner_done_at: string | null;
}

export async function fetchWaitingOnMike(ownerId: string): Promise<WaitingSlide[]> {
  const { data, error } = await supabase
    .from('deal_package_slide')
    .select('id, label, package_id, owner_done_at, pkg:deal_package!inner ( deal_id, site_submit_id )')
    .eq('owner_user_id', ownerId)
    .eq('status', 'waiting_on_mike')
    .order('owner_done_at', { ascending: true });
  if (error) throw error;
  return ((data as any[]) ?? []).map((s) => {
    const pkg = one(s.pkg) as { deal_id: string | null; site_submit_id: string | null } | null;
    return { id: s.id, label: s.label, package_id: s.package_id, owner_done_at: s.owner_done_at,
             deal_id: pkg?.deal_id ?? null, site_submit_id: pkg?.site_submit_id ?? null };
  });
}

// Monday 00:00 local (Eastern) of the current week, as an ISO instant.
export function weekStartIso(now = new Date()): string {
  const d = new Date(`${localDate(now)}T00:00:00`);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.toISOString();
}

export async function fetchDoneThisWeek(ownerId: string): Promise<number> {
  const { count, error } = await supabase
    .from('task')
    .select('id', { count: 'exact', head: true })
    .eq('owner_id', ownerId)
    .eq('status', 'completed')
    .gte('completed_at', weekStartIso());
  if (error) throw error;
  return count ?? 0;
}

// Site / deal name and city for the cards. One batched read per table (site_submit
// RLS seq-scans per query, so never per card); loaded after the queue renders.
export interface Place { name: string | null; city: string | null }

export async function fetchPlaces(siteIds: string[], dealIds: string[]): Promise<{ sites: Record<string, Place>; deals: Record<string, Place> }> {
  const sites: Record<string, Place> = {};
  const deals: Record<string, Place> = {};
  const [s, d] = await Promise.all([
    siteIds.length
      ? supabase.from('site_submit')
          .select('id, site_submit_name, property:property!site_submit_property_id_fkey ( property_name, city )')
          .in('id', siteIds)
      : Promise.resolve({ data: [], error: null }),
    dealIds.length
      ? supabase.from('deal').select('id, deal_name, property:property_id ( property_name, city )').in('id', dealIds)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (s.error) throw s.error;
  if (d.error) throw d.error;
  for (const r of (s.data as any[]) ?? []) {
    const p = one(r.property) as { property_name: string | null; city: string | null } | null;
    sites[r.id] = { name: r.site_submit_name || p?.property_name || null, city: p?.city ?? null };
  }
  for (const r of (d.data as any[]) ?? []) {
    const p = one(r.property) as { property_name: string | null; city: string | null } | null;
    deals[r.id] = { name: r.deal_name || p?.property_name || null, city: p?.city ?? null };
  }
  return { sites, deals };
}
