// Tasks queue (Package Tracker Phase 3, spec §7): one ordered list of a person's
// open tasks — package slides and everything else — plus the package slides
// still held until their inputs arrive. Reads stay off site_submit (its RLS
// seq-scans per row for signed-in users; see decisions §4): names come from the
// task subject.

import { supabase } from './supabaseClient';
import { InputKey } from './packageTracker';

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
  slide: { label: string; handoff: 'none' | 'approve' | 'finish'; template_key: string } | null;
}

export interface HeldSlide {
  id: string;
  label: string;
  package_id: string;
  deal_id: string | null;
  site_submit_id: string | null;
  missing_inputs: InputKey[];
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
    .select('id, subject, description, status, due_at, queue_rank, created_at, deal_id, site_submit_id, package_slide_id, slide:deal_package_slide!task_package_slide_id_fkey ( label, handoff, template_key )')
    .eq('owner_id', ownerId)
    .in('status', ['open', 'in_progress'])
    .order('queue_rank', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return ((data as any[]) ?? []).map((t) => ({ ...t, slide: one(t.slide) }));
}

// Package slides this owner will get once their inputs arrive: not done / N/A,
// inputs missing, and no task yet (Start Package holds them; release creates them).
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
  const { data: tasks, error: tErr } = await supabase
    .from('task').select('package_slide_id').in('package_slide_id', slides.map((s) => s.id));
  if (tErr) throw tErr;
  const hasTask = new Set(((tasks as { package_slide_id: string }[]) ?? []).map((t) => t.package_slide_id));
  return slides.filter((s) => !hasTask.has(s.id));
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

// Drag order: the whole visible list, in its new order (one owner).
export async function saveQueueOrder(taskIds: string[]): Promise<void> {
  const { error } = await supabase.rpc('set_task_queue_order', { p_task_ids: taskIds });
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
