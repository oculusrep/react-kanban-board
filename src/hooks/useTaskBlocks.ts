import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { recomputeIsInbox } from '../lib/taskInbox';
import {
  BlockInstanceWithTasks,
  IsoWeekday,
  MANUAL_RANK_STEP,
  TaskBlockInstance,
  TaskBlockInstanceInsert,
  TaskBlockInstanceUpdate,
  TaskBlockScheduledTask,
  TaskBlockTemplate,
  TaskBlockTemplateInsert,
  TaskBlockTemplateUpdate,
  isoWeekday,
} from '../types/taskBlock';

// ---------------------------------------------------------------------------
// useTaskBlockTemplates — list block templates for an owner.
// Use `activeOnly` when rendering the dashboard; pass false on the settings
// page so the user can see and reactivate previously-deactivated templates.
// ---------------------------------------------------------------------------

interface UseTemplatesOptions {
  ownerId: string | null | undefined;
  activeOnly?: boolean;
}

interface UseTemplatesResult {
  templates: TaskBlockTemplate[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useTaskBlockTemplates(opts: UseTemplatesOptions): UseTemplatesResult {
  const { ownerId, activeOnly = false } = opts;
  const [templates, setTemplates] = useState<TaskBlockTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchTemplates = useCallback(async () => {
    if (!ownerId) {
      setTemplates([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      let q = supabase
        .from('task_block_template')
        .select('*')
        .eq('owner_id', ownerId)
        .order('start_time', { ascending: true });
      if (activeOnly) q = q.eq('active', true);
      const { data, error: fetchError } = await q;
      if (fetchError) throw fetchError;
      setTemplates((data ?? []) as TaskBlockTemplate[]);
    } catch (err) {
      console.error('useTaskBlockTemplates error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load block templates');
    } finally {
      setLoading(false);
    }
  }, [ownerId, activeOnly]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  return { templates, loading, error, refetch: fetchTemplates };
}

// ---------------------------------------------------------------------------
// useBlockInstancesForDate — instances for a single (owner, date) with
// their scheduled_tasks already joined and ordered by manual_rank.
// This is the shape the dashboard's Today's Timeline lane consumes.
// ---------------------------------------------------------------------------

const INSTANCE_SELECT = `
  *,
  scheduled_tasks:task_block_scheduled_task(
    *,
    task(
      *,
      owner:user!task_owner_id_fkey(*),
      client(*),
      deal(*),
      property(*),
      site_submit(*),
      assignment(*),
      contact(*)
    )
  )
`;

interface UseInstancesOptions {
  ownerId: string | null | undefined;
  /** Local YYYY-MM-DD per CLAUDE.md timezone guidance. */
  onDate: string | null | undefined;
}

interface UseInstancesResult {
  instances: BlockInstanceWithTasks[];
  loading: boolean;
  error: string | null;
  refetch: () => void;
}

export function useBlockInstancesForDate(opts: UseInstancesOptions): UseInstancesResult {
  const { ownerId, onDate } = opts;
  const [instances, setInstances] = useState<BlockInstanceWithTasks[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchInstances = useCallback(async () => {
    if (!ownerId || !onDate) {
      setInstances([]);
      setLoading(false);
      return;
    }
    try {
      setLoading(true);
      setError(null);
      const { data, error: fetchError } = await supabase
        .from('task_block_instance')
        .select(INSTANCE_SELECT)
        .eq('owner_id', ownerId)
        .eq('on_date', onDate)
        .order('start_time', { ascending: true });
      if (fetchError) throw fetchError;

      // Sort scheduled_tasks within each instance by manual_rank (Postgres
      // returns nested arrays in insertion order, not the order of any
      // ORDER BY in the embedded select).
      const result = ((data ?? []) as unknown as BlockInstanceWithTasks[]).map((inst) => ({
        ...inst,
        scheduled_tasks: [...(inst.scheduled_tasks ?? [])].sort(
          (a, b) => a.manual_rank - b.manual_rank
        ),
      }));
      setInstances(result);
    } catch (err) {
      console.error('useBlockInstancesForDate error:', err);
      setError(err instanceof Error ? err.message : 'Failed to load block instances');
    } finally {
      setLoading(false);
    }
  }, [ownerId, onDate]);

  useEffect(() => {
    fetchInstances();
  }, [fetchInstances]);

  return { instances, loading, error, refetch: fetchInstances };
}

// ---------------------------------------------------------------------------
// Mutations — plain async functions. Components import directly; refetch via
// the calling hook's `refetch`.
// ---------------------------------------------------------------------------

// Templates ----------------------------------------------------------------

export async function createBlockTemplate(input: TaskBlockTemplateInsert): Promise<TaskBlockTemplate> {
  const { data, error } = await supabase
    .from('task_block_template')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as TaskBlockTemplate;
}

export async function updateBlockTemplate(
  id: string,
  patch: TaskBlockTemplateUpdate
): Promise<TaskBlockTemplate> {
  const { data, error } = await supabase
    .from('task_block_template')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as TaskBlockTemplate;
}

export async function deleteBlockTemplate(id: string): Promise<void> {
  const { error } = await supabase.from('task_block_template').delete().eq('id', id);
  if (error) throw error;
}

// Instances ----------------------------------------------------------------

export async function createBlockInstance(
  input: TaskBlockInstanceInsert
): Promise<TaskBlockInstance> {
  const { data, error } = await supabase
    .from('task_block_instance')
    .insert(input)
    .select()
    .single();
  if (error) throw error;
  return data as TaskBlockInstance;
}

export async function updateBlockInstance(
  id: string,
  patch: TaskBlockInstanceUpdate
): Promise<TaskBlockInstance> {
  const { data, error } = await supabase
    .from('task_block_instance')
    .update(patch)
    .eq('id', id)
    .select()
    .single();
  if (error) throw error;
  return data as TaskBlockInstance;
}

export async function deleteBlockInstance(id: string): Promise<void> {
  const { error } = await supabase.from('task_block_instance').delete().eq('id', id);
  if (error) throw error;
}

// Daily instance generator -------------------------------------------------

// For the given (owner, date), ensures a task_block_instance row exists for
// every active template whose byweekday includes that date's weekday. Safe
// to call repeatedly: the unique partial index on (template_id, owner_id,
// on_date) WHERE template_id IS NOT NULL absorbs duplicates via
// `ignoreDuplicates: true`. Multi-device races are handled by Postgres, not
// the client.
//
// Called from:
//   - The dashboard's Today's Timeline lane on mount (PR 5)
//   - The template settings page after a template is created or activated,
//     so the user sees today's instance show up without waiting for the
//     next dashboard mount.
export async function ensureInstancesForDate(args: {
  ownerId: string;
  /** Local YYYY-MM-DD per CLAUDE.md timezone guidance. */
  onDate: string;
}): Promise<{ generated: number }> {
  // Parse the date in local time. 'YYYY-MM-DD' alone is parsed as UTC by
  // some browsers, so explicitly anchor it to local midnight.
  const [y, m, d] = args.onDate.split('-').map((s) => parseInt(s, 10));
  const localDate = new Date(y, m - 1, d);
  const weekday: IsoWeekday = isoWeekday(localDate);

  // Pull active templates that run on this weekday. Postgres array contains
  // operator (`@>`) maps to .contains() in the supabase-js client.
  const { data: templates, error: tplError } = await supabase
    .from('task_block_template')
    .select('id, name, category, start_time, duration_minutes')
    .eq('owner_id', args.ownerId)
    .eq('active', true)
    .contains('byweekday', [weekday]);
  if (tplError) throw tplError;
  if (!templates || templates.length === 0) return { generated: 0 };

  const rows = templates.map((t) => ({
    template_id: t.id,
    owner_id: args.ownerId,
    on_date: args.onDate,
    start_time: t.start_time,
    duration_minutes: t.duration_minutes,
    name: t.name,
    category: t.category,
    status: 'scheduled' as const,
  }));

  // Use upsert with ignoreDuplicates to map to ON CONFLICT DO NOTHING. The
  // partial unique index `idx_task_block_instance_template_owner_date`
  // covers (template_id, owner_id, on_date) WHERE template_id IS NOT NULL.
  const { data: inserted, error: insError } = await supabase
    .from('task_block_instance')
    .upsert(rows, {
      onConflict: 'template_id,owner_id,on_date',
      ignoreDuplicates: true,
    })
    .select('id');
  if (insError) throw insError;

  return { generated: inserted?.length ?? 0 };
}

// Scheduled tasks ----------------------------------------------------------

// Schedules a task into a block. The unique constraint on task_id means a
// task can only be in one block at a time — so this either creates a new
// row or moves an existing one to a different block (the upsert handles both).
// `rank` defaults to (current max in target block) + MANUAL_RANK_STEP so the
// task lands at the bottom of the queue.
//
// Side effect: recomputes task.is_inbox — scheduling is a placement signal.
export async function scheduleTaskInBlock(args: {
  blockInstanceId: string;
  taskId: string;
  rank?: number;
}): Promise<TaskBlockScheduledTask> {
  const rank = args.rank ?? (await nextRankForBlock(args.blockInstanceId));
  const { data, error } = await supabase
    .from('task_block_scheduled_task')
    .upsert(
      {
        block_instance_id: args.blockInstanceId,
        task_id: args.taskId,
        manual_rank: rank,
      },
      { onConflict: 'task_id' }
    )
    .select()
    .single();
  if (error) throw error;
  await recomputeIsInbox(args.taskId);
  return data as TaskBlockScheduledTask;
}

// Removes a task from whatever block it's in (lookup is by unique task_id).
// Recomputes is_inbox so an unplaced task returns to the Inbox unless the
// user previously clicked ✓ Mark Triaged.
export async function unscheduleTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('task_block_scheduled_task')
    .delete()
    .eq('task_id', taskId);
  if (error) throw error;
  await recomputeIsInbox(taskId);
}

export async function updateScheduledTaskRank(
  scheduledTaskId: string,
  newRank: number
): Promise<TaskBlockScheduledTask> {
  const { data, error } = await supabase
    .from('task_block_scheduled_task')
    .update({ manual_rank: newRank })
    .eq('id', scheduledTaskId)
    .select()
    .single();
  if (error) throw error;
  return data as TaskBlockScheduledTask;
}

// Moves a scheduled task to a (possibly different) block + sets its rank.
// Used by the timeline's drag-and-drop handler — handles both reorder
// within a block and move across blocks in one update.
export async function moveScheduledTask(args: {
  scheduledTaskId: string;
  newBlockInstanceId: string;
  newRank: number;
}): Promise<void> {
  const { error } = await supabase
    .from('task_block_scheduled_task')
    .update({
      block_instance_id: args.newBlockInstanceId,
      manual_rank: args.newRank,
    })
    .eq('id', args.scheduledTaskId);
  if (error) throw error;
}

// Returns the next manual_rank for a block (max existing + step). Used by
// scheduleTaskInBlock when no explicit rank is supplied.
async function nextRankForBlock(blockInstanceId: string): Promise<number> {
  const { data, error } = await supabase
    .from('task_block_scheduled_task')
    .select('manual_rank')
    .eq('block_instance_id', blockInstanceId)
    .order('manual_rank', { ascending: false })
    .limit(1);
  if (error) throw error;
  const max = data && data.length > 0 ? data[0].manual_rank : 0;
  return max + MANUAL_RANK_STEP;
}
