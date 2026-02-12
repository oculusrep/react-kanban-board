-- Migration: Rename hunter_lead to target
-- Description: Renames hunter_lead table to target for clearer terminology
--              (Targets = companies, Contacts linked to targets = leads/people)
-- Date: 2026-02-12

-- ============================================================================
-- Step 1: Drop views that depend on hunter_lead
-- ============================================================================

DROP VIEW IF EXISTS v_hunter_dashboard CASCADE;
DROP VIEW IF EXISTS v_hunter_reconnect CASCADE;
DROP VIEW IF EXISTS v_hunter_outreach_queue CASCADE;
DROP VIEW IF EXISTS v_prospecting_stale_leads CASCADE;

-- ============================================================================
-- Step 2: Drop dependent triggers
-- ============================================================================

DROP TRIGGER IF EXISTS trigger_hunter_lead_updated_at ON hunter_lead;
-- Drop the trigger from phase 1 migration (if it was applied)
DROP TRIGGER IF EXISTS trigger_activity_update_lead_contacted ON prospecting_activity;
-- Also drop using the function cascade (covers both cases)
DROP FUNCTION IF EXISTS update_lead_last_contacted() CASCADE;

-- ============================================================================
-- Step 3: Drop RLS policies on hunter_lead
-- ============================================================================

DROP POLICY IF EXISTS "hunter_lead_select" ON hunter_lead;
DROP POLICY IF EXISTS "hunter_lead_insert" ON hunter_lead;
DROP POLICY IF EXISTS "hunter_lead_update" ON hunter_lead;
DROP POLICY IF EXISTS "hunter_lead_delete" ON hunter_lead;

-- Drop RLS policies on hunter_lead_signal
DROP POLICY IF EXISTS "hunter_lead_signal_select" ON hunter_lead_signal;
DROP POLICY IF EXISTS "hunter_lead_signal_insert" ON hunter_lead_signal;
DROP POLICY IF EXISTS "hunter_lead_signal_update" ON hunter_lead_signal;
DROP POLICY IF EXISTS "hunter_lead_signal_delete" ON hunter_lead_signal;

-- ============================================================================
-- Step 4: Rename hunter_lead table to target
-- ============================================================================

ALTER TABLE hunter_lead RENAME TO target;

-- ============================================================================
-- Step 5: Rename hunter_lead_signal to target_signal
-- ============================================================================

ALTER TABLE hunter_lead_signal RENAME TO target_signal;
ALTER TABLE target_signal RENAME COLUMN lead_id TO target_id;

-- ============================================================================
-- Step 6: Add source column to target
-- ============================================================================

ALTER TABLE target ADD COLUMN IF NOT EXISTS source TEXT DEFAULT 'hunter'
  CHECK (source IN ('hunter', 'manual', 'referral'));

-- Update existing rows to have 'hunter' as source
UPDATE target SET source = 'hunter' WHERE source IS NULL;

-- Make source NOT NULL after backfill
ALTER TABLE target ALTER COLUMN source SET NOT NULL;

-- ============================================================================
-- Step 6b: Add dismiss tracking columns to target
-- ============================================================================

ALTER TABLE target ADD COLUMN IF NOT EXISTS dismiss_reason TEXT;
ALTER TABLE target ADD COLUMN IF NOT EXISTS dismiss_note TEXT;
ALTER TABLE target ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;
ALTER TABLE target ADD COLUMN IF NOT EXISTS dismissed_by UUID REFERENCES auth.users(id);

-- Add index for dismissed targets queries
CREATE INDEX IF NOT EXISTS idx_target_dismissed ON target(dismissed_at) WHERE status = 'dismissed';
CREATE INDEX IF NOT EXISTS idx_target_dismiss_reason ON target(dismiss_reason) WHERE dismiss_reason IS NOT NULL;

-- ============================================================================
-- Step 7: Rename FK column in contact table
-- ============================================================================

-- First drop the index
DROP INDEX IF EXISTS idx_contact_hunter_lead;

-- Rename the column
ALTER TABLE contact RENAME COLUMN hunter_lead_id TO target_id;

-- Recreate the index with new name
CREATE INDEX IF NOT EXISTS idx_contact_target ON contact(target_id);

-- Update the comment
COMMENT ON COLUMN contact.target_id IS 'Reference to target if this contact is linked to a prospecting target. Used for linking people to companies being pursued.';

-- ============================================================================
-- Step 8: Update FK references in other tables
-- ============================================================================

-- hunter_contact_enrichment
ALTER TABLE hunter_contact_enrichment RENAME COLUMN lead_id TO target_id;
DROP INDEX IF EXISTS idx_hunter_contact_enrichment_lead;
CREATE INDEX IF NOT EXISTS idx_hunter_contact_enrichment_target ON hunter_contact_enrichment(target_id);

-- hunter_outreach_draft
ALTER TABLE hunter_outreach_draft RENAME COLUMN lead_id TO target_id;
DROP INDEX IF EXISTS idx_hunter_outreach_draft_lead;
CREATE INDEX IF NOT EXISTS idx_hunter_outreach_draft_target ON hunter_outreach_draft(target_id);

-- hunter_feedback
ALTER TABLE hunter_feedback RENAME COLUMN lead_id TO target_id;
DROP INDEX IF EXISTS idx_hunter_feedback_lead;
CREATE INDEX IF NOT EXISTS idx_hunter_feedback_target ON hunter_feedback(target_id);

-- prospecting_activity
ALTER TABLE prospecting_activity RENAME COLUMN hunter_lead_id TO target_id;
DROP INDEX IF EXISTS idx_prospecting_activity_lead;
CREATE INDEX IF NOT EXISTS idx_prospecting_activity_target ON prospecting_activity(target_id);

-- Update constraint
ALTER TABLE prospecting_activity DROP CONSTRAINT IF EXISTS activity_has_target;
ALTER TABLE prospecting_activity ADD CONSTRAINT activity_has_target CHECK (
  target_id IS NOT NULL OR contact_id IS NOT NULL
);

-- prospecting_note
ALTER TABLE prospecting_note RENAME COLUMN hunter_lead_id TO target_id;
DROP INDEX IF EXISTS idx_prospecting_note_lead;
CREATE INDEX IF NOT EXISTS idx_prospecting_note_target ON prospecting_note(target_id);

-- Update constraint
ALTER TABLE prospecting_note DROP CONSTRAINT IF EXISTS note_has_target;
ALTER TABLE prospecting_note ADD CONSTRAINT note_has_target CHECK (
  target_id IS NOT NULL OR contact_id IS NOT NULL
);

-- ============================================================================
-- Step 9: Rename indexes on target table
-- ============================================================================

DROP INDEX IF EXISTS idx_hunter_lead_normalized_name;
DROP INDEX IF EXISTS idx_hunter_lead_status;
DROP INDEX IF EXISTS idx_hunter_lead_signal_strength;
DROP INDEX IF EXISTS idx_hunter_lead_existing_contact;
DROP INDEX IF EXISTS idx_hunter_lead_existing_client;
DROP INDEX IF EXISTS idx_hunter_lead_last_signal;
DROP INDEX IF EXISTS idx_hunter_lead_last_contacted;

CREATE UNIQUE INDEX IF NOT EXISTS idx_target_normalized_name ON target(normalized_name);
CREATE INDEX IF NOT EXISTS idx_target_status ON target(status);
CREATE INDEX IF NOT EXISTS idx_target_signal_strength ON target(signal_strength);
CREATE INDEX IF NOT EXISTS idx_target_existing_contact ON target(existing_contact_id);
CREATE INDEX IF NOT EXISTS idx_target_existing_client ON target(existing_client_id);
CREATE INDEX IF NOT EXISTS idx_target_last_signal ON target(last_signal_at);
CREATE INDEX IF NOT EXISTS idx_target_last_contacted ON target(last_contacted_at);
CREATE INDEX IF NOT EXISTS idx_target_source ON target(source);

-- Rename indexes on target_signal
DROP INDEX IF EXISTS idx_hunter_lead_signal_lead;
DROP INDEX IF EXISTS idx_hunter_lead_signal_signal;
CREATE INDEX IF NOT EXISTS idx_target_signal_target ON target_signal(target_id);
CREATE INDEX IF NOT EXISTS idx_target_signal_signal ON target_signal(signal_id);

-- ============================================================================
-- Step 10: Update status constraint with new statuses
-- ============================================================================

ALTER TABLE target DROP CONSTRAINT IF EXISTS hunter_lead_status_check;
ALTER TABLE target ADD CONSTRAINT target_status_check
  CHECK (status IN (
    -- Original statuses
    'new', 'enriching', 'ready', 'outreach_drafted', 'contacted', 'converted', 'dismissed', 'watching',
    -- New prospecting funnel statuses
    'researching', 'active', 'engaged', 'meeting_scheduled',
    -- Terminal statuses
    'already_represented', 'not_interested', 'dead', 'nurture'
  ));

-- ============================================================================
-- Step 11: Create RLS policies for target table
-- ============================================================================

ALTER TABLE target ENABLE ROW LEVEL SECURITY;

CREATE POLICY "target_select" ON target FOR SELECT TO authenticated USING (true);
CREATE POLICY "target_insert" ON target FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "target_update" ON target FOR UPDATE TO authenticated USING (true);
CREATE POLICY "target_delete" ON target FOR DELETE TO authenticated USING (true);

-- RLS for target_signal
ALTER TABLE target_signal ENABLE ROW LEVEL SECURITY;

CREATE POLICY "target_signal_select" ON target_signal FOR SELECT TO authenticated USING (true);
CREATE POLICY "target_signal_insert" ON target_signal FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY "target_signal_update" ON target_signal FOR UPDATE TO authenticated USING (true);
CREATE POLICY "target_signal_delete" ON target_signal FOR DELETE TO authenticated USING (true);

-- ============================================================================
-- Step 12: Recreate triggers
-- ============================================================================

CREATE TRIGGER trigger_target_updated_at
  BEFORE UPDATE ON target
  FOR EACH ROW EXECUTE FUNCTION update_hunter_updated_at();

-- Recreate the trigger to update last_contacted_at
CREATE OR REPLACE FUNCTION update_target_last_contacted()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.target_id IS NOT NULL THEN
    UPDATE target
    SET last_contacted_at = NEW.created_at
    WHERE id = NEW.target_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_activity_update_target_contacted
  AFTER INSERT ON prospecting_activity
  FOR EACH ROW EXECUTE FUNCTION update_target_last_contacted();

-- ============================================================================
-- Step 13: Recreate views with new table/column names
-- ============================================================================

-- Dashboard view for Hunter
CREATE OR REPLACE VIEW v_hunter_dashboard AS
SELECT
  t.id,
  t.concept_name,
  t.industry_segment,
  t.signal_strength,
  t.target_geography,
  t.geo_relevance,
  t.status,
  t.key_person_name,
  t.key_person_title,
  t.news_only,
  t.first_seen_at,
  t.last_signal_at,
  t.website,
  t.source,
  t.last_contacted_at,

  -- Existing relationship
  t.existing_contact_id,
  t.existing_client_id,
  c.first_name || ' ' || c.last_name AS existing_contact_name,
  c.email AS existing_contact_email,
  cl.client_name AS existing_client_name,

  -- Signal count
  (SELECT COUNT(*) FROM target_signal ts WHERE ts.target_id = t.id) AS signal_count,

  -- Latest signal info
  (SELECT hs.source_title
   FROM target_signal ts
   JOIN hunter_signal hs ON hs.id = ts.signal_id
   WHERE ts.target_id = t.id
   ORDER BY hs.source_published_at DESC NULLS LAST
   LIMIT 1) AS latest_signal_title,

  (SELECT hs.source_url
   FROM target_signal ts
   JOIN hunter_signal hs ON hs.id = ts.signal_id
   WHERE ts.target_id = t.id
   ORDER BY hs.source_published_at DESC NULLS LAST
   LIMIT 1) AS latest_signal_url,

  (SELECT ts.extracted_summary
   FROM target_signal ts
   WHERE ts.target_id = t.id
   ORDER BY ts.created_at DESC
   LIMIT 1) AS latest_signal_summary,

  -- Enrichment status
  (SELECT COUNT(*) FROM hunter_contact_enrichment hce WHERE hce.target_id = t.id) AS contacts_found,

  -- Primary enriched contact
  (SELECT hce.person_name
   FROM hunter_contact_enrichment hce
   WHERE hce.target_id = t.id AND hce.is_primary = true
   LIMIT 1) AS primary_contact_name,

  (SELECT hce.email
   FROM hunter_contact_enrichment hce
   WHERE hce.target_id = t.id AND hce.is_primary = true
   LIMIT 1) AS primary_contact_email,

  -- Pending outreach count
  (SELECT COUNT(*) FROM hunter_outreach_draft hod WHERE hod.target_id = t.id AND hod.status = 'draft') AS pending_outreach,

  -- Linked contacts count
  (SELECT COUNT(*) FROM contact con WHERE con.target_id = t.id) AS linked_contacts_count

FROM target t
LEFT JOIN contact c ON c.id = t.existing_contact_id
LEFT JOIN client cl ON cl.id = t.existing_client_id
WHERE t.status NOT IN ('dismissed')
ORDER BY
  CASE t.signal_strength
    WHEN 'HOT' THEN 1
    WHEN 'WARM+' THEN 2
    WHEN 'WARM' THEN 3
    WHEN 'COOL' THEN 4
  END,
  t.last_signal_at DESC;

-- Reconnect view: Existing contacts that appeared in signals
CREATE OR REPLACE VIEW v_hunter_reconnect AS
SELECT
  t.id AS target_id,
  t.concept_name,
  t.signal_strength,
  c.id AS contact_id,
  c.first_name || ' ' || c.last_name AS contact_name,
  c.email AS contact_email,
  c.phone AS contact_phone,
  c.mobile_phone AS contact_mobile,
  cl.id AS client_id,
  cl.client_name,

  -- Latest signal about them
  (SELECT ts.extracted_summary
   FROM target_signal ts
   WHERE ts.target_id = t.id
   ORDER BY ts.created_at DESC
   LIMIT 1) AS latest_news,

  (SELECT hs.source_url
   FROM target_signal ts
   JOIN hunter_signal hs ON hs.id = ts.signal_id
   WHERE ts.target_id = t.id
   ORDER BY hs.source_published_at DESC NULLS LAST
   LIMIT 1) AS source_url,

  (SELECT hs.source_title
   FROM target_signal ts
   JOIN hunter_signal hs ON hs.id = ts.signal_id
   WHERE ts.target_id = t.id
   ORDER BY hs.source_published_at DESC NULLS LAST
   LIMIT 1) AS source_title,

  t.last_signal_at

FROM target t
JOIN contact c ON c.id = t.existing_contact_id
LEFT JOIN client cl ON cl.id = c.client_id
WHERE t.existing_contact_id IS NOT NULL
  AND t.status NOT IN ('dismissed', 'contacted')
ORDER BY t.last_signal_at DESC;

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

  -- Target info
  t.id AS target_id,
  t.concept_name,
  t.signal_strength,
  t.industry_segment

FROM hunter_outreach_draft hod
JOIN target t ON t.id = hod.target_id
WHERE hod.status = 'draft'
ORDER BY
  CASE t.signal_strength
    WHEN 'HOT' THEN 1
    WHEN 'WARM+' THEN 2
    WHEN 'WARM' THEN 3
    WHEN 'COOL' THEN 4
  END,
  hod.created_at DESC;

-- Stale targets view (not contacted in X days)
CREATE OR REPLACE VIEW v_prospecting_stale_targets AS
SELECT
  t.*,
  COALESCE(t.last_contacted_at, t.created_at) as effective_last_contact,
  EXTRACT(DAY FROM NOW() - COALESCE(t.last_contacted_at, t.created_at))::integer as days_since_contact
FROM target t
WHERE t.status IN ('new', 'researching', 'active', 'engaged', 'nurture')
  AND COALESCE(t.last_contacted_at, t.created_at) < NOW() - INTERVAL '45 days'
ORDER BY COALESCE(t.last_contacted_at, t.created_at) ASC;

-- ============================================================================
-- Step 14: Update weekly metrics view
-- ============================================================================

CREATE OR REPLACE VIEW v_prospecting_weekly_metrics AS
WITH week_bounds AS (
  SELECT
    date_trunc('week', CURRENT_DATE)::date AS week_start,
    (date_trunc('week', CURRENT_DATE) + interval '6 days')::date AS week_end
),
activity_counts AS (
  SELECT
    activity_type,
    COUNT(*) as count
  FROM prospecting_activity pa, week_bounds wb
  WHERE pa.created_at >= wb.week_start
    AND pa.created_at < wb.week_end + interval '1 day'
  GROUP BY activity_type
),
total_time AS (
  SELECT
    COALESCE(SUM(minutes), 0) as total_minutes
  FROM prospecting_time_entry pte, week_bounds wb
  WHERE pte.entry_date >= wb.week_start
    AND pte.entry_date <= wb.week_end
),
funnel_counts AS (
  SELECT
    status,
    COUNT(*) as count
  FROM target
  WHERE status NOT IN ('dismissed', 'dead', 'not_interested', 'already_represented')
  GROUP BY status
)
SELECT
  wb.week_start,
  wb.week_end,

  -- Activity counts
  COALESCE((SELECT count FROM activity_counts WHERE activity_type = 'email'), 0) as emails_sent,
  COALESCE((SELECT count FROM activity_counts WHERE activity_type = 'linkedin'), 0) as linkedin_messages,
  COALESCE((SELECT count FROM activity_counts WHERE activity_type = 'sms'), 0) as sms_sent,
  COALESCE((SELECT count FROM activity_counts WHERE activity_type = 'voicemail'), 0) as voicemails_left,
  COALESCE((SELECT count FROM activity_counts WHERE activity_type = 'call'), 0) as calls_completed,
  COALESCE((SELECT count FROM activity_counts WHERE activity_type = 'meeting'), 0) as meetings_held,

  -- Total touches
  (SELECT COALESCE(SUM(count), 0) FROM activity_counts) as total_touches,

  -- Time tracking
  (SELECT total_minutes FROM total_time) as time_minutes,

  -- Funnel counts
  COALESCE((SELECT count FROM funnel_counts WHERE status = 'new'), 0) as funnel_new,
  COALESCE((SELECT count FROM funnel_counts WHERE status = 'researching'), 0) as funnel_researching,
  COALESCE((SELECT count FROM funnel_counts WHERE status = 'active'), 0) as funnel_active,
  COALESCE((SELECT count FROM funnel_counts WHERE status = 'engaged'), 0) as funnel_engaged,
  COALESCE((SELECT count FROM funnel_counts WHERE status = 'meeting_scheduled'), 0) as funnel_meeting_scheduled,
  COALESCE((SELECT count FROM funnel_counts WHERE status = 'converted'), 0) as funnel_converted,
  COALESCE((SELECT count FROM funnel_counts WHERE status = 'nurture'), 0) as funnel_nurture

FROM week_bounds wb;

-- ============================================================================
-- Step 15: Update prospecting streak function
-- ============================================================================

-- No changes needed - it only uses prospecting_time_entry and prospecting_vacation_day

-- ============================================================================
-- Step 16: Update comments
-- ============================================================================

COMMENT ON TABLE target IS 'Prospecting targets - companies/concepts being pursued. Source can be hunter (scraped), manual, or referral.';
COMMENT ON TABLE target_signal IS 'Junction table linking targets to the signals where they were mentioned';
COMMENT ON COLUMN target.source IS 'Origin of the target: hunter (scraped from news), manual (user-created), or referral';

-- ============================================================================
-- Step 17: Create view for dismissed targets
-- ============================================================================

CREATE OR REPLACE VIEW v_dismissed_targets AS
SELECT
  t.id,
  t.concept_name,
  t.industry_segment,
  t.signal_strength,
  t.target_geography,
  t.website,
  t.dismiss_reason,
  t.dismiss_note,
  t.dismissed_at,
  t.dismissed_by,
  t.first_seen_at,
  t.last_signal_at,
  t.source,

  -- Dismisser info
  (SELECT email FROM auth.users WHERE id = t.dismissed_by) AS dismissed_by_email,

  -- Signal count
  (SELECT COUNT(*) FROM target_signal ts WHERE ts.target_id = t.id) AS signal_count,

  -- Linked contacts count
  (SELECT COUNT(*) FROM contact con WHERE con.target_id = t.id) AS linked_contacts_count

FROM target t
WHERE t.status = 'dismissed'
ORDER BY t.dismissed_at DESC;

-- ============================================================================
-- Drop old function if it exists
-- ============================================================================
DROP FUNCTION IF EXISTS update_lead_last_contacted() CASCADE;
