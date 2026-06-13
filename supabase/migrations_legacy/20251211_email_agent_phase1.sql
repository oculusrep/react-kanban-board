-- Email Agent Phase 1 Improvements
-- Migration: 20251211_email_agent_phase1.sql
--
-- Changes:
-- 1. Add processed_message_ids table to prevent re-fetching deleted emails
-- 2. Enable pg_cron extension for scheduled triage
-- 3. Create cron job to run email-triage every 10 minutes

-- ============================================
-- 1. Processed Message IDs Table
-- ============================================
-- Stores message_id hashes of emails we've already processed
-- Used to prevent Gmail sync from re-fetching deleted emails

CREATE TABLE IF NOT EXISTS processed_message_ids (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    message_id VARCHAR(500) UNIQUE NOT NULL,      -- Gmail Message-ID header
    gmail_connection_id UUID REFERENCES gmail_connection(id) ON DELETE SET NULL,
    action VARCHAR(20) NOT NULL DEFAULT 'deleted', -- 'deleted', 'processed'
    processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for fast lookups during Gmail sync
CREATE INDEX IF NOT EXISTS idx_processed_message_ids_lookup
    ON processed_message_ids(message_id);

CREATE INDEX IF NOT EXISTS idx_processed_message_ids_connection
    ON processed_message_ids(gmail_connection_id);

-- RLS: Service role only (edge functions bypass RLS)
ALTER TABLE processed_message_ids ENABLE ROW LEVEL SECURITY;

-- Users can see their own processed message IDs
CREATE POLICY processed_message_ids_select ON processed_message_ids
    FOR SELECT USING (
        gmail_connection_id IN (
            SELECT id FROM gmail_connection
            WHERE user_id IN (SELECT id FROM "user" WHERE email = auth.jwt() ->> 'email')
        )
    );

-- ============================================
-- 2. Enable pg_cron Extension
-- ============================================
-- Note: pg_cron must be enabled in Supabase Dashboard first:
-- Settings > Extensions > pg_cron > Enable

-- Uncomment if extension is enabled in dashboard:
-- CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;

-- ============================================
-- 3. Create HTTP Extension for Calling Edge Functions
-- ============================================
-- Note: http extension is already enabled in Supabase by default
-- CREATE EXTENSION IF NOT EXISTS http WITH SCHEMA extensions;

-- ============================================
-- 4. Scheduled Email Triage Function
-- ============================================
-- This function calls the email-triage edge function via HTTP

CREATE OR REPLACE FUNCTION trigger_email_triage()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    supabase_url text;
    service_key text;
    response record;
BEGIN
    -- Get Supabase URL from environment (set in Supabase secrets)
    supabase_url := current_setting('app.settings.supabase_url', true);
    service_key := current_setting('app.settings.service_role_key', true);

    -- Skip if not configured
    IF supabase_url IS NULL OR service_key IS NULL THEN
        RAISE NOTICE 'Email triage not configured - missing supabase_url or service_role_key';
        RETURN;
    END IF;

    -- Call the email-triage edge function
    SELECT * INTO response FROM extensions.http((
        'POST',
        supabase_url || '/functions/v1/email-triage',
        ARRAY[
            extensions.http_header('Authorization', 'Bearer ' || service_key),
            extensions.http_header('Content-Type', 'application/json')
        ],
        'application/json',
        '{}'
    )::extensions.http_request);

    RAISE NOTICE 'Email triage response: %', response.status;
END;
$$;

-- ============================================
-- 5. Schedule the Cron Job (Run every 10 minutes)
-- ============================================
-- Note: This requires pg_cron to be enabled first
-- Run this manually after enabling pg_cron in the Supabase dashboard:

-- SELECT cron.schedule(
--     'email-triage-job',           -- Job name
--     '*/10 * * * *',               -- Every 10 minutes
--     'SELECT trigger_email_triage()'
-- );

-- To view scheduled jobs:
-- SELECT * FROM cron.job;

-- To unschedule:
-- SELECT cron.unschedule('email-triage-job');

-- ============================================
-- Migration Complete
-- ============================================
--
-- MANUAL STEPS REQUIRED:
-- 1. Enable pg_cron in Supabase Dashboard: Settings > Extensions > pg_cron
-- 2. Set app secrets for the function:
--    ALTER DATABASE postgres SET app.settings.supabase_url = 'https://your-project.supabase.co';
--    ALTER DATABASE postgres SET app.settings.service_role_key = 'your-service-role-key';
-- 3. Schedule the job:
--    SELECT cron.schedule('email-triage-job', '*/10 * * * *', 'SELECT trigger_email_triage()');
