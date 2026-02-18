-- Migration: Create Daily Prospecting Metrics View
-- Description: Aggregated daily metrics for the Master Prospecting Scorecard
-- Date: 2026-02-17

-- ============================================================================
-- 1. Add response types to prospecting_activity table
-- ============================================================================

-- Drop the existing constraint and add new one with response types
ALTER TABLE prospecting_activity DROP CONSTRAINT IF EXISTS prospecting_activity_activity_type_check;

ALTER TABLE prospecting_activity ADD CONSTRAINT prospecting_activity_activity_type_check
  CHECK (activity_type IN (
    -- Outreach types (outbound)
    'email',              -- Email sent
    'linkedin',           -- LinkedIn message sent
    'sms',                -- SMS text message sent
    'voicemail',          -- Left voicemail
    'call',               -- Call completed (reached them)
    'meeting',            -- Meeting held
    -- Response types (inbound engagement)
    'email_response',     -- They replied to an email
    'linkedin_response',  -- They replied on LinkedIn
    'sms_response',       -- They replied via SMS
    'return_call'         -- They called back
  ));

-- Add activity_date column for backdating responses
-- This allows logging a response with the actual date it occurred
ALTER TABLE prospecting_activity ADD COLUMN IF NOT EXISTS activity_date DATE;

-- Set default for activity_date based on created_at for existing records
UPDATE prospecting_activity
SET activity_date = DATE(created_at)
WHERE activity_date IS NULL;

-- Add index for date-based queries
CREATE INDEX IF NOT EXISTS idx_prospecting_activity_date ON prospecting_activity(activity_date);

-- ============================================================================
-- 2. Create Daily Metrics View
-- ============================================================================

-- This view aggregates daily activity counts for scorecard display
-- It pulls from BOTH prospecting_activity table AND activity table
-- (activity table uses activity_type_id FK and is_prospecting_call flag)

CREATE OR REPLACE VIEW v_prospecting_daily_metrics AS
WITH daily_prospecting_activities AS (
  -- Count activities from prospecting_activity table by day
  SELECT
    COALESCE(pa.activity_date, DATE(pa.created_at)) as activity_date,
    pa.created_by as user_id,
    -- Outreach counts
    COUNT(*) FILTER (WHERE pa.activity_type = 'email') as emails,
    COUNT(*) FILTER (WHERE pa.activity_type = 'linkedin') as linkedin,
    COUNT(*) FILTER (WHERE pa.activity_type = 'sms') as sms,
    COUNT(*) FILTER (WHERE pa.activity_type = 'voicemail') as voicemail,
    -- Connection counts (direct contact made)
    COUNT(*) FILTER (WHERE pa.activity_type = 'call') as calls,
    COUNT(*) FILTER (WHERE pa.activity_type = 'meeting') as meetings,
    -- Response counts (inbound engagement)
    COUNT(*) FILTER (WHERE pa.activity_type = 'email_response') as email_responses,
    COUNT(*) FILTER (WHERE pa.activity_type = 'linkedin_response') as linkedin_responses,
    COUNT(*) FILTER (WHERE pa.activity_type = 'sms_response') as sms_responses,
    COUNT(*) FILTER (WHERE pa.activity_type = 'return_call') as return_calls,
    -- Count unique contacts/leads touched
    COUNT(DISTINCT COALESCE(pa.contact_id::text, pa.target_id::text)) as contacts_touched
  FROM prospecting_activity pa
  GROUP BY COALESCE(pa.activity_date, DATE(pa.created_at)), pa.created_by
),
daily_activity_table AS (
  -- Count prospecting activities from activity table (legacy/alternative logging)
  -- Join activity_type table to get type names; use is_prospecting_call flag
  SELECT
    DATE(a.activity_date) as activity_date,
    a.user_id,
    -- Outreach counts based on activity_type name
    COUNT(*) FILTER (WHERE atype.name = 'Email' AND a.is_prospecting_call = true) as emails,
    COUNT(*) FILTER (WHERE atype.name = 'LinkedIn Message' AND a.is_prospecting_call = true) as linkedin,
    COUNT(*) FILTER (WHERE atype.name = 'SMS' AND a.is_prospecting_call = true) as sms,
    COUNT(*) FILTER (WHERE atype.name = 'Voicemail' AND a.is_prospecting_call = true) as voicemail,
    -- Connection counts
    COUNT(*) FILTER (WHERE atype.name = 'Call' AND a.is_prospecting_call = true AND a.completed_call = true) as calls,
    COUNT(*) FILTER (WHERE atype.name = 'Meeting' AND a.is_prospecting_call = true) as meetings,
    -- Responses aren't tracked in activity table, so zeros
    0::bigint as email_responses,
    0::bigint as linkedin_responses,
    0::bigint as sms_responses,
    0::bigint as return_calls,
    -- Count unique contacts touched
    COUNT(DISTINCT a.contact_id) FILTER (WHERE a.is_prospecting_call = true) as contacts_touched
  FROM activity a
  LEFT JOIN activity_type atype ON a.activity_type_id = atype.id
  WHERE a.is_prospecting_call = true
  GROUP BY DATE(a.activity_date), a.user_id
)
-- Combine both sources
SELECT
  COALESCE(pa.activity_date, dat.activity_date) as activity_date,
  COALESCE(pa.user_id, dat.user_id) as user_id,
  -- Outreach totals
  COALESCE(pa.emails, 0) + COALESCE(dat.emails, 0) as emails,
  COALESCE(pa.linkedin, 0) + COALESCE(dat.linkedin, 0) as linkedin,
  COALESCE(pa.sms, 0) + COALESCE(dat.sms, 0) as sms,
  COALESCE(pa.voicemail, 0) + COALESCE(dat.voicemail, 0) as voicemail,
  -- Connection totals
  COALESCE(pa.calls, 0) + COALESCE(dat.calls, 0) as calls,
  COALESCE(pa.meetings, 0) + COALESCE(dat.meetings, 0) as meetings,
  -- Response totals (only from prospecting_activity table)
  COALESCE(pa.email_responses, 0) as email_responses,
  COALESCE(pa.linkedin_responses, 0) as linkedin_responses,
  COALESCE(pa.sms_responses, 0) as sms_responses,
  COALESCE(pa.return_calls, 0) as return_calls,
  -- Calculated totals
  (COALESCE(pa.emails, 0) + COALESCE(dat.emails, 0) +
   COALESCE(pa.linkedin, 0) + COALESCE(dat.linkedin, 0) +
   COALESCE(pa.sms, 0) + COALESCE(dat.sms, 0) +
   COALESCE(pa.voicemail, 0) + COALESCE(dat.voicemail, 0)) as total_outreach,
  (COALESCE(pa.calls, 0) + COALESCE(dat.calls, 0) +
   COALESCE(pa.meetings, 0) + COALESCE(dat.meetings, 0) +
   COALESCE(pa.email_responses, 0) +
   COALESCE(pa.linkedin_responses, 0) +
   COALESCE(pa.sms_responses, 0) +
   COALESCE(pa.return_calls, 0)) as total_connections,
  -- Contacts touched
  COALESCE(pa.contacts_touched, 0) + COALESCE(dat.contacts_touched, 0) as contacts_touched
FROM daily_prospecting_activities pa
FULL OUTER JOIN daily_activity_table dat
  ON pa.activity_date = dat.activity_date AND pa.user_id = dat.user_id
WHERE COALESCE(pa.activity_date, dat.activity_date) IS NOT NULL;

-- ============================================================================
-- 3. Comments
-- ============================================================================

COMMENT ON VIEW v_prospecting_daily_metrics IS
  'Aggregated daily prospecting metrics combining prospecting_activity and activity tables. Used by Master Scorecard.';

COMMENT ON COLUMN prospecting_activity.activity_date IS
  'The date the activity occurred (allows backdating responses). Falls back to created_at date.';
