-- Add hidden_from_timeline column to prospecting_activity table
-- This allows users to hide activities from the timeline view while keeping them in email history

ALTER TABLE prospecting_activity
ADD COLUMN IF NOT EXISTS hidden_from_timeline BOOLEAN DEFAULT FALSE;

-- Add index for efficient filtering
CREATE INDEX IF NOT EXISTS idx_prospecting_activity_hidden
ON prospecting_activity (hidden_from_timeline)
WHERE hidden_from_timeline = true;
