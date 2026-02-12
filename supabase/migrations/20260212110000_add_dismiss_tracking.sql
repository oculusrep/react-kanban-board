-- Migration: Add dismiss tracking to target table
-- Description: Adds columns and view for tracking dismissed/passed targets
-- Date: 2026-02-12

-- Add dismiss tracking columns
ALTER TABLE target ADD COLUMN IF NOT EXISTS dismiss_reason TEXT;
ALTER TABLE target ADD COLUMN IF NOT EXISTS dismiss_note TEXT;
ALTER TABLE target ADD COLUMN IF NOT EXISTS dismissed_at TIMESTAMPTZ;
ALTER TABLE target ADD COLUMN IF NOT EXISTS dismissed_by UUID REFERENCES auth.users(id);

-- Add indexes for dismissed targets queries
CREATE INDEX IF NOT EXISTS idx_target_dismissed ON target(dismissed_at) WHERE status = 'dismissed';
CREATE INDEX IF NOT EXISTS idx_target_dismiss_reason ON target(dismiss_reason) WHERE dismiss_reason IS NOT NULL;

-- Create dismissed targets view
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
