-- Activity Email Visibility Fix
-- Created: January 12, 2026
-- Purpose: Allow all authenticated users to see email activities
--
-- The issue: Activity RLS only allows admin or owner to see activities.
-- Email activities created by the email-triage function have NULL owner_id,
-- so only admins could see them.
--
-- Fix: Add condition to allow viewing any activity with an email_id.

-- ============================================
-- Update Activity SELECT Policy
-- ============================================

DROP POLICY IF EXISTS activity_select_policy ON activity;

CREATE POLICY activity_select_policy ON activity
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM "user" u
            WHERE u.auth_user_id = auth.uid()
            AND (
                u.ovis_role = 'admin'
                OR activity.owner_id = u.id
                OR activity.email_id IS NOT NULL  -- All users can see email activities
            )
        )
    );

-- ============================================
-- Summary:
-- Users can now see activities if:
-- 1. They are an admin
-- 2. They own the activity (owner_id matches)
-- 3. The activity is an email activity (has email_id)
--
-- This ensures email activities show up in deal timelines
-- for all team members, enabling collaboration on deals.
-- ============================================
