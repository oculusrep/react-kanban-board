import { Database } from '../../database-schema';

// Base types from database
export type Activity = Database['public']['Tables']['activity']['Row'];
export type ActivityInsert = Database['public']['Tables']['activity']['Insert'];
export type ActivityStatus = Database['public']['Tables']['activity_status']['Row'];
export type ActivityType = Database['public']['Tables']['activity_type']['Row'];
export type ActivityPriority = Database['public']['Tables']['activity_priority']['Row'];
export type ActivityTaskType = Database['public']['Tables']['activity_task_type']['Row'];
export type User = Database['public']['Tables']['user']['Row'];
export type Contact = Database['public']['Tables']['contact']['Row'];

// Extended activity type with relations
export interface ActivityWithRelations extends Activity {
  activity_status?: ActivityStatus;
  activity_type?: ActivityType;
  activity_priority?: ActivityPriority;
  activity_task_type?: ActivityTaskType;
  owner?: User;
  updated_by_user?: User;
  contact?: Contact;
}

// Generic parent object interface
export interface ParentObject {
  id: string;
  type: 'deal' | 'contact' | 'client' | 'property' | 'site_submit' | 'assignment';
  name: string;
  displayName?: string; // Optional custom display name
}

// Activity tab configuration
export interface ActivityTabConfig {
  parentObject: ParentObject;
  title?: string;
  showSummary?: boolean;
  allowAdd?: boolean;
  allowEdit?: boolean;
  customFilters?: Array<{
    key: string;
    label: string;
    options: Array<{ value: string; label: string }>;
  }>;
}

// Related object option for autocomplete
export interface RelatedOption {
  id: string;
  label: string;
  type: string;
}

// Add task modal configuration
export interface AddTaskModalConfig {
  parentObject?: ParentObject;
  defaultRelatedObject?: ParentObject;
  requiredFields?: string[];
  hiddenFields?: string[];
  customValidation?: (formData: any) => Record<string, string>;
}