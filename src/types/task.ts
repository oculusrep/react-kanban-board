import { Database } from '../../database-schema';

// Base types from generated Supabase schema
export type Task = Database['public']['Tables']['task']['Row'];
export type TaskInsert = Database['public']['Tables']['task']['Insert'];
export type TaskUpdate = Database['public']['Tables']['task']['Update'];

export type TaskProject = Database['public']['Tables']['task_project']['Row'];
export type TaskProjectInsert = Database['public']['Tables']['task_project']['Insert'];

type User = Database['public']['Tables']['user']['Row'];
type Client = Database['public']['Tables']['client']['Row'];
type Deal = Database['public']['Tables']['deal']['Row'];
type Property = Database['public']['Tables']['property']['Row'];
type SiteSubmit = Database['public']['Tables']['site_submit']['Row'];
type Assignment = Database['public']['Tables']['assignment']['Row'];
type Contact = Database['public']['Tables']['contact']['Row'];

// String-literal narrowings of the CHECK-constrained columns. The generated
// schema types these as `string`; these aliases let callers get autocompletion
// and exhaustive switch checks without changing the storage type.
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

// Filters for the all-tasks view (spec §15.3)
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
