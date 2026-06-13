-- Add email tracking fields to site_submit table
-- This allows us to track when site submit emails were sent and by whom

ALTER TABLE site_submit
ADD COLUMN IF NOT EXISTS email_sent_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS email_sent_by_id UUID REFERENCES auth.users(id);

-- Add index for querying site submits by email sent date
CREATE INDEX IF NOT EXISTS idx_site_submit_email_sent_at ON site_submit(email_sent_at);

-- Add comment for documentation
COMMENT ON COLUMN site_submit.email_sent_at IS 'Timestamp when the site submit email was last sent to the client';
COMMENT ON COLUMN site_submit.email_sent_by_id IS 'User ID of who sent the site submit email';
