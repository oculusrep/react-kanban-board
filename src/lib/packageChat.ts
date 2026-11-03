// Package chat (migration 20261102125716): one thread per package, each message
// optionally tagged to a slide (slide_id null = "General"). Internal users only.
//
// Its own tables on purpose, like task chat. Never write a package chat message to
// site_submit_comment, activity or note_object_link — inserts there reset the deal
// board clock and site_submit_comment is read by the client portal.
//
// Read markers: slide_id null = read the whole thread; a slide = read that slide's
// filtered view. A message from someone else is unread when it is newer than the
// whole-thread marker and (if slide-tagged) newer than that slide's marker.

import { supabase } from './supabaseClient';

export interface PackageComment {
  id: string;
  package_id: string;
  slide_id: string | null;
  author_id: string;
  content: string;
  created_at: string;
}

export interface PackageSlideRef { id: string; label: string; position: number }

// Unread keys within a package: slide ids, plus GENERAL for untagged messages.
export const GENERAL = 'general';

const COLS = 'id, package_id, slide_id, author_id, content, created_at';

export async function fetchPackageComments(packageId: string): Promise<PackageComment[]> {
  const { data, error } = await supabase
    .from('package_comment').select(COLS).eq('package_id', packageId).order('created_at', { ascending: true });
  if (error) throw error;
  return (data as PackageComment[]) ?? [];
}

// All of the package's slides (every owner, held or not), template order.
export async function fetchPackageSlideRefs(packageId: string): Promise<PackageSlideRef[]> {
  const { data, error } = await supabase
    .from('deal_package_slide').select('id, label, position').eq('package_id', packageId).order('position');
  if (error) throw error;
  return (data as PackageSlideRef[]) ?? [];
}

// author_id defaults to the signed-in user in the database (RLS enforces it).
export async function postPackageComment(packageId: string, slideId: string | null, content: string): Promise<PackageComment> {
  const { data, error } = await supabase
    .from('package_comment')
    .insert({ package_id: packageId, slide_id: slideId, content: content.trim() })
    .select(COLS)
    .single();
  if (error) throw error;
  return data as PackageComment;
}

export async function markPackageRead(packageId: string, slideId: string | null, userId: string): Promise<void> {
  const { error } = await supabase
    .from('package_comment_read')
    .upsert({ package_id: packageId, user_id: userId, slide_id: slideId, last_read_at: new Date().toISOString() },
      { onConflict: 'package_id,user_id,slide_id' });
  if (error) throw error;
}

// Package id → unread keys (slide ids / GENERAL) for messages from someone else.
export async function fetchPackageUnread(packageIds: string[], userId: string): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>();
  if (!packageIds.length) return out;
  const [c, r] = await Promise.all([
    supabase.from('package_comment').select('package_id, slide_id, created_at').in('package_id', packageIds).neq('author_id', userId),
    supabase.from('package_comment_read').select('package_id, slide_id, last_read_at').in('package_id', packageIds).eq('user_id', userId),
  ]);
  if (c.error) throw c.error;
  if (r.error) throw r.error;
  const readAt = new Map<string, number>();
  for (const x of (r.data as { package_id: string; slide_id: string | null; last_read_at: string }[]) ?? []) {
    readAt.set(`${x.package_id}:${x.slide_id ?? ''}`, new Date(x.last_read_at).getTime());
  }
  for (const m of (c.data as { package_id: string; slide_id: string | null; created_at: string }[]) ?? []) {
    const at = new Date(m.created_at).getTime();
    const seen = Math.max(readAt.get(`${m.package_id}:`) ?? 0, m.slide_id ? readAt.get(`${m.package_id}:${m.slide_id}`) ?? 0 : 0);
    if (at <= seen) continue;
    if (!out.has(m.package_id)) out.set(m.package_id, new Set());
    out.get(m.package_id)!.add(m.slide_id ?? GENERAL);
  }
  return out;
}
