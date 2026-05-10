import { Database } from '../../database-schema';

// Base types from generated Supabase schema
export type Task = Database['public']['Tables']['task']['Row'];
export type TaskInsert = Database['public']['Tables']['task']['Insert'];
export type TaskUpdate = Database['public']['Tables']['task']['Update'];

export type TaskProject = Database['public']['Tables']['task_project']['Row'];
export type TaskProjectInsert = Database['public']['Tables']['task_project']['Insert'];

// task_category table — team-wide list of categories. Users can add more
// inline from the Inbox dropdown. Replaces the old fixed CHECK enum.
export type TaskCategoryRow = Database['public']['Tables']['task_category']['Row'];
export type TaskCategoryRowInsert = Database['public']['Tables']['task_category']['Insert'];

// Palette keys for task_category.color — must match the CHECK constraint.
export type TaskCategoryColor =
  | 'amber'
  | 'blue'
  | 'indigo'
  | 'gray'
  | 'green'
  | 'slate'
  | 'red'
  | 'teal';
export const TASK_CATEGORY_COLORS: TaskCategoryColor[] = [
  'amber', 'blue', 'indigo', 'gray', 'green', 'slate', 'red', 'teal',
];

type User = Database['public']['Tables']['user']['Row'];
type Client = Database['public']['Tables']['client']['Row'];
type Deal = Database['public']['Tables']['deal']['Row'];
type Property = Database['public']['Tables']['property']['Row'];
type SiteSubmit = Database['public']['Tables']['site_submit']['Row'];
type Assignment = Database['public']['Tables']['assignment']['Row'];
type Contact = Database['public']['Tables']['contact']['Row'];

// Legacy string-literal type for the original 6 hardcoded categories.
// Retained only because the task.category text column still exists as
// a fallback during the user-defined-categories migration. Prefer
// task.category_id (UUID FK) + the joined `category_record` relation
// for new code; this union will be removed when the text column drops.
export type TaskCategory =
  | 'prospecting'
  | 'pipeline'
  | 'ovis'
  | 'email'
  | 'personal'
  | 'other';

export type TaskStatus = 'open' | 'in_progress' | 'completed' | 'cancelled';

export type TaskSignalStrength = 'HOT' | 'WARM_PLUS' | 'WARM' | 'COOL';

export type TaskProjectStatus = 'active' | 'completed' | 'archived';

// Linkable object types (spec §7.1)
export type TaskLinkableObjectType =
  | 'client'
  | 'deal'
  | 'property'
  | 'site_submit'
  | 'assignment'
  | 'contact';

// Task with optional joined relations — used by list and detail queries.
export interface TaskWithRelations extends Task {
  owner?: User;
  assigned_by?: User;
  created_by?: User;
  parent_task?: Task;
  project?: TaskProject;
  /** Joined task_category row (UUID FK on task.category_id). Aliased
   *  `category_record` so it doesn't collide with the legacy `category`
   *  text column. Once the text column is dropped this can be renamed. */
  category_record?: TaskCategoryRow;
  client?: Client;
  deal?: Deal;
  property?: Property;
  site_submit?: SiteSubmit;
  assignment?: Assignment;
  contact?: Contact;
  // Subtask progress when this task is a parent
  subtask_total?: number;
  subtask_completed?: number;
}

// Quick-add payload from the inline popover (spec §7.2). Subject is required;
// everything else is optional and the popover's pill buttons let the user
// fill in category / due / assign / duration before saving.
export interface QuickAddTaskInput {
  subject: string;
  category?: TaskCategory;
  owner_id?: string; // defaults to current user
  due_at?: string | null;
  duration_minutes?: number | null;
  high_flag?: boolean;
  description?: string | null;
  // Object link — at most one is typically set from a quick-add (the source object)
  client_id?: string | null;
  deal_id?: string | null;
  property_id?: string | null;
  site_submit_id?: string | null;
  assignment_id?: string | null;
  contact_id?: string | null;
}

// Filters for the all-tasks view (spec §15.3) and the dashboard lanes (Phase 2.5).
export interface TaskListFilters {
  status?: TaskStatus | TaskStatus[];
  category?: TaskCategory | TaskCategory[];
  owner_id?: string;
  high_flag?: boolean;
  has_parent?: boolean;
  has_children?: boolean;
  // Object link filters
  client_id?: string;
  deal_id?: string;
  property_id?: string;
  site_submit_id?: string;
  assignment_id?: string;
  contact_id?: string;
  // Date range on due_at
  due_before?: string;
  due_after?: string;
  // Free text on subject + description
  search?: string;
  // Phase 2.5 — dashboard lanes
  is_inbox?: boolean;
  /** YYYY-MM-DD; matches tasks pinned to Top 3 for that specific date. */
  top3_date?: string;
  /** Filters to tasks that current_user delegated (assigned_by_id = X). Pair with owner_id_not for the Watching lane. */
  assigned_by_id?: string;
  /** "Tasks where owner_id is not this user" — for the Watching lane (delegated to others). */
  owner_id_not?: string;
  /** When true, only tasks with blocked_at IS NOT NULL (Awaiting lane). When false, only blocked_at IS NULL. */
  blocked?: boolean;
}

// Default category mapping when quick-capturing from an object page (spec §7.2).
// Used by the popover to pre-suggest a category based on the source object.
export const DEFAULT_CATEGORY_BY_OBJECT: Record<TaskLinkableObjectType, TaskCategory> = {
  contact: 'prospecting',
  client: 'pipeline',
  deal: 'pipeline',
  property: 'pipeline',
  site_submit: 'pipeline',
  assignment: 'pipeline',
};
