-- Email Activity Visibility Fix
-- Created: January 12, 2026
-- Purpose: Ensure emails referenced by activities are visible to all users
--          This fixes the issue where activities with email_id weren't showing
--          because the email wasn't visible to the querying user
--
-- The issue: PostgreSQL can filter out activity rows when the email_id FK
-- references an email the user can't see due to RLS.

-- ============================================
-- 1. Update Email SELECT Policy
-- Add condition: emails referenced by activities are visible
-- ============================================

DROP POLICY IF EXISTS emails_select ON emails;

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
        OR
        -- Emails referenced by activities (so activity list shows correctly)
        id IN (
            SELECT email_id FROM activity WHERE email_id IS NOT NULL
        )
    );

-- ============================================
-- Summary:
-- This ensures that ANY email that has been:
-- 1. Synced by the user (email_visibility)
-- 2. Tagged to a CRM object (email_object_link)
-- 3. Created as an activity (activity.email_id)
-- Will be visible to all authenticated users.
--
-- This is necessary because when email triage creates an activity,
-- the email needs to be visible for the activity to show up.
-- ============================================
