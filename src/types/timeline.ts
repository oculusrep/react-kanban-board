/**
 * Unified Timeline Types
 *
 * Types for the unified activity timeline that aggregates data from
 * multiple sources: prospecting_activity, prospecting_note, activity table,
 * emails, and hunter_outreach_draft.
 */

// All possible sources for timeline items
export type TimelineSource =
  | 'prospecting_activity'    // From prospecting_activity table
  | 'prospecting_note'        // From prospecting_note table
  | 'activity'                // From main activity table
  | 'email'                   // From emails table via email_object_link
  | 'hunter_outreach';        // From hunter_outreach_draft (sent emails)

// Activity types covering all sources
export type TimelineActivityType =
  | 'note'
  | 'email'
  | 'email_received'          // Inbound email
  | 'email_sent'              // Outbound email
  | 'linkedin'
  | 'sms'
  | 'voicemail'
  | 'call'
  | 'meeting'
  | 'task'
  | 'status_change'
  | 'system'
  | 'unknown';

// Direction for emails and calls
export type ActivityDirection = 'inbound' | 'outbound' | 'unknown';

/**
 * Unified timeline item that captures all activity sources
 */
export interface UnifiedTimelineItem {
  // Identity
  id: string;
  source: TimelineSource;
  type: TimelineActivityType;

  // Timing
  created_at: string;
  completed_at?: string | null;

  // Content
  subject?: string | null;              // Email subject or task subject
  content?: string | null;              // Note content, description, or body preview
  email_body_preview?: string | null;   // First ~200 chars of email

  // Email-specific fields
  email_subject?: string | null;
  direction?: ActivityDirection;
  sender_email?: string | null;
  sender_name?: string | null;
  recipient_list?: Array<{ email: string; name?: string; type?: string }> | null;
  has_attachments?: boolean;
  attachment_count?: number;
  thread_id?: string | null;
  gmail_id?: string | null;

  // Call-specific fields
  call_duration_seconds?: number | null;
  call_disposition?: string | null;
  completed_call?: boolean;

  // Meeting-specific fields
  meeting_held?: boolean;

  // Attribution
  created_by?: string | null;           // User ID who created
  created_by_name?: string | null;      // Resolved user name

  // Activity table fields (for CRM activities)
  activity_type_name?: string | null;
  activity_status?: {
    name: string;
    is_closed: boolean;
    color?: string;
  } | null;

  // Related entities
  contact_id?: string | null;
  target_id?: string | null;
  deal_id?: string | null;
  client_id?: string | null;

  // Hunter-specific
  hunter_outreach_id?: string | null;
  ai_reasoning?: string | null;

  // UI state helpers
  isExpanded?: boolean;

  // AI-friendly metadata for future summary generation
  metadata?: {
    sentiment?: 'positive' | 'neutral' | 'negative';
    key_topics?: string[];
    action_items?: string[];
    follow_up_needed?: boolean;
  };
}

/**
 * Timeline grouped by date for display
 */
export interface TimelineGroup {
  date: string;                         // ISO date string (YYYY-MM-DD)
  displayDate: string;                  // "Today", "Yesterday", "Jan 15, 2025"
  items: UnifiedTimelineItem[];
}

/**
 * Timeline summary for AI consumption
 */
export interface TimelineSummary {
  contact_id: string;
  contact_name: string;
  company?: string | null;

  // Aggregated statistics
  total_activities: number;
  first_contact_date?: string;
  last_contact_date?: string;

  // Activity breakdown
  activity_counts: {
    emails_sent: number;
    emails_received: number;
    calls: number;
    meetings: number;
    linkedin_messages: number;
    sms_messages: number;
    voicemails: number;
    notes: number;
    tasks: number;
  };

  // All items in chronological order (for AI processing)
  timeline_items: UnifiedTimelineItem[];

  // AI-generated fields (populated by AI summary endpoint)
  ai_summary?: string;
  relationship_status?: 'new' | 'active' | 'engaged' | 'stale' | 'converted';
  next_recommended_action?: string;
}

/**
 * Activity configuration for UI display
 */
export interface ActivityTypeConfig {
  label: string;
  icon: string;
  color: string;
  bgColor: string;
}

export const ACTIVITY_TYPE_CONFIG: Record<TimelineActivityType, ActivityTypeConfig> = {
  note: { label: 'Note', icon: 'DocumentTextIcon', color: 'text-gray-600', bgColor: 'bg-gray-100' },
  email: { label: 'Email', icon: 'EnvelopeIcon', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  email_sent: { label: 'Email Sent', icon: 'PaperAirplaneIcon', color: 'text-blue-600', bgColor: 'bg-blue-100' },
  email_received: { label: 'Email Received', icon: 'EnvelopeOpenIcon', color: 'text-green-600', bgColor: 'bg-green-100' },
  linkedin: { label: 'LinkedIn', icon: 'LinkIcon', color: 'text-indigo-600', bgColor: 'bg-indigo-100' },
  sms: { label: 'SMS', icon: 'ChatBubbleLeftIcon', color: 'text-purple-600', bgColor: 'bg-purple-100' },
  voicemail: { label: 'Voicemail', icon: 'PhoneIcon', color: 'text-orange-600', bgColor: 'bg-orange-100' },
  call: { label: 'Call', icon: 'PhoneIcon', color: 'text-green-600', bgColor: 'bg-green-100' },
  meeting: { label: 'Meeting', icon: 'CalendarDaysIcon', color: 'text-teal-600', bgColor: 'bg-teal-100' },
  task: { label: 'Task', icon: 'ClipboardDocumentListIcon', color: 'text-amber-600', bgColor: 'bg-amber-100' },
  status_change: { label: 'Status Change', icon: 'ArrowPathIcon', color: 'text-gray-500', bgColor: 'bg-gray-50' },
  system: { label: 'System', icon: 'CogIcon', color: 'text-gray-400', bgColor: 'bg-gray-50' },
  unknown: { label: 'Activity', icon: 'QuestionMarkCircleIcon', color: 'text-gray-400', bgColor: 'bg-gray-50' },
};
