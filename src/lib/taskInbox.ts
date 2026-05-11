import { supabase } from './supabaseClient';

// Canonical source of truth for whether a task is in the inbox.
//
// `task.is_inbox` is a derived signal. A task is IN the inbox iff it has
// no "placement" decision yet:
//   - top3_date IS NULL          (not pinned to Top 3 for any date)
//   - no row in task_block_scheduled_task  (not in any time block)
//   - triaged_at IS NULL         (user did not click ✓ Mark Triaged)
//   - blocked_at IS NULL         (user did not park as Awaiting / Blocked)
//
// Whenever code mutates a placement signal — pinning/unpinning Top 3,
// scheduling/unscheduling from a block, marking triaged, blocking or
// unblocking — call this helper afterward to keep is_inbox consistent.
// Setting category alone, due_at alone, or high_flag alone never
// affects inbox state.

export async function recomputeIsInbox(taskId: string): Promise<void> {
  const { data: task, error: tErr } = await supabase
    .from('task')
    .select('top3_date, triaged_at, blocked_at, is_inbox')
    .eq('id', taskId)
    .single();
  if (tErr || !task) {
    console.warn('[recomputeIsInbox] failed to read task', taskId, tErr);
    return;
  }

  const { count: scheduleCount, error: sErr } = await supabase
    .from('task_block_scheduled_task')
    .select('id', { count: 'exact', head: true })
    .eq('task_id', taskId);
  if (sErr) {
    console.warn('[recomputeIsInbox] failed to read schedules for', taskId, sErr);
    return;
  }

  const hasPlacement =
    task.top3_date !== null ||
    (scheduleCount ?? 0) > 0 ||
    task.triaged_at !== null ||
    task.blocked_at !== null;
  const desired = !hasPlacement;

  if (task.is_inbox === desired) return;

  const { error: upErr } = await supabase
    .from('task')
    .update({ is_inbox: desired })
    .eq('id', taskId);
  if (upErr) {
    console.warn('[recomputeIsInbox] failed to update is_inbox for', taskId, upErr);
  }
}
