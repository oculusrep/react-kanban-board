// Task chat (migration 20261102084217): one thread per task, internal users only.
//
// Its own tables on purpose. Never write a task chat message to site_submit_comment,
// activity or note_object_link — inserts there reset the deal board clock and
// site_submit_comment is read by the client portal. task_comment has no triggers.

import { supabase } from './supabaseClient';

export interface TaskComment {
  id: string;
  task_id: string;
  author_id: string;
  content: string;
  created_at: string;
}

export async function fetchTaskComments(taskId: string): Promise<TaskComment[]> {
  const { data, error } = await supabase
    .from('task_comment')
    .select('id, task_id, author_id, content, created_at')
    .eq('task_id', taskId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data as TaskComment[]) ?? [];
}

// author_id defaults to the signed-in user in the database (RLS enforces it).
export async function postTaskComment(taskId: string, content: string): Promise<TaskComment> {
  const { data, error } = await supabase
    .from('task_comment')
    .insert({ task_id: taskId, content: content.trim() })
    .select('id, task_id, author_id, content, created_at')
    .single();
  if (error) throw error;
  return data as TaskComment;
}

export async function markTaskRead(taskId: string, userId: string): Promise<void> {
  const { error } = await supabase
    .from('task_comment_read')
    .upsert({ task_id: taskId, user_id: userId, last_read_at: new Date().toISOString() }, { onConflict: 'task_id,user_id' });
  if (error) throw error;
}

// Task ids with a message from someone else newer than my last read.
export async function fetchUnreadTaskIds(taskIds: string[], userId: string): Promise<Set<string>> {
  const out = new Set<string>();
  if (!taskIds.length) return out;
  const [c, r] = await Promise.all([
    supabase.from('task_comment').select('task_id, author_id, created_at').in('task_id', taskIds).neq('author_id', userId),
    supabase.from('task_comment_read').select('task_id, last_read_at').in('task_id', taskIds).eq('user_id', userId),
  ]);
  if (c.error) throw c.error;
  if (r.error) throw r.error;
  const readAt = new Map(((r.data as { task_id: string; last_read_at: string }[]) ?? []).map((x) => [x.task_id, x.last_read_at]));
  for (const m of (c.data as { task_id: string; created_at: string }[]) ?? []) {
    const seen = readAt.get(m.task_id);
    if (!seen || new Date(m.created_at) > new Date(seen)) out.add(m.task_id);
  }
  return out;
}

// Eastern date + time for a message header ("Nov 2, 9:41 AM").
export function chatStamp(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', timeZone: 'America/New_York',
  });
}
