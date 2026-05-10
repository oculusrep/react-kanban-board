import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { recomputeIsInbox } from '../lib/taskInbox';
import { postTaskCompletionToTimelines } from '../lib/taskTimelinePost';
import {
  Task,
  TaskCategory,
  TaskInsert,
  TaskListFilters,
  TaskUpdate,
  TaskWithRelations,
} from '../types/task';

// ---------------------------------------------------------------------------
// useTaskList — list hook returning tasks matching `filters`.
// Pagination is applied per CLAUDE.md (task table will exceed 1000 rows).
// ---------------------------------------------------------------------------

interface UseTaskListResult {
  tasks: TaskWithRelations[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

const RELATIONS_SELECT = `
  *,
  owner:user!task_owner_id_fkey(*),
  assigned_by:user!task_assigned_by_id_fkey(*),
  created_by:user!task_created_by_id_fkey(*),
  project:task_project(*),
  client(*),
  deal(*),
  property(*),
  site_submit(*),
  assignment(*),
  contact(*)
`;

const PAGE_SIZE = 1000;

export function useTaskList(filters?: TaskListFilters): UseTaskListResult {
  const [tasks, setTasks] = useState<TaskWithRelations[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const allResults: TaskWithRelations[] = [];
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('task')
          .select(RELATIONS_SELECT)
          .order('created_at', { ascending: false })
          .range(offset, offset + PAGE_SIZE - 1);

        if (filters?.status !== undefined) {
          query = Array.isArray(filters.status)
            ? query.in('status', filters.status)
            : query.eq('status', filters.status);
        }
        if (filters?.category !== undefined) {
          query = Array.isArray(filters.category)
            ? query.in('category', filters.category)
            : query.eq('category', filters.category);
        }
        if (filters?.owner_id) query = query.eq('owner_id', filters.owner_id);
        if (filters?.high_flag !== undefined) query = query.eq('high_flag', filters.high_flag);
        if (filters?.has_parent === true) query = query.not('parent_task_id', 'is', null);
        if (filters?.has_parent === false) query = query.is('parent_task_id', null);
        if (filters?.client_id) query = query.eq('client_id', filters.client_id);
        if (filters?.deal_id) query = query.eq('deal_id', filters.deal_id);
        if (filters?.property_id) query = query.eq('property_id', filters.property_id);
        if (filters?.site_submit_id) query = query.eq('site_submit_id', filters.site_submit_id);
        if (filters?.assignment_id) query = query.eq('assignment_id', filters.assignment_id);
        if (filters?.contact_id) query = query.eq('contact_id', filters.contact_id);
        if (filters?.due_before) query = query.lte('due_at', filters.due_before);
        if (filters?.due_after) query = query.gte('due_at', filters.due_after);
        if (filters?.is_inbox !== undefined) query = query.eq('is_inbox', filters.is_inbox);
        if (filters?.top3_date) query = query.eq('top3_date', filters.top3_date);
        if (filters?.assigned_by_id) query = query.eq('assigned_by_id', filters.assigned_by_id);
        if (filters?.owner_id_not) query = query.neq('owner_id', filters.owner_id_not);
        if (filters?.search) {
          const term = `%${filters.search}%`;
          query = query.or(`subject.ilike.${term},description.ilike.${term}`);
        }

        const { data, error: fetchError } = await query;
        if (fetchError) throw fetchError;

        const batch = (data ?? []) as unknown as TaskWithRelations[];
        allResults.push(...batch);
        hasMore = batch.length === PAGE_SIZE;
        offset += PAGE_SIZE;
      }

      // has_children is a post-fetch filter (Postgres won't compute it cheaply
      // through PostgREST). We resolve by checking which task ids appear as
      // parent_task_id of any other fetched task.
      let result = allResults;
      if (filters?.has_children !== undefined) {
        const parentIds = new Set<string>();
        for (const t of allResults) {
          if (t.parent_task_id) parentIds.add(t.parent_task_id);
        }
        result = allResults.filter(t =>
          filters.has_children ? parentIds.has(t.id) : !parentIds.has(t.id)
        );
      }

      setTasks(result);
    } catch (err) {
      console.error('useTaskList error:', err);
      setError(err instanceof Error ? err.message : 'Unknown error fetching tasks');
    } finally {
      setLoading(false);
    }
  }, [
    filters?.status,
    filters?.category,
    filters?.owner_id,
    filters?.high_flag,
    filters?.has_parent,
    filters?.has_children,
    filters?.client_id,
    filters?.deal_id,
    filters?.property_id,
    filters?.site_submit_id,
    filters?.assignment_id,
    filters?.contact_id,
    filters?.due_before,
    filters?.due_after,
    filters?.is_inbox,
    filters?.top3_date,
    filters?.assigned_by_id,
    filters?.owner_id_not,
    filters?.search,
  ]);

  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  return { tasks, loading, error, refetch: fetchTasks };
}

// ---------------------------------------------------------------------------
// Mutations — plain async functions, not hooks. Components import them
// directly. They don't need state or effect tracking; the calling component's
// useTaskList hook will refetch after mutation completes.
// ---------------------------------------------------------------------------

export async function createTask(input: TaskInsert): Promise<Task> {
  // Phase 2.5: cross-user assignment lands in the assignee's inbox unless the
  // caller explicitly set is_inbox.
  const finalInput: TaskInsert = { ...input };
  if (
    finalInput.is_inbox === undefined &&
    finalInput.owner_id &&
    finalInput.created_by_id &&
    finalInput.owner_id !== finalInput.created_by_id
  ) {
    finalInput.is_inbox = true;
  }
  const { data, error } = await supabase
    .from('task')
    .insert(finalInput)
    .select()
    .single();
  if (error) throw error;
  return data as Task;
}

export async function updateTask(id: string, patch: TaskUpdate): Promise<Task> {
  const { data, error } = await supabase
    .from('task')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;

  // Inbox is a derived signal off placement (top3_date, block schedules,
  // triaged_at). If the caller mutated a placement field and didn't set
  // is_inbox explicitly, recompute and re-fetch so the returned row is
  // accurate. Category, due_at, and high_flag changes never affect inbox.
  const placementChanged =
    patch.top3_date !== undefined || patch.triaged_at !== undefined;
  if (placementChanged && patch.is_inbox === undefined) {
    await recomputeIsInbox(id);
    const { data: refreshed } = await supabase
      .from('task')
      .select('*')
      .eq('id', id)
      .single();
    if (refreshed) return refreshed as Task;
  }
  return data as Task;
}

// Explicit "I've decided to leave this in All Tasks without scheduling."
// Sets triaged_at so subsequent unpin/unschedule of any later placement
// won't auto-restore the task to inbox.
export async function markTaskTriaged(id: string): Promise<Task> {
  return updateTask(id, {
    is_inbox: false,
    triaged_at: new Date().toISOString(),
  });
}

export interface CompleteTaskOptions {
  completion_note?: string | null;
  private_completion?: boolean;
  /** When supplied, used as completed_at instead of now() — for backdating. */
  completed_at?: string;
  /**
   * The OVIS user.id of whoever is doing the completion. Required for
   * timeline posting. Pass auth context's userTableId.
   */
  actor_user_id: string;
}

// Sets status='completed' and stamps completed_at (defaults to now). Optional
// completion note + private flag. After the task row is updated, posts an
// entry to each linked object's timeline (spec §13) — unless private. The DB
// CHECK constraint task_completed_consistency enforces status and completed_at
// move together.
export async function completeTask(
  id: string,
  options: CompleteTaskOptions
): Promise<Task> {
  const patch: TaskUpdate = {
    status: 'completed',
    completed_at: options.completed_at ?? new Date().toISOString(),
  };
  if (options.completion_note !== undefined) patch.completion_note = options.completion_note;
  if (options.private_completion !== undefined) patch.private_completion = options.private_completion;
  const updated = await updateTask(id, patch);
  // Timeline post is fire-and-forget from the caller's perspective: errors are
  // logged inside the helper and don't undo the completion.
  await postTaskCompletionToTimelines(updated, { actorUserId: options.actor_user_id });
  return updated;
}

// Reopens a completed task. Clears completed_at to satisfy the consistency
// constraint, but leaves completion_note untouched (history of last completion).
export async function reopenTask(id: string): Promise<Task> {
  return updateTask(id, { status: 'open', completed_at: null });
}

export async function deleteTask(id: string): Promise<void> {
  const { error } = await supabase.from('task').delete().eq('id', id);
  if (error) throw error;
}

// Convenience used by the quick-add popover (spec §7.2). Sets owner_id and
// created_by_id to the current OVIS user, defaults category to 'personal'
// when not specified, then delegates to createTask.
export interface QuickCreateContext {
  currentUserTableId: string;
  defaultCategory?: TaskCategory;
}

export async function quickCreateTask(
  input: Omit<TaskInsert, 'owner_id'> & { owner_id?: string },
  ctx: QuickCreateContext
): Promise<Task> {
  return createTask({
    ...input,
    owner_id: input.owner_id ?? ctx.currentUserTableId,
    created_by_id: input.created_by_id ?? ctx.currentUserTableId,
    category: input.category ?? ctx.defaultCategory ?? 'personal',
  });
}
