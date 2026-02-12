-- Migration: Add target_id to activity table
-- Description: Links activities to prospecting targets for tracking follow-ups
-- Date: 2026-02-12

-- Add target_id column to activity table
ALTER TABLE activity ADD COLUMN IF NOT EXISTS target_id UUID REFERENCES target(id) ON DELETE SET NULL;

-- Add index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_activity_target_id ON activity(target_id) WHERE target_id IS NOT NULL;

-- Add is_prospecting boolean for marking activities as prospecting tasks
-- This is more general than is_prospecting_call (which is specifically for calls)
ALTER TABLE activity ADD COLUMN IF NOT EXISTS is_prospecting BOOLEAN DEFAULT false;

-- Create index for prospecting activities queries
CREATE INDEX IF NOT EXISTS idx_activity_is_prospecting ON activity(is_prospecting) WHERE is_prospecting = true;

-- Comment for clarity
COMMENT ON COLUMN activity.target_id IS 'Links this activity to a Hunter target (prospecting company)';
COMMENT ON COLUMN activity.is_prospecting IS 'Marks this activity as a prospecting task for filtering in TodaysPlan';
