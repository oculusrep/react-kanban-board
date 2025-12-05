// Types for the Prospecting Target system

export type ProspectingTargetStatus =
  | 'needs_research'  // Newly added, needs VA to research
  | 'researching'     // VA is actively working on it
  | 'ready'           // Research complete, ready to call
  | 'calling'         // Actively being worked by sales
  | 'converted'       // Became a real contact/opportunity
  | 'disqualified';   // Not a fit, removed from pipeline

export interface ProspectingTarget {
  id: string;
  company_name: string;
  website: string | null;
  notes: string | null;
  source: string | null;
  status: ProspectingTargetStatus;
  priority: number; // 1-5, where 1 is highest
  target_date: string | null;
  assigned_to: string | null;
  owner_id: string | null;
  research_notes: string | null;
  contacts_found: number;
  researched_at: string | null;
  researched_by: string | null;
  converted_contact_id: string | null;
  converted_client_id: string | null;
  converted_at: string | null;
  created_by_id: string | null;
  updated_by_id: string | null;
  created_at: string;
  updated_at: string;
}

// View type with joined user names
export interface ProspectingTargetView extends ProspectingTarget {
  assigned_to_name: string | null;
  owner_name: string | null;
  researched_by_name: string | null;
}

// Form data for creating/updating a target
export interface ProspectingTargetFormData {
  company_name: string;
  website?: string;
  notes?: string;
  source?: string;
  priority?: number;
  target_date?: string;
  assigned_to?: string;
}

// Status configuration for UI display
export const PROSPECTING_STATUS_CONFIG: Record<ProspectingTargetStatus, {
  label: string;
  color: string;
  bgColor: string;
  description: string;
}> = {
  needs_research: {
    label: 'Needs Research',
    color: 'text-orange-700',
    bgColor: 'bg-orange-100',
    description: 'Waiting for research'
  },
  researching: {
    label: 'Researching',
    color: 'text-blue-700',
    bgColor: 'bg-blue-100',
    description: 'Being researched'
  },
  ready: {
    label: 'Ready to Call',
    color: 'text-green-700',
    bgColor: 'bg-green-100',
    description: 'Research complete, ready for outreach'
  },
  calling: {
    label: 'Calling',
    color: 'text-purple-700',
    bgColor: 'bg-purple-100',
    description: 'Actively being contacted'
  },
  converted: {
    label: 'Converted',
    color: 'text-emerald-700',
    bgColor: 'bg-emerald-100',
    description: 'Became a contact/opportunity'
  },
  disqualified: {
    label: 'Disqualified',
    color: 'text-gray-500',
    bgColor: 'bg-gray-100',
    description: 'Not a fit'
  }
};

// Priority configuration
export const PRIORITY_CONFIG: Record<number, {
  label: string;
  color: string;
}> = {
  1: { label: 'Hot', color: 'text-red-600' },
  2: { label: 'High', color: 'text-orange-500' },
  3: { label: 'Medium', color: 'text-yellow-500' },
  4: { label: 'Low', color: 'text-blue-500' },
  5: { label: 'Cold', color: 'text-gray-400' }
};

// Common sources for targets
export const COMMON_SOURCES = [
  'LinkedIn',
  'Trade Show',
  'Referral',
  'Cold List',
  'Website',
  'Conference',
  'Networking Event',
  'Industry Publication',
  'Other'
];
