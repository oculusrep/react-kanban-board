import { supabase } from './supabaseClient';
import { Task } from '../types/task';

// Posts a task-completion entry to each linked object's timeline (spec §13).
// Two timeline systems are handled:
//   - Activity-style (deal, client, contact, assignment) → activity table
//     with activity_type=Task and status=Completed. Uses existing lookup IDs.
//   - Chat-style (property, site_submit) → property_activity / site_submit_activity
//     with activity_type='task_completed' (added by migration
//     20260502000000_task_system_v2_timeline_post_check.sql).
//
// Errors are logged but not thrown — the task is already completed in the
// task table, and we don't want a timeline-post failure to undo that.
//
// Skips entirely if task.private_completion is true (spec §13).

// Hard-coded lookup IDs for the activity table inserts. These are seeded
// in production and have not changed since the v1 task system was built.
// Verified at migration time in supabase via:
//   SELECT id, name FROM activity_type WHERE name = 'Task';
//   SELECT id, name FROM activity_status WHERE name = 'Completed';
const ACTIVITY_TYPE_TASK_ID = '5fabd687-a06e-42d3-883a-2cdc9f7ac52e';
const ACTIVITY_STATUS_COMPLETED_ID = 'eaa30827-da50-42cf-8a9d-b6e8f94a46a2';

interface PostOptions {
  /** OVIS user.id of who completed the task (for the post header). */
  actorUserId: string;
}

interface ActorInfo {
  id: string;
  authUserId: string | null;
  name: string;
}

const fetchActor = async (userTableId: string): Promise<ActorInfo> => {
  const { data, error } = await supabase
    .from('user')
    .select('id, auth_user_id, first_name, last_name, email')
    .eq('id', userTableId)
    .single();
  if (error || !data) return { id: userTableId, authUserId: null, name: 'Someone' };
  const name =
    [data.first_name, data.last_name].filter(Boolean).join(' ') || data.email || 'Someone';
  return { id: data.id, authUserId: data.auth_user_id ?? null, name };
};

// Local-date YYYY-MM-DD per CLAUDE.md timezone guidance (Eastern, but local
// is what the user sees and matches their planning rhythm).
const todayLocal = (): string => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

// Activity table uses `timestamp without time zone` for completed_at, so we
// format as a naive ISO string (no Z suffix). Postgres interprets it in
// session time zone.
const naiveTs = (iso: string): string => iso.replace(/\.\d+Z$/, '').replace('Z', '');

export async function postTaskCompletionToTimelines(
  task: Task,
  options: PostOptions
): Promise<void> {
  if (task.private_completion) return;

  const completedAtIso = task.completed_at ?? new Date().toISOString();
  const actor = await fetchActor(options.actorUserId);
  const headerSubject = `✅ ${actor.name} completed task: ${task.subject}`;
  const noteText = task.completion_note?.trim() || null;

  // ----- Activity-style timeline (deal / client / contact / assignment) -----
  const activityFkSet =
    task.deal_id || task.client_id || task.contact_id || task.assignment_id;
  if (activityFkSet) {
    const { error } = await supabase.from('activity').insert({
      subject: headerSubject,
      description: noteText,
      activity_type_id: ACTIVITY_TYPE_TASK_ID,
      status_id: ACTIVITY_STATUS_COMPLETED_ID,
      owner_id: options.actorUserId,
      created_by_id: options.actorUserId,
      activity_date: todayLocal(),
      completed_at: naiveTs(completedAtIso),
      deal_id: task.deal_id,
      client_id: task.client_id,
      contact_id: task.contact_id,
      assignment_id: task.assignment_id,
      // property_id and site_submit_id intentionally omitted here — those
      // objects use the chat-style timelines below.
    });
    if (error) {
      console.warn('[task timeline] activity insert failed:', error);
    }
  }

  // ----- Property chat-style timeline -----
  // property_activity.created_by FK -> auth.users(id), so we need the actor's
  // auth_user_id, not the OVIS user table id.
  if (task.property_id && actor.authUserId) {
    const propertyNotes = noteText
      ? `Completed task: ${task.subject}\n\n${noteText}`
      : `Completed task: ${task.subject}`;
    const { error } = await supabase.from('property_activity').insert({
      property_id: task.property_id,
      contact_id: task.contact_id,
      activity_type: 'task_completed',
      notes: propertyNotes,
      created_by: actor.authUserId,
    });
    if (error) {
      console.warn('[task timeline] property_activity insert failed:', error);
    }
  }

  // ----- Site_submit chat-style timeline -----
  // The CHAT tab reads from site_submit_comment (NOT site_submit_activity).
  // Match the existing pattern used by status changes & file shares: write a
  // row to site_submit_comment with content describing the event.
  // visibility='internal' so completions surface to brokers but stay out of
  // the client portal feed.
  if (task.site_submit_id && actor.authUserId) {
    const content = noteText ? `${headerSubject}\n\n${noteText}` : headerSubject;
    const { error } = await supabase.from('site_submit_comment').insert({
      site_submit_id: task.site_submit_id,
      author_id: actor.authUserId,
      content,
      visibility: 'internal',
    });
    if (error) {
      console.warn('[task timeline] site_submit_comment insert failed:', error);
    }
  }
}
