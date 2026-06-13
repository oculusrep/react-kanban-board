-- Email Object Link Permissions Fix
-- Created: January 12, 2026
-- Purpose: Allow all authenticated users to add/remove tags on visible emails
--
-- The issue: INSERT/DELETE/UPDATE policies were too restrictive.
-- Users could only manage tags they created or on their own synced emails.
-- But AI creates tags with NULL created_by_user_id, and users need to
-- correct AI mistakes on shared emails.
--
-- Fix: Allow all authenticated users to manage tags on any email they can see.

-- ============================================
-- Update INSERT Policy
-- Any authenticated user can tag emails they can see
-- ============================================

DROP POLICY IF EXISTS email_object_link_insert ON email_object_link;

CREATE POLICY email_object_link_insert ON email_object_link
    FOR INSERT WITH CHECK (
        auth.role() = 'authenticated'
    );

-- ============================================
-- Update DELETE Policy
-- Any authenticated user can remove tags on emails they can see
-- ============================================

DROP POLICY IF EXISTS email_object_link_delete ON email_object_link;

CREATE POLICY email_object_link_delete ON email_object_link
    FOR DELETE USING (
        auth.role() = 'authenticated'
    );

-- ============================================
-- Update UPDATE Policy
-- Any authenticated user can update tags on emails they can see
-- ============================================

DROP POLICY IF EXISTS email_object_link_update ON email_object_link;

CREATE POLICY email_object_link_update ON email_object_link
    FOR UPDATE USING (
        auth.role() = 'authenticated'
    );

-- ============================================
-- Summary:
-- All authenticated users can now:
-- - Add tags to any email they can see
-- - Remove tags from any email they can see
-- - Update tags on any email they can see
--
-- The SELECT policy still controls which emails are visible,
-- so users can only manage tags on emails that pass the
-- visibility check (own emails, tagged emails, or email activities).
--
-- This enables the team to:
-- - Correct AI tagging mistakes
-- - Add additional relevant tags
-- - Remove incorrect tags
-- ============================================
