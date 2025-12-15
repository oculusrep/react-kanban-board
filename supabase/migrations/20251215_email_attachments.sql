-- Email Attachments Metadata Table
-- Stores attachment metadata from Gmail for display purposes
-- Actual attachment content remains in Gmail and can be fetched on-demand

CREATE TABLE IF NOT EXISTS email_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
  gmail_attachment_id TEXT NOT NULL,  -- Gmail's attachment ID for on-demand fetching
  filename TEXT NOT NULL,
  mime_type TEXT,
  size_bytes INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Prevent duplicate attachments for same email
  UNIQUE(email_id, gmail_attachment_id)
);

-- Index for efficient lookup by email
CREATE INDEX IF NOT EXISTS idx_email_attachments_email_id ON email_attachments(email_id);

-- Enable RLS
ALTER TABLE email_attachments ENABLE ROW LEVEL SECURITY;

-- RLS Policies - same access as emails table
CREATE POLICY "Users can view email attachments"
ON email_attachments FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Service role can insert email attachments"
ON email_attachments FOR INSERT
TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update email attachments"
ON email_attachments FOR UPDATE
TO service_role
USING (true);

CREATE POLICY "Service role can delete email attachments"
ON email_attachments FOR DELETE
TO service_role
USING (true);

-- Add comment
COMMENT ON TABLE email_attachments IS 'Stores attachment metadata from synced Gmail emails. Actual content fetched on-demand from Gmail API.';
COMMENT ON COLUMN email_attachments.gmail_attachment_id IS 'Gmail attachment ID used to fetch content via Gmail API';
COMMENT ON COLUMN email_attachments.size_bytes IS 'File size in bytes as reported by Gmail';
