import { useCallback, useEffect, useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import {
  BlockInstanceWithTasks,
  MANUAL_RANK_STEP,
  TaskBlockInstance,
  TaskBlockInstanceInsert,
  TaskBlockInstanceUpdate,
  TaskBlockScheduledTask,
  TaskBlockTemplate,
  TaskBlockTemplateInsert,
  TaskBlockTemplateUpdate,
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

// Scheduled tasks ----------------------------------------------------------

// Schedules a task into a block. The unique constraint on task_id means a
// task can only be in one block at a time — so this either creates a new
// row or moves an existing one to a different block (the upsert handles both).
// `rank` defaults to (current max in target block) + MANUAL_RANK_STEP so the
// task lands at the bottom of the queue.
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
  return data as TaskBlockScheduledTask;
}

// Removes a task from whatever block it's in (lookup is by unique task_id).
export async function unscheduleTask(taskId: string): Promise<void> {
  const { error } = await supabase
    .from('task_block_scheduled_task')
    .delete()
    .eq('task_id', taskId);
  if (error) throw error;
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
