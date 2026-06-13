-- Email Shared Visibility Migration
-- Created: January 12, 2026
-- Purpose: Allow tagged emails to be visible to all authenticated users
--          while keeping untagged emails private to their owner
--
-- Current behavior: Users only see emails they have email_visibility records for
-- New behavior: Users see:
--   1. Emails they have email_visibility records for (their own synced emails)
--   2. Emails tagged to any CRM object (deal, client, contact, property)
--
-- Deduplication is handled by:
--   - emails.message_id UNIQUE constraint (same Gmail message stored once)
--   - email_object_link UNIQUE(email_id, object_type, object_id) (can't double-tag)

-- ============================================
-- 1. Drop existing restrictive policies
-- ============================================

DROP POLICY IF EXISTS emails_select ON emails;
DROP POLICY IF EXISTS email_object_link_select ON email_object_link;
DROP POLICY IF EXISTS email_object_link_insert ON email_object_link;
DROP POLICY IF EXISTS email_object_link_delete ON email_object_link;

-- ============================================
-- 2. New Email SELECT Policy
-- Users can see emails if:
--   a) They have email_visibility for it (their own synced email), OR
--   b) The email is tagged to ANY CRM object (shared with team)
-- ============================================

CREATE POLICY emails_select ON emails
    FOR SELECT USING (
        -- User's own emails (via email_visibility)
        id IN (
            SELECT email_id FROM email_visibility
            WHERE user_id IN (SELECT id FROM "user" WHERE auth_user_id = auth.uid())
        )
        OR
        -- Emails tagged to CRM objects (shared with all authenticated users)
        id IN (
            SELECT email_id FROM email_object_link
        )
    );

-- ============================================
-- 3. New Email Object Link SELECT Policy
-- All authenticated users can see tags on emails they can see
-- (This follows from the emails policy above)
-- ============================================

CREATE POLICY email_object_link_select ON email_object_link
    FOR SELECT USING (
        auth.role() = 'authenticated'
    );

-- ============================================
-- 4. New Email Object Link INSERT Policy
-- Users can tag emails if:
--   a) They have email_visibility for the email (their own), OR
--   b) The email is already tagged (and thus visible to them)
-- ============================================

CREATE POLICY email_object_link_insert ON email_object_link
    FOR INSERT WITH CHECK (
        -- User has visibility to the email
        email_id IN (
            SELECT email_id FROM email_visibility
            WHERE user_id IN (SELECT id FROM "user" WHERE auth_user_id = auth.uid())
        )
        OR
        -- Email is already tagged (so user can see it and add more tags)
        email_id IN (
            SELECT email_id FROM email_object_link
        )
    );

-- ============================================
-- 5. New Email Object Link DELETE Policy
-- Users can remove tags if:
--   a) They created the tag, OR
--   b) They have email_visibility for the email
-- ============================================

CREATE POLICY email_object_link_delete ON email_object_link
    FOR DELETE USING (
        -- User created this tag
        created_by_user_id IN (SELECT id FROM "user" WHERE auth_user_id = auth.uid())
        OR
        -- User has visibility to the email (it's their email)
        email_id IN (
            SELECT email_id FROM email_visibility
            WHERE user_id IN (SELECT id FROM "user" WHERE auth_user_id = auth.uid())
        )
    );

-- ============================================
-- 6. Add UPDATE policy for email_object_link
-- (Was missing from original migration)
-- ============================================

CREATE POLICY email_object_link_update ON email_object_link
    FOR UPDATE USING (
        -- User created this tag
        created_by_user_id IN (SELECT id FROM "user" WHERE auth_user_id = auth.uid())
        OR
        -- User has visibility to the email
        email_id IN (
            SELECT email_id FROM email_visibility
            WHERE user_id IN (SELECT id FROM "user" WHERE auth_user_id = auth.uid())
        )
    );

-- ============================================
-- 7. Grant permissions
-- ============================================

GRANT SELECT ON emails TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON email_object_link TO authenticated;

-- ============================================
-- Summary of visibility rules:
--
-- UNTAGGED EMAILS:
--   - Only visible to users who synced them (via email_visibility)
--   - Private to the Gmail account owner
--
-- TAGGED EMAILS:
--   - Visible to ALL authenticated users
--   - Appears once per CRM object (not duplicated)
--   - Both Mike and Arty tagging the same email to Deal X:
--     * Email stored once (deduped by message_id)
--     * Shows up once in Deal X's email list
--     * Both can see it, neither sees duplicates
--
-- TAGGING PERMISSIONS:
--   - Can tag your own synced emails
--   - Can add additional tags to already-tagged emails
--   - Can remove tags you created or on your own emails
-- ============================================
