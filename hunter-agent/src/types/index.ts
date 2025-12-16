// ============================================================================
// Source Types
// ============================================================================

export interface HunterSource {
  id: string;
  name: string;
  slug: string;
  source_type: 'website' | 'rss' | 'podcast';
  base_url: string;
  requires_auth: boolean;
  auth_type: 'form_login' | 'api_key' | null;
  login_url: string | null;
  scrape_config: Record<string, unknown> | null;
  is_active: boolean;
  last_scraped_at: string | null;
  last_error: string | null;
  consecutive_failures: number;
  created_at: string;
  updated_at: string;
}

// ============================================================================
// Signal Types
// ============================================================================

export interface HunterSignal {
  id?: string;
  source_id: string;
  source_url: string;
  source_title: string | null;
  source_published_at: Date | string | null;
  content_type: 'article' | 'podcast_metadata' | 'podcast_transcript';
  raw_content: string | null;
  content_hash: string;
  is_processed?: boolean;
  processed_at?: string | null;
  scraped_at?: string;
  created_at?: string;
}

// ============================================================================
// Lead Types
// ============================================================================

export type SignalStrength = 'HOT' | 'WARM+' | 'WARM' | 'COOL';
export type GeoRelevance = 'primary' | 'secondary' | 'national' | 'other';
export type LeadStatus = 'new' | 'enriching' | 'ready' | 'outreach_drafted' | 'contacted' | 'converted' | 'dismissed' | 'watching';

export interface HunterLead {
  id?: string;
  concept_name: string;
  normalized_name: string;
  website: string | null;
  industry_segment: string | null;
  signal_strength: SignalStrength;
  score_reasoning: string | null;
  target_geography: string[] | null;
  geo_relevance: GeoRelevance | null;
  key_person_name: string | null;
  key_person_title: string | null;
  status: LeadStatus;
  existing_contact_id: string | null;
  existing_client_id: string | null;
  news_only: boolean;
  first_seen_at?: string;
  last_signal_at?: string;
  created_at?: string;
  updated_at?: string;
}

export interface HunterLeadSignal {
  id?: string;
  lead_id: string;
  signal_id: string;
  extracted_summary: string | null;
  mentioned_geography: string[] | null;
  mentioned_person: string | null;
  created_at?: string;
}

// ============================================================================
// Contact Enrichment Types
// ============================================================================

export type EnrichmentSource = 'icsc' | 'article' | 'company_website' | 'manual';

export interface HunterContactEnrichment {
  id?: string;
  lead_id: string;
  person_name: string;
  title: string | null;
  email: string | null;
  phone: string | null;
  linkedin_url: string | null;
  enrichment_source: EnrichmentSource;
  source_url: string | null;
  confidence_score: number | null;
  is_verified: boolean;
  is_primary: boolean;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// Outreach Types
// ============================================================================

export type OutreachType = 'email' | 'voicemail_script';
export type OutreachStatus = 'draft' | 'approved' | 'sent' | 'rejected';

export interface HunterOutreachDraft {
  id?: string;
  lead_id: string;
  enrichment_id: string | null;
  outreach_type: OutreachType;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  subject: string | null;
  body: string;
  ai_reasoning: string | null;
  signal_summary: string | null;
  source_url: string | null;
  status: OutreachStatus;
  user_edited_subject: string | null;
  user_edited_body: string | null;
  sent_at: string | null;
  sent_email_id: string | null;
  created_at?: string;
  updated_at?: string;
}

// ============================================================================
// Feedback Types
// ============================================================================

export type FeedbackType =
  | 'lead_dismissed'
  | 'lead_converted'
  | 'lead_marked_watching'
  | 'outreach_approved'
  | 'outreach_rejected'
  | 'outreach_edited'
  | 'marked_news_only'
  | 'score_override'
  | 'contact_verified'
  | 'contact_rejected';

export interface HunterFeedback {
  id?: string;
  lead_id: string | null;
  outreach_draft_id: string | null;
  signal_id: string | null;
  feedback_type: FeedbackType;
  original_value: string | null;
  corrected_value: string | null;
  feedback_note: string | null;
  concept_name: string | null;
  sender_domain: string | null;
  created_by: string | null;
  created_at?: string;
}

// ============================================================================
// Run Log Types
// ============================================================================

export type RunStatus = 'running' | 'completed' | 'failed';

export interface HunterRunLog {
  id?: string;
  started_at?: string;
  completed_at: string | null;
  status: RunStatus;
  sources_scraped: number;
  signals_collected: number;
  leads_created: number;
  leads_updated: number;
  contacts_enriched: number;
  outreach_drafted: number;
  errors: RunError[] | null;
  briefing_sent_at: string | null;
  briefing_email_id: string | null;
}

export interface RunError {
  source?: string;
  module?: string;
  message: string;
  timestamp: string;
  stack?: string;
}

// ============================================================================
// Gemini/Analysis Types
// ============================================================================

export interface LeadExtraction {
  concept_name: string;
  industry_segment: string;
  signal_summary: string;
  mentioned_geography: string[];
  key_person_name?: string;
  key_person_title?: string;
  expansion_indicators: string[];
}

export interface ScoringResult {
  strength: SignalStrength;
  reasoning: string;
  geoRelevance: GeoRelevance;
}

// ============================================================================
// View Types (for dashboard)
// ============================================================================

export interface DashboardLead {
  id: string;
  concept_name: string;
  industry_segment: string | null;
  signal_strength: SignalStrength;
  target_geography: string[] | null;
  geo_relevance: GeoRelevance | null;
  status: LeadStatus;
  key_person_name: string | null;
  key_person_title: string | null;
  news_only: boolean;
  first_seen_at: string;
  last_signal_at: string;
  website: string | null;
  existing_contact_id: string | null;
  existing_client_id: string | null;
  existing_contact_name: string | null;
  existing_contact_email: string | null;
  existing_client_name: string | null;
  signal_count: number;
  latest_signal_title: string | null;
  latest_signal_url: string | null;
  latest_signal_summary: string | null;
  contacts_found: number;
  primary_contact_name: string | null;
  primary_contact_email: string | null;
  pending_outreach: number;
}

export interface ReconnectOpportunity {
  lead_id: string;
  concept_name: string;
  signal_strength: SignalStrength;
  contact_id: string;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  contact_mobile: string | null;
  client_id: string | null;
  client_name: string | null;
  latest_news: string | null;
  source_url: string | null;
  source_title: string | null;
  last_signal_at: string;
}

export interface OutreachQueueItem {
  id: string;
  outreach_type: OutreachType;
  contact_name: string;
  contact_email: string | null;
  contact_phone: string | null;
  subject: string | null;
  body: string;
  status: OutreachStatus;
  ai_reasoning: string | null;
  signal_summary: string | null;
  source_url: string | null;
  created_at: string;
  lead_id: string;
  concept_name: string;
  signal_strength: SignalStrength;
  industry_segment: string | null;
}
