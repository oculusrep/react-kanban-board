/**
 * ContactDetailDrawer Types
 *
 * Types for the reusable contact detail drawer component.
 */

import { UnifiedTimelineItem, TimelineSource, TimelineActivityType } from '../../../types/timeline';

// The context in which the drawer is being used
export type DrawerContext =
  | 'hunter'           // Prospecting workspace
  | 'crm'              // Standard CRM contact view
  | 'deal'             // Deal-related contact
  | 'assignment'       // Assignment-related contact
  | 'standalone';      // Used as standalone panel

// Contact data structure
export interface ContactData {
  id: string;
  first_name: string | null;
  last_name: string | null;
  company: string | null;
  email: string | null;
  phone: string | null;
  mobile_phone: string | null;
  title: string | null;
  linked_in_profile_link?: string | null;
  mailing_city?: string | null;
  mailing_state?: string | null;
  // Optional related entities
  target_id?: string | null;
  target?: {
    id: string;
    concept_name: string;
    signal_strength?: 'HOT' | 'WARM+' | 'WARM' | 'COOL';
    industry_segment?: string | null;
    website?: string | null;
    score_reasoning?: string | null;
  } | null;
  client_id?: string | null;
}

// Callbacks for drawer actions
export interface DrawerCallbacks {
  onClose: () => void;
  onContactUpdate?: (contact: ContactData) => void;
  onActivityLogged?: (activity: UnifiedTimelineItem) => void;
  onNoteAdded?: (note: UnifiedTimelineItem) => void;
  onEmailSent?: (emailData: { subject: string; to: string }) => void;
  onTaskComplete?: (taskId: string) => void;
}

// Feature flags to control drawer capabilities per context
export interface DrawerFeatures {
  canEdit?: boolean;                    // Allow contact editing
  canLogActivity?: boolean;             // Show activity logging buttons
  canComposeEmail?: boolean;            // Show email compose button
  canAddNote?: boolean;                 // Show note input
  canCompleteTask?: boolean;            // Show complete task button
  showLinkedInButton?: boolean;         // Show LinkedIn link
  showWebsiteButton?: boolean;          // Show website link
  showZoomInfoEnrich?: boolean;         // Show ZoomInfo enrichment
  showSignalStrength?: boolean;         // Show target signal strength badge
  enableAISummary?: boolean;            // Enable AI summary generation
}

// Activity types available for quick logging (outreach)
export type QuickLogActivityType =
  | 'email'
  | 'linkedin'
  | 'sms'
  | 'voicemail'
  | 'call'
  | 'meeting';

// Response types available for logging (inbound engagement)
export type QuickLogResponseType =
  | 'email_response'
  | 'linkedin_response'
  | 'sms_response'
  | 'return_call';

// All loggable activity types
export type AllQuickLogType = QuickLogActivityType | QuickLogResponseType;

// Activity configuration for UI
export interface ActivityConfig {
  label: string;
  color: string;
  bgColor: string;
}

export const ACTIVITY_CONFIG: Record<QuickLogActivityType, ActivityConfig> = {
  email: { label: 'Email', color: 'text-blue-600', bgColor: 'bg-blue-50' },
  linkedin: { label: 'LinkedIn', color: 'text-indigo-600', bgColor: 'bg-indigo-50' },
  sms: { label: 'SMS', color: 'text-purple-600', bgColor: 'bg-purple-50' },
  voicemail: { label: 'Voicemail', color: 'text-orange-600', bgColor: 'bg-orange-50' },
  call: { label: 'Call', color: 'text-green-600', bgColor: 'bg-green-50' },
  meeting: { label: 'Meeting', color: 'text-teal-600', bgColor: 'bg-teal-50' },
};

// Response configuration for UI (green theme for inbound engagement)
export const RESPONSE_CONFIG: Record<QuickLogResponseType, ActivityConfig> = {
  email_response: { label: 'Email Reply', color: 'text-green-600', bgColor: 'bg-green-50' },
  linkedin_response: { label: 'LinkedIn Reply', color: 'text-green-600', bgColor: 'bg-green-50' },
  sms_response: { label: 'SMS Reply', color: 'text-green-600', bgColor: 'bg-green-50' },
  return_call: { label: 'Return Call', color: 'text-green-600', bgColor: 'bg-green-50' },
};

// Combined config for all activity types
export const ALL_ACTIVITY_CONFIG: Record<AllQuickLogType, ActivityConfig> = {
  ...ACTIVITY_CONFIG,
  ...RESPONSE_CONFIG,
};

// Helper to check if a type is a response type
export function isResponseType(type: string): type is QuickLogResponseType {
  return ['email_response', 'linkedin_response', 'sms_response', 'return_call'].includes(type);
}

// Outreach activity types (for logging)
export const OUTREACH_TYPES: QuickLogActivityType[] = ['email', 'linkedin', 'sms', 'voicemail'];

// Connection activity types (for logging)
export const CONNECTION_TYPES: QuickLogActivityType[] = ['call', 'meeting'];

// Response types (inbound engagement)
export const RESPONSE_TYPES: QuickLogResponseType[] = ['email_response', 'linkedin_response', 'sms_response', 'return_call'];

// Main component props
export interface ContactDetailDrawerProps {
  // Core props
  isOpen: boolean;
  contact: ContactData | null;
  context: DrawerContext;

  // Optional task context (for ProspectingWorkspace)
  taskId?: string | null;

  // Callbacks
  callbacks: DrawerCallbacks;

  // Feature configuration (defaults based on context)
  features?: Partial<DrawerFeatures>;

  // Timeline configuration
  timelineSources?: TimelineSource[];   // Which sources to include
  initialTab?: 'activity' | 'emails';   // Default tab

  // Styling
  width?: string;                       // Default: '600px'
  zIndex?: number;                      // Default: 50

  // Email compose state (passed from parent)
  emailTemplates?: Array<{
    id: string;
    name: string;
    subject: string;
    body: string;
    category?: string;
  }>;
  emailSignature?: {
    id: string;
    signature_html: string;
  } | null;
  onOpenEmailCompose?: () => void;

  // ZoomInfo integration
  onZoomInfoEnrich?: () => void;
  zoomInfoLoading?: boolean;
}

// Default features by context
export const DEFAULT_FEATURES: Record<DrawerContext, DrawerFeatures> = {
  hunter: {
    canEdit: true,
    canLogActivity: true,
    canComposeEmail: true,
    canAddNote: true,
    canCompleteTask: true,
    showLinkedInButton: true,
    showWebsiteButton: true,
    showZoomInfoEnrich: true,
    showSignalStrength: true,
    enableAISummary: false,
  },
  crm: {
    canEdit: true,
    canLogActivity: true,
    canComposeEmail: true,
    canAddNote: true,
    canCompleteTask: false,
    showLinkedInButton: true,
    showWebsiteButton: true,
    showZoomInfoEnrich: false,
    showSignalStrength: false,
    enableAISummary: false,
  },
  deal: {
    canEdit: false,
    canLogActivity: true,
    canComposeEmail: true,
    canAddNote: true,
    canCompleteTask: false,
    showLinkedInButton: true,
    showWebsiteButton: false,
    showZoomInfoEnrich: false,
    showSignalStrength: false,
    enableAISummary: false,
  },
  assignment: {
    canEdit: false,
    canLogActivity: false,
    canComposeEmail: true,
    canAddNote: false,
    canCompleteTask: false,
    showLinkedInButton: true,
    showWebsiteButton: false,
    showZoomInfoEnrich: false,
    showSignalStrength: false,
    enableAISummary: false,
  },
  standalone: {
    canEdit: true,
    canLogActivity: true,
    canComposeEmail: true,
    canAddNote: true,
    canCompleteTask: false,
    showLinkedInButton: true,
    showWebsiteButton: true,
    showZoomInfoEnrich: false,
    showSignalStrength: false,
    enableAISummary: false,
  },
};

// Signal strength colors
export const SIGNAL_COLORS: Record<string, string> = {
  HOT: 'bg-red-100 text-red-700 border-red-300',
  'WARM+': 'bg-orange-100 text-orange-700 border-orange-300',
  WARM: 'bg-yellow-100 text-yellow-700 border-yellow-300',
  COOL: 'bg-blue-100 text-blue-700 border-blue-300',
};
