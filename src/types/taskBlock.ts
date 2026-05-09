import { Database } from '../../database-schema';
import { TaskCategory, TaskWithRelations } from './task';

// Base types from generated Supabase schema
export type TaskBlockTemplate = Database['public']['Tables']['task_block_template']['Row'];
export type TaskBlockTemplateInsert = Database['public']['Tables']['task_block_template']['Insert'];
export type TaskBlockTemplateUpdate = Database['public']['Tables']['task_block_template']['Update'];

export type TaskBlockInstance = Database['public']['Tables']['task_block_instance']['Row'];
export type TaskBlockInstanceInsert = Database['public']['Tables']['task_block_instance']['Insert'];
export type TaskBlockInstanceUpdate = Database['public']['Tables']['task_block_instance']['Update'];

export type TaskBlockScheduledTask = Database['public']['Tables']['task_block_scheduled_task']['Row'];
export type TaskBlockScheduledTaskInsert = Database['public']['Tables']['task_block_scheduled_task']['Insert'];
export type TaskBlockScheduledTaskUpdate = Database['public']['Tables']['task_block_scheduled_task']['Update'];

// String-literal narrowing for the CHECK-constrained status column.
export type TaskBlockInstanceStatus = 'scheduled' | 'in_progress' | 'completed' | 'skipped';

// ISO weekday: 1=Monday .. 7=Sunday. Matches the SQL byweekday array.
export type IsoWeekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;

// Reuses TaskCategory from task.ts — the schema CHECKs are identical.
export type TaskBlockCategory = TaskCategory;

// A scheduled-task row joined to its underlying task. The task may have full
// relations (owner, links) when fetched via the dashboard query.
export interface ScheduledTaskWithTask extends TaskBlockScheduledTask {
  task: TaskWithRelations;
}

// A block instance with its queued tasks already joined and ordered by rank.
// This is the shape the Today's Timeline lane consumes.
export interface BlockInstanceWithTasks extends TaskBlockInstance {
  scheduled_tasks: ScheduledTaskWithTask[];
}

// Form input for the template editor (PR 3). Reuses the Insert shape but
// drops fields that the form sets server-side or via auth context.
export interface BlockTemplateFormInput {
  name: string;
  category: TaskBlockCategory;
  byweekday: IsoWeekday[];
  start_time: string; // 'HH:MM' or 'HH:MM:SS'
  duration_minutes: number;
  active?: boolean;
}

// Maps the JS Date getDay() (0=Sun..6=Sat) to ISO weekday (1=Mon..7=Sun).
// Local time is the source per CLAUDE.md timezone guidance.
export const isoWeekday = (d: Date): IsoWeekday => {
  const js = d.getDay();
  return (js === 0 ? 7 : js) as IsoWeekday;
};

// Drag-rank spacing — leaves room to insert between adjacent tasks without
// a full reindex. See task_block_scheduled_task.manual_rank comment.
export const MANUAL_RANK_STEP = 1024;
