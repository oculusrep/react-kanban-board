-- Gmail + Gemini Email Integration Schema
-- Migration: 20241211_gmail_gemini_integration.sql

-- ============================================
-- 1. Gmail OAuth Connections (per-user)
-- ============================================
CREATE TABLE IF NOT EXISTS gmail_connection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    google_email VARCHAR(255) NOT NULL,
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ NOT NULL,
    last_history_id VARCHAR(50),  -- Gmail sync cursor
    last_sync_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    sync_error TEXT,              -- Last sync error message (if any)
    sync_error_at TIMESTAMPTZ,    -- When the error occurred
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id),
    UNIQUE(google_email)
);

-- ============================================
-- 2. Email Content (deduplicated storage)
-- ============================================
CREATE TABLE IF NOT EXISTS emails (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id VARCHAR(500) UNIQUE NOT NULL,  -- Gmail Message-ID header (can be long)
    gmail_id VARCHAR(50) NOT NULL,            -- Gmail's internal ID
    thread_id VARCHAR(50),                    -- Gmail Thread ID
    in_reply_to VARCHAR(500),                 -- Parent Message-ID
    references_header TEXT,                   -- Full conversation chain
    direction VARCHAR(10) NOT NULL,           -- 'INBOUND' or 'OUTBOUND'
    subject TEXT,
    body_text TEXT,                           -- Plain text body
    body_html TEXT,                           -- HTML body (optional)
    snippet TEXT,                             -- First 200 chars
    sender_email VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255),
    recipient_list JSONB,                     -- Array of {email, name, type: to/cc/bcc}
    received_at TIMESTAMPTZ NOT NULL,
    ai_processed BOOLEAN DEFAULT false,
    ai_processed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 3. Email Visibility (user-to-email links)
-- ============================================
CREATE TABLE IF NOT EXISTS email_visibility (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
    gmail_connection_id UUID REFERENCES gmail_connection(id) ON DELETE SET NULL,
    folder_label VARCHAR(50),                 -- 'INBOX' or 'SENT'
    is_read BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(email_id, user_id)
);

-- ============================================
-- 4. Email-to-CRM Object Links (many-to-many)
-- ============================================
CREATE TABLE IF NOT EXISTS email_object_link (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    object_type VARCHAR(50) NOT NULL,         -- 'contact', 'client', 'deal', 'property'
    object_id UUID NOT NULL,
    link_source VARCHAR(50) NOT NULL,         -- 'email_match', 'ai_tag', 'manual'
    confidence_score NUMERIC(3,2),            -- AI confidence (0.00-1.00)
    created_at TIMESTAMPTZ DEFAULT NOW(),
    created_by_user_id UUID REFERENCES "user"(id),
    UNIQUE(email_id, object_type, object_id)
);

-- ============================================
-- 5. AI Correction Logs (self-correcting feedback)
-- ============================================
CREATE TABLE IF NOT EXISTS ai_correction_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES "user"(id),
    email_id UUID REFERENCES emails(id) ON DELETE SET NULL,
    correction_type VARCHAR(50) NOT NULL,     -- 'removed_tag', 'added_tag', 'wrong_object'
    object_type VARCHAR(50),                  -- 'contact', 'client', 'deal', 'property'
    incorrect_object_id UUID,                 -- What AI suggested (if removing)
    correct_object_id UUID,                   -- What user selected (if adding)
    email_snippet TEXT,                       -- Context for learning
    sender_email VARCHAR(255),
    reasoning_hint TEXT,                      -- User's explanation (optional)
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 6. Unmatched Email Queue
-- ============================================
CREATE TABLE IF NOT EXISTS unmatched_email_queue (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email_id UUID NOT NULL REFERENCES emails(id) ON DELETE CASCADE,
    gmail_connection_id UUID REFERENCES gmail_connection(id) ON DELETE SET NULL,
    sender_email VARCHAR(255) NOT NULL,
    sender_name VARCHAR(255),
    subject TEXT,
    snippet TEXT,
    received_at TIMESTAMPTZ NOT NULL,
    -- AI-extracted suggestions
    suggested_contact_name VARCHAR(255),
    suggested_company VARCHAR(255),
    matched_object_type VARCHAR(50),          -- What CRM object was referenced
    matched_object_id UUID,
    matched_object_name VARCHAR(255),         -- For display
    match_reason TEXT,                        -- Why AI thinks this is relevant
    -- Review status
    status VARCHAR(20) DEFAULT 'pending',     -- 'pending', 'approved', 'dismissed'
    reviewed_by_user_id UUID REFERENCES "user"(id),
    reviewed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================
-- 7. Deal Synopsis Cache
-- ============================================
CREATE TABLE IF NOT EXISTS deal_synopsis (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    deal_id UUID NOT NULL REFERENCES deal(id) ON DELETE CASCADE,
    ball_in_court VARCHAR(100),               -- Who owes next action
    ball_in_court_type VARCHAR(50),           -- 'us', 'them', 'landlord', 'tenant', etc.
    status_summary TEXT,
    key_document_status TEXT,                 -- LOI, Lease status
    alert_level VARCHAR(10),                  -- 'green', 'yellow', 'red'
    alert_reason TEXT,
    last_activity_at TIMESTAMPTZ,
    days_since_activity INTEGER,
    stalled_threshold_days INTEGER DEFAULT 7,
    synopsis_json JSONB,                      -- Full AI response
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(deal_id)
);

-- ============================================
-- 8. Extend Activity Table for Emails
-- ============================================
ALTER TABLE activity ADD COLUMN IF NOT EXISTS email_id UUID REFERENCES emails(id);
ALTER TABLE activity ADD COLUMN IF NOT EXISTS direction VARCHAR(10);  -- 'INBOUND', 'OUTBOUND'

-- ============================================
-- 9. Add Email Activity Type
-- ============================================
INSERT INTO activity_type (id, name, icon, color, is_system)
VALUES (gen_random_uuid(), 'Email', 'envelope', 'blue', true)
ON CONFLICT (name) DO NOTHING;

-- ============================================
-- 10. Performance Indexes
-- ============================================

-- Emails table indexes
CREATE INDEX IF NOT EXISTS idx_emails_message_id ON emails(message_id);
CREATE INDEX IF NOT EXISTS idx_emails_gmail_id ON emails(gmail_id);
CREATE INDEX IF NOT EXISTS idx_emails_sender ON emails(sender_email);
CREATE INDEX IF NOT EXISTS idx_emails_received ON emails(received_at DESC);
CREATE INDEX IF NOT EXISTS idx_emails_thread ON emails(thread_id);
CREATE INDEX IF NOT EXISTS idx_emails_ai_processed ON emails(ai_processed) WHERE ai_processed = false;

-- Email visibility indexes
CREATE INDEX IF NOT EXISTS idx_email_visibility_user ON email_visibility(user_id);
CREATE INDEX IF NOT EXISTS idx_email_visibility_email ON email_visibility(email_id);

-- Email object link indexes
CREATE INDEX IF NOT EXISTS idx_email_object_link_email ON email_object_link(email_id);
CREATE INDEX IF NOT EXISTS idx_email_object_link_object ON email_object_link(object_type, object_id);

-- AI correction log indexes
CREATE INDEX IF NOT EXISTS idx_ai_correction_sender ON ai_correction_log(sender_email);
CREATE INDEX IF NOT EXISTS idx_ai_correction_user ON ai_correction_log(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_correction_created ON ai_correction_log(created_at DESC);

-- Unmatched queue indexes
CREATE INDEX IF NOT EXISTS idx_unmatched_queue_status ON unmatched_email_queue(status);
CREATE INDEX IF NOT EXISTS idx_unmatched_queue_created ON unmatched_email_queue(created_at DESC);

-- Gmail connection indexes
CREATE INDEX IF NOT EXISTS idx_gmail_connection_user ON gmail_connection(user_id);
CREATE INDEX IF NOT EXISTS idx_gmail_connection_active ON gmail_connection(is_active) WHERE is_active = true;

-- Deal synopsis indexes
CREATE INDEX IF NOT EXISTS idx_deal_synopsis_deal ON deal_synopsis(deal_id);
CREATE INDEX IF NOT EXISTS idx_deal_synopsis_alert ON deal_synopsis(alert_level);

-- Activity email index
CREATE INDEX IF NOT EXISTS idx_activity_email ON activity(email_id) WHERE email_id IS NOT NULL;

-- ============================================
-- 11. Row Level Security Policies
-- ============================================

-- Enable RLS on new tables
ALTER TABLE gmail_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE emails ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_visibility ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_object_link ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_correction_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE unmatched_email_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE deal_synopsis ENABLE ROW LEVEL SECURITY;

-- Gmail Connection: Users can only see their own connections
CREATE POLICY gmail_connection_select ON gmail_connection
    FOR SELECT USING (
        user_id IN (SELECT id FROM "user" WHERE email = auth.jwt() ->> 'email')
    );

CREATE POLICY gmail_connection_insert ON gmail_connection
    FOR INSERT WITH CHECK (
        user_id IN (SELECT id FROM "user" WHERE email = auth.jwt() ->> 'email')
    );

CREATE POLICY gmail_connection_update ON gmail_connection
    FOR UPDATE USING (
        user_id IN (SELECT id FROM "user" WHERE email = auth.jwt() ->> 'email')
    );

CREATE POLICY gmail_connection_delete ON gmail_connection
    FOR DELETE USING (
        user_id IN (SELECT id FROM "user" WHERE email = auth.jwt() ->> 'email')
    );

-- Emails: Users can see emails they have visibility to
CREATE POLICY emails_select ON emails
    FOR SELECT USING (
        id IN (
            SELECT email_id FROM email_visibility
            WHERE user_id IN (SELECT id FROM "user" WHERE email = auth.jwt() ->> 'email')
        )
    );

-- Email Visibility: Users can only see their own visibility records
CREATE POLICY email_visibility_select ON email_visibility
    FOR SELECT USING (
        user_id IN (SELECT id FROM "user" WHERE email = auth.jwt() ->> 'email')
    );

-- Email Object Link: Users can see links for emails they have visibility to
CREATE POLICY email_object_link_select ON email_object_link
    FOR SELECT USING (
        email_id IN (
            SELECT email_id FROM email_visibility
            WHERE user_id IN (SELECT id FROM "user" WHERE email = auth.jwt() ->> 'email')
        )
    );

CREATE POLICY email_object_link_insert ON email_object_link
    FOR INSERT WITH CHECK (
        email_id IN (
            SELECT email_id FROM email_visibility
            WHERE user_id IN (SELECT id FROM "user" WHERE email = auth.jwt() ->> 'email')
        )
    );

CREATE POLICY email_object_link_delete ON email_object_link
    FOR DELETE USING (
        email_id IN (
            SELECT email_id FROM email_visibility
            WHERE user_id IN (SELECT id FROM "user" WHERE email = auth.jwt() ->> 'email')
        )
    );

-- AI Correction Log: Users can only see/create their own corrections
CREATE POLICY ai_correction_log_select ON ai_correction_log
    FOR SELECT USING (
        user_id IN (SELECT id FROM "user" WHERE email = auth.jwt() ->> 'email')
    );

CREATE POLICY ai_correction_log_insert ON ai_correction_log
    FOR INSERT WITH CHECK (
        user_id IN (SELECT id FROM "user" WHERE email = auth.jwt() ->> 'email')
    );

-- Unmatched Email Queue: Users can see queue items from their connections
CREATE POLICY unmatched_email_queue_select ON unmatched_email_queue
    FOR SELECT USING (
        gmail_connection_id IN (
            SELECT id FROM gmail_connection
            WHERE user_id IN (SELECT id FROM "user" WHERE email = auth.jwt() ->> 'email')
        )
    );

CREATE POLICY unmatched_email_queue_update ON unmatched_email_queue
    FOR UPDATE USING (
        gmail_connection_id IN (
            SELECT id FROM gmail_connection
            WHERE user_id IN (SELECT id FROM "user" WHERE email = auth.jwt() ->> 'email')
        )
    );

-- Deal Synopsis: All authenticated users can see synopses (follows deal permissions)
CREATE POLICY deal_synopsis_select ON deal_synopsis
    FOR SELECT USING (auth.role() = 'authenticated');

-- ============================================
-- 12. Service Role Bypass for Edge Functions
-- ============================================
-- Edge functions use service_role key which bypasses RLS
-- This is intentional for background processing

-- ============================================
-- 13. Updated_at Trigger for gmail_connection
-- ============================================
CREATE OR REPLACE FUNCTION update_gmail_connection_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS gmail_connection_updated_at ON gmail_connection;
CREATE TRIGGER gmail_connection_updated_at
    BEFORE UPDATE ON gmail_connection
    FOR EACH ROW
    EXECUTE FUNCTION update_gmail_connection_updated_at();

-- ============================================
-- Migration Complete
-- ============================================
