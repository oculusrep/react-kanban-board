-- Migration: Hunter Agent Tables
-- Description: Creates all tables needed for the Hunter autonomous prospecting agent
-- Date: 2025-12-16

-- ============================================================================
-- hunter_source: Tracks configured data sources and their authentication status
-- ============================================================================
CREATE TABLE IF NOT EXISTS hunter_source (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source identification
  name TEXT NOT NULL,                    -- "Nation's Restaurant News"
  slug TEXT NOT NULL UNIQUE,             -- "nrn"
  source_type TEXT NOT NULL CHECK (source_type IN ('website', 'rss', 'podcast')),
  base_url TEXT NOT NULL,                -- "https://nrn.com"

  -- Authentication
  requires_auth BOOLEAN DEFAULT false,
  auth_type TEXT CHECK (auth_type IN ('form_login', 'api_key', NULL)),
  login_url TEXT,

  -- Scraping configuration (Playwright selectors, RSS URLs, etc.)
  scrape_config JSONB,

  -- Status
  is_active BOOLEAN DEFAULT true,
  last_scraped_at TIMESTAMPTZ,
  last_error TEXT,
  consecutive_failures INTEGER DEFAULT 0,

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Initial sources
INSERT INTO hunter_source (name, slug, source_type, base_url, requires_auth, auth_type, login_url, scrape_config) VALUES
('Nation''s Restaurant News', 'nrn', 'website', 'https://www.nrn.com', true, 'form_login', 'https://www.nrn.com/user/login',
 '{"target_paths": ["/emerging-chains", "/growth"], "article_selector": "article", "title_selector": "h1", "body_selector": ".article-body"}'::jsonb),
('QSR Magazine', 'qsr', 'website', 'https://www.qsrmagazine.com', true, 'form_login', 'https://www.qsrmagazine.com/login',
 '{"target_paths": ["/growth", "/franchising"], "article_selector": "article", "title_selector": "h1", "body_selector": ".article-content"}'::jsonb),
('Franchise Times', 'franchise-times', 'website', 'https://www.franchisetimes.com', false, null, null,
 '{"target_paths": ["/news", "/franchise-development"], "article_selector": "article", "title_selector": "h1", "body_selector": ".entry-content"}'::jsonb),
('Atlanta Business Chronicle', 'bizjournals-atl', 'website', 'https://www.bizjournals.com/atlanta', true, 'form_login', 'https://www.bizjournals.com/atlanta/login',
 '{"target_paths": ["/news/retail", "/news/restaurant"], "article_selector": "article", "title_selector": "h1", "body_selector": ".content"}'::jsonb),
('Restaurant Unstoppable', 'restaurant-unstoppable', 'podcast', 'https://restaurantunstoppable.libsyn.com', false, null, null,
 '{"rss_url": "https://restaurantunstoppable.libsyn.com/rss", "transcribe_keywords": ["expansion", "growth", "southeast", "atlanta", "franchise"]}'::jsonb),
('Franchise Times Dealmakers', 'ft-dealmakers', 'podcast', 'https://www.franchisetimes.com', false, null, null,
 '{"rss_url": null, "transcribe_keywords": ["expansion", "growth", "development", "real estate"]}'::jsonb)
ON CONFLICT (slug) DO NOTHING;

-- ============================================================================
-- hunter_signal: Raw observations from sources (articles, podcast episodes)
-- ============================================================================
CREATE TABLE IF NOT EXISTS hunter_signal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Source reference
  source_id UUID REFERENCES hunter_source(id) ON DELETE SET NULL,
  source_url TEXT NOT NULL,              -- Full URL to the article/episode
  source_title TEXT,                     -- Article/episode title
  source_published_at TIMESTAMPTZ,       -- When the source was published

  -- Content
  content_type TEXT NOT NULL CHECK (content_type IN ('article', 'podcast_metadata', 'podcast_transcript')),
  raw_content TEXT,                      -- The scraped text content
  content_hash TEXT,                     -- For deduplication

  -- Processing status
  is_processed BOOLEAN DEFAULT false,
  processed_at TIMESTAMPTZ,

  -- Metadata
  scraped_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hunter_signal_content_hash ON hunter_signal(content_hash);
CREATE INDEX IF NOT EXISTS idx_hunter_signal_source_id ON hunter_signal(source_id);
CREATE INDEX IF NOT EXISTS idx_hunter_signal_is_processed ON hunter_signal(is_processed);
CREATE INDEX IF NOT EXISTS idx_hunter_signal_scraped_at ON hunter_signal(scraped_at);

-- ============================================================================
-- hunter_lead: Deduplicated company/concept entities with scoring
-- ============================================================================
CREATE TABLE IF NOT EXISTS hunter_lead (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Company identification
  concept_name TEXT NOT NULL,            -- "Wow Wow Hawaiian Lemonade"
  normalized_name TEXT NOT NULL,         -- Lowercase, no punctuation for matching
  website TEXT,

  -- Classification
  industry_segment TEXT,                 -- 'QSR', 'Fast Casual', 'Retail', etc.

  -- Scoring
  signal_strength TEXT NOT NULL CHECK (signal_strength IN ('HOT', 'WARM+', 'WARM', 'COOL')),
  score_reasoning TEXT,                  -- AI explanation of the score

  -- Geography
  target_geography TEXT[],               -- ['Atlanta', 'Georgia', 'Southeast']
  geo_relevance TEXT CHECK (geo_relevance IN ('primary', 'secondary', 'national', 'other')),

  -- Key contacts discovered
  key_person_name TEXT,
  key_person_title TEXT,

  -- Status
  status TEXT DEFAULT 'new' CHECK (status IN ('new', 'enriching', 'ready', 'outreach_drafted', 'contacted', 'converted', 'dismissed', 'watching')),

  -- OVIS links (if exists in our system)
  existing_contact_id UUID REFERENCES contact(id) ON DELETE SET NULL,
  existing_client_id UUID REFERENCES client(id) ON DELETE SET NULL,

  -- Rules/preferences
  news_only BOOLEAN DEFAULT false,       -- User marked "don't outreach, just news"

  -- Timestamps
  first_seen_at TIMESTAMPTZ DEFAULT NOW(),
  last_signal_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_hunter_lead_normalized_name ON hunter_lead(normalized_name);
CREATE INDEX IF NOT EXISTS idx_hunter_lead_status ON hunter_lead(status);
CREATE INDEX IF NOT EXISTS idx_hunter_lead_signal_strength ON hunter_lead(signal_strength);
CREATE INDEX IF NOT EXISTS idx_hunter_lead_existing_contact ON hunter_lead(existing_contact_id);
CREATE INDEX IF NOT EXISTS idx_hunter_lead_existing_client ON hunter_lead(existing_client_id);
CREATE INDEX IF NOT EXISTS idx_hunter_lead_last_signal ON hunter_lead(last_signal_at);

-- ============================================================================
-- hunter_lead_signal: Junction table linking leads to their source signals
-- ============================================================================
CREATE TABLE IF NOT EXISTS hunter_lead_signal (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES hunter_lead(id) ON DELETE CASCADE,
  signal_id UUID REFERENCES hunter_signal(id) ON DELETE CASCADE,

  -- What the AI extracted from this signal for this lead
  extracted_summary TEXT,                -- "Plans 50 locations in Southeast by 2026"
  mentioned_geography TEXT[],            -- ['Atlanta', 'Georgia']
  mentioned_person TEXT,                 -- "John Smith, VP of Real Estate"

  created_at TIMESTAMPTZ DEFAULT NOW(),

  UNIQUE(lead_id, signal_id)
);

CREATE INDEX IF NOT EXISTS idx_hunter_lead_signal_lead ON hunter_lead_signal(lead_id);
CREATE INDEX IF NOT EXISTS idx_hunter_lead_signal_signal ON hunter_lead_signal(signal_id);

-- ============================================================================
-- hunter_contact_enrichment: Contact info discovered through ICSC or other sources
-- ============================================================================
CREATE TABLE IF NOT EXISTS hunter_contact_enrichment (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES hunter_lead(id) ON DELETE CASCADE,

  -- Contact info
  person_name TEXT NOT NULL,
  title TEXT,
  email TEXT,
  phone TEXT,
  linkedin_url TEXT,

  -- Source of this enrichment
  enrichment_source TEXT NOT NULL CHECK (enrichment_source IN ('icsc', 'article', 'company_website', 'manual')),
  source_url TEXT,                       -- URL where we found this info

  -- Confidence
  confidence_score NUMERIC(3,2),         -- 0.00 - 1.00

  -- Status
  is_verified BOOLEAN DEFAULT false,     -- User confirmed this is correct
  is_primary BOOLEAN DEFAULT false,      -- Primary contact for outreach

  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hunter_contact_enrichment_lead ON hunter_contact_enrichment(lead_id);
CREATE INDEX IF NOT EXISTS idx_hunter_contact_enrichment_email ON hunter_contact_enrichment(email);

-- ============================================================================
-- hunter_outreach_draft: Drafted emails and voicemail scripts pending approval
-- ============================================================================
CREATE TABLE IF NOT EXISTS hunter_outreach_draft (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id UUID REFERENCES hunter_lead(id) ON DELETE CASCADE,
  enrichment_id UUID REFERENCES hunter_contact_enrichment(id) ON DELETE SET NULL,

  -- Outreach type
  outreach_type TEXT NOT NULL CHECK (outreach_type IN ('email', 'voicemail_script')),

  -- Target contact
  contact_name TEXT NOT NULL,
  contact_email TEXT,                    -- Required for email type
  contact_phone TEXT,                    -- Required for voicemail type

  -- Content
  subject TEXT,                          -- For emails
  body TEXT NOT NULL,                    -- Email body or voicemail script

  -- AI context
  ai_reasoning TEXT,                     -- Why Hunter drafted this
  signal_summary TEXT,                   -- The news/signal that triggered this
  source_url TEXT,                       -- Link to the source article/episode

  -- Status
  status TEXT DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'sent', 'rejected')),

  -- User modifications
  user_edited_subject TEXT,              -- If user modified
  user_edited_body TEXT,                 -- If user modified

  -- Sending
  sent_at TIMESTAMPTZ,
  sent_email_id UUID,                    -- Links to OVIS emails table if sent

  -- Timestamps
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hunter_outreach_draft_lead ON hunter_outreach_draft(lead_id);
CREATE INDEX IF NOT EXISTS idx_hunter_outreach_draft_status ON hunter_outreach_draft(status);
CREATE INDEX IF NOT EXISTS idx_hunter_outreach_draft_created ON hunter_outreach_draft(created_at);

-- ============================================================================
-- hunter_feedback: User feedback for learning/improvement
-- ============================================================================
CREATE TABLE IF NOT EXISTS hunter_feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was acted on
  lead_id UUID REFERENCES hunter_lead(id) ON DELETE SET NULL,
  outreach_draft_id UUID REFERENCES hunter_outreach_draft(id) ON DELETE SET NULL,
  signal_id UUID REFERENCES hunter_signal(id) ON DELETE SET NULL,

  -- Feedback type
  feedback_type TEXT NOT NULL CHECK (feedback_type IN (
    'lead_dismissed',
    'lead_converted',
    'lead_marked_watching',
    'outreach_approved',
    'outreach_rejected',
    'outreach_edited',
    'marked_news_only',
    'score_override',
    'contact_verified',
    'contact_rejected'
  )),

  -- Details
  original_value TEXT,                   -- What the AI produced
  corrected_value TEXT,                  -- What the user changed it to
  feedback_note TEXT,                    -- User explanation

  -- For learning (denormalized for easy querying)
  concept_name TEXT,
  sender_domain TEXT,                    -- If related to a contact

  created_by UUID REFERENCES "user"(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_hunter_feedback_lead ON hunter_feedback(lead_id);
CREATE INDEX IF NOT EXISTS idx_hunter_feedback_type ON hunter_feedback(feedback_type);
CREATE INDEX IF NOT EXISTS idx_hunter_feedback_concept ON hunter_feedback(concept_name);
CREATE INDEX IF NOT EXISTS idx_hunter_feedback_created ON hunter_feedback(created_at);

-- ============================================================================
-- hunter_run_log: Tracks each execution of the Hunter agent
-- ============================================================================
CREATE TABLE IF NOT EXISTS hunter_run_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Timing
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,

  -- Results
  status TEXT DEFAULT 'running' CHECK (status IN ('running', 'completed', 'failed')),

  -- Metrics
  sources_scraped INTEGER DEFAULT 0,
  signals_collected INTEGER DEFAULT 0,
  leads_created INTEGER DEFAULT 0,
  leads_updated INTEGER DEFAULT 0,
  contacts_enriched INTEGER DEFAULT 0,
  outreach_drafted INTEGER DEFAULT 0,

  -- Errors
  errors JSONB,                          -- Array of error objects

  -- Briefing
  briefing_sent_at TIMESTAMPTZ,
  briefing_email_id TEXT                 -- Resend message ID
);

CREATE INDEX IF NOT EXISTS idx_hunter_run_log_started ON hunter_run_log(started_at);
CREATE INDEX IF NOT EXISTS idx_hunter_run_log_status ON hunter_run_log(status);

-- ============================================================================
-- Views
-- ============================================================================

-- Dashboard view: Aggregated data for the main Hunter dashboard
CREATE OR REPLACE VIEW v_hunter_dashboard AS
SELECT
  hl.id,
  hl.concept_name,
  hl.industry_segment,
  hl.signal_strength,
  hl.target_geography,
  hl.geo_relevance,
  hl.status,
  hl.key_person_name,
  hl.key_person_title,
  hl.news_only,
  hl.first_seen_at,
  hl.last_signal_at,
  hl.website,

  -- Existing relationship
  hl.existing_contact_id,
  hl.existing_client_id,
  c.first_name || ' ' || c.last_name AS existing_contact_name,
  c.email AS existing_contact_email,
  cl.client_name AS existing_client_name,

  -- Signal count
  (SELECT COUNT(*) FROM hunter_lead_signal hls WHERE hls.lead_id = hl.id) AS signal_count,

  -- Latest signal info
  (SELECT hs.source_title
   FROM hunter_lead_signal hls
   JOIN hunter_signal hs ON hs.id = hls.signal_id
   WHERE hls.lead_id = hl.id
   ORDER BY hs.source_published_at DESC NULLS LAST
   LIMIT 1) AS latest_signal_title,

  (SELECT hs.source_url
   FROM hunter_lead_signal hls
   JOIN hunter_signal hs ON hs.id = hls.signal_id
   WHERE hls.lead_id = hl.id
   ORDER BY hs.source_published_at DESC NULLS LAST
   LIMIT 1) AS latest_signal_url,

  (SELECT hls.extracted_summary
   FROM hunter_lead_signal hls
   WHERE hls.lead_id = hl.id
   ORDER BY hls.created_at DESC
   LIMIT 1) AS latest_signal_summary,

  -- Enrichment status
  (SELECT COUNT(*) FROM hunter_contact_enrichment hce WHERE hce.lead_id = hl.id) AS contacts_found,

  -- Primary enriched contact
  (SELECT hce.person_name
   FROM hunter_contact_enrichment hce
   WHERE hce.lead_id = hl.id AND hce.is_primary = true
   LIMIT 1) AS primary_contact_name,

  (SELECT hce.email
   FROM hunter_contact_enrichment hce
   WHERE hce.lead_id = hl.id AND hce.is_primary = true
   LIMIT 1) AS primary_contact_email,

  -- Pending outreach count
  (SELECT COUNT(*) FROM hunter_outreach_draft hod WHERE hod.lead_id = hl.id AND hod.status = 'draft') AS pending_outreach

FROM hunter_lead hl
LEFT JOIN contact c ON c.id = hl.existing_contact_id
LEFT JOIN client cl ON cl.id = hl.existing_client_id
WHERE hl.status NOT IN ('dismissed')
ORDER BY
  CASE hl.signal_strength
    WHEN 'HOT' THEN 1
    WHEN 'WARM+' THEN 2
    WHEN 'WARM' THEN 3
    WHEN 'COOL' THEN 4
  END,
  hl.last_signal_at DESC;

-- Reconnect view: Existing contacts that appeared in signals
CREATE OR REPLACE VIEW v_hunter_reconnect AS
SELECT
  hl.id AS lead_id,
  hl.concept_name,
  hl.signal_strength,
  c.id AS contact_id,
  c.first_name || ' ' || c.last_name AS contact_name,
  c.email AS contact_email,
  c.phone AS contact_phone,
  c.mobile_phone AS contact_mobile,
  cl.id AS client_id,
  cl.client_name,

  -- Latest signal about them
  (SELECT hls.extracted_summary
   FROM hunter_lead_signal hls
   WHERE hls.lead_id = hl.id
   ORDER BY hls.created_at DESC
   LIMIT 1) AS latest_news,

  (SELECT hs.source_url
   FROM hunter_lead_signal hls
   JOIN hunter_signal hs ON hs.id = hls.signal_id
   WHERE hls.lead_id = hl.id
   ORDER BY hs.source_published_at DESC NULLS LAST
   LIMIT 1) AS source_url,

  (SELECT hs.source_title
   FROM hunter_lead_signal hls
   JOIN hunter_signal hs ON hs.id = hls.signal_id
   WHERE hls.lead_id = hl.id
   ORDER BY hs.source_published_at DESC NULLS LAST
   LIMIT 1) AS source_title,

  hl.last_signal_at

FROM hunter_lead hl
JOIN contact c ON c.id = hl.existing_contact_id
LEFT JOIN client cl ON cl.id = c.client_id
WHERE hl.existing_contact_id IS NOT NULL
  AND hl.status NOT IN ('dismissed', 'contacted')
ORDER BY hl.last_signal_at DESC;

-- Outreach queue view: Drafts ready for review
CREATE OR REPLACE VIEW v_hunter_outreach_queue AS
SELECT
  hod.id,
  hod.outreach_type,
  hod.contact_name,
  hod.contact_email,
  hod.contact_phone,
  hod.subject,
  hod.body,
  hod.status,
  hod.ai_reasoning,
  hod.signal_summary,
  hod.source_url,
  hod.created_at,

  -- Lead info
  hl.id AS lead_id,
  hl.concept_name,
  hl.signal_strength,
  hl.industry_segment

FROM hunter_outreach_draft hod
JOIN hunter_lead hl ON hl.id = hod.lead_id
WHERE hod.status = 'draft'
ORDER BY
  CASE hl.signal_strength
    WHEN 'HOT' THEN 1
    WHEN 'WARM+' THEN 2
    WHEN 'WARM' THEN 3
    WHEN 'COOL' THEN 4
  END,
  hod.created_at DESC;

-- ============================================================================
-- Row Level Security
-- ============================================================================

ALTER TABLE hunter_source ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunter_signal ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunter_lead ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunter_lead_signal ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunter_contact_enrichment ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunter_outreach_draft ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunter_feedback ENABLE ROW LEVEL SECURITY;
ALTER TABLE hunter_run_log ENABLE ROW LEVEL SECURITY;

-- Policies: Allow all authenticated users full access (same pattern as prospecting_target)
CREATE POLICY "hunter_source_select" ON hunter_source FOR SELECT TO authenticated USING (true);
CREATE POLICY "hunter_source_insert" ON hunter_source FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "hunter_source_update" ON hunter_source FOR UPDATE TO authenticated USING (true);
CREATE POLICY "hunter_source_delete" ON hunter_source FOR DELETE TO authenticated USING (true);

CREATE POLICY "hunter_signal_select" ON hunter_signal FOR SELECT TO authenticated USING (true);
CREATE POLICY "hunter_signal_insert" ON hunter_signal FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "hunter_signal_update" ON hunter_signal FOR UPDATE TO authenticated USING (true);
CREATE POLICY "hunter_signal_delete" ON hunter_signal FOR DELETE TO authenticated USING (true);

CREATE POLICY "hunter_lead_select" ON hunter_lead FOR SELECT TO authenticated USING (true);
CREATE POLICY "hunter_lead_insert" ON hunter_lead FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "hunter_lead_update" ON hunter_lead FOR UPDATE TO authenticated USING (true);
CREATE POLICY "hunter_lead_delete" ON hunter_lead FOR DELETE TO authenticated USING (true);

CREATE POLICY "hunter_lead_signal_select" ON hunter_lead_signal FOR SELECT TO authenticated USING (true);
CREATE POLICY "hunter_lead_signal_insert" ON hunter_lead_signal FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "hunter_lead_signal_update" ON hunter_lead_signal FOR UPDATE TO authenticated USING (true);
CREATE POLICY "hunter_lead_signal_delete" ON hunter_lead_signal FOR DELETE TO authenticated USING (true);

CREATE POLICY "hunter_contact_enrichment_select" ON hunter_contact_enrichment FOR SELECT TO authenticated USING (true);
CREATE POLICY "hunter_contact_enrichment_insert" ON hunter_contact_enrichment FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "hunter_contact_enrichment_update" ON hunter_contact_enrichment FOR UPDATE TO authenticated USING (true);
CREATE POLICY "hunter_contact_enrichment_delete" ON hunter_contact_enrichment FOR DELETE TO authenticated USING (true);

CREATE POLICY "hunter_outreach_draft_select" ON hunter_outreach_draft FOR SELECT TO authenticated USING (true);
CREATE POLICY "hunter_outreach_draft_insert" ON hunter_outreach_draft FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "hunter_outreach_draft_update" ON hunter_outreach_draft FOR UPDATE TO authenticated USING (true);
CREATE POLICY "hunter_outreach_draft_delete" ON hunter_outreach_draft FOR DELETE TO authenticated USING (true);

CREATE POLICY "hunter_feedback_select" ON hunter_feedback FOR SELECT TO authenticated USING (true);
CREATE POLICY "hunter_feedback_insert" ON hunter_feedback FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "hunter_feedback_update" ON hunter_feedback FOR UPDATE TO authenticated USING (true);
CREATE POLICY "hunter_feedback_delete" ON hunter_feedback FOR DELETE TO authenticated USING (true);

CREATE POLICY "hunter_run_log_select" ON hunter_run_log FOR SELECT TO authenticated USING (true);
CREATE POLICY "hunter_run_log_insert" ON hunter_run_log FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "hunter_run_log_update" ON hunter_run_log FOR UPDATE TO authenticated USING (true);
CREATE POLICY "hunter_run_log_delete" ON hunter_run_log FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- Triggers for updated_at
-- ============================================================================

CREATE OR REPLACE FUNCTION update_hunter_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_hunter_source_updated_at
  BEFORE UPDATE ON hunter_source
  FOR EACH ROW EXECUTE FUNCTION update_hunter_updated_at();

CREATE TRIGGER trigger_hunter_lead_updated_at
  BEFORE UPDATE ON hunter_lead
  FOR EACH ROW EXECUTE FUNCTION update_hunter_updated_at();

CREATE TRIGGER trigger_hunter_contact_enrichment_updated_at
  BEFORE UPDATE ON hunter_contact_enrichment
  FOR EACH ROW EXECUTE FUNCTION update_hunter_updated_at();

CREATE TRIGGER trigger_hunter_outreach_draft_updated_at
  BEFORE UPDATE ON hunter_outreach_draft
  FOR EACH ROW EXECUTE FUNCTION update_hunter_updated_at();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON TABLE hunter_source IS 'Configured data sources for the Hunter agent (news sites, podcasts, RSS feeds)';
COMMENT ON TABLE hunter_signal IS 'Raw observations scraped from sources - articles, podcast episodes, etc.';
COMMENT ON TABLE hunter_lead IS 'Deduplicated company/concept entities with expansion signals and scoring';
COMMENT ON TABLE hunter_lead_signal IS 'Junction table linking leads to the signals where they were mentioned';
COMMENT ON TABLE hunter_contact_enrichment IS 'Contact information discovered for leads via ICSC, articles, or manual entry';
COMMENT ON TABLE hunter_outreach_draft IS 'AI-drafted emails and voicemail scripts pending user approval';
COMMENT ON TABLE hunter_feedback IS 'User feedback on Hunter decisions for active learning';
COMMENT ON TABLE hunter_run_log IS 'Execution log for Hunter agent runs with metrics and errors';
