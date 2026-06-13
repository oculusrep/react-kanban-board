-- Migration: Hunter Gmail Outreach Fields
-- Description: Adds Gmail-related columns for tracking outreach emails sent via Gmail API
-- Date: 2025-12-17

-- Add Gmail tracking columns to hunter_outreach_draft
ALTER TABLE hunter_outreach_draft
ADD COLUMN IF NOT EXISTS gmail_message_id TEXT,
ADD COLUMN IF NOT EXISTS gmail_thread_id TEXT,
ADD COLUMN IF NOT EXISTS sent_by_user_email TEXT,
ADD COLUMN IF NOT EXISTS error_message TEXT;

-- Update the status check constraint to include 'failed'
ALTER TABLE hunter_outreach_draft DROP CONSTRAINT IF EXISTS hunter_outreach_draft_status_check;
ALTER TABLE hunter_outreach_draft ADD CONSTRAINT hunter_outreach_draft_status_check
  CHECK (status IN ('draft', 'approved', 'sent', 'rejected', 'failed'));

-- Create index for finding emails by Gmail IDs (for reply threading)
CREATE INDEX IF NOT EXISTS idx_hunter_outreach_draft_gmail_message ON hunter_outreach_draft(gmail_message_id);
CREATE INDEX IF NOT EXISTS idx_hunter_outreach_draft_gmail_thread ON hunter_outreach_draft(gmail_thread_id);

-- Comment on new columns
COMMENT ON COLUMN hunter_outreach_draft.gmail_message_id IS 'Gmail API message ID for sent emails - used for tracking replies';
COMMENT ON COLUMN hunter_outreach_draft.gmail_thread_id IS 'Gmail thread ID for grouping related emails';
COMMENT ON COLUMN hunter_outreach_draft.sent_by_user_email IS 'Email of the OVIS user who sent the outreach';
COMMENT ON COLUMN hunter_outreach_draft.error_message IS 'Error message if send failed';
