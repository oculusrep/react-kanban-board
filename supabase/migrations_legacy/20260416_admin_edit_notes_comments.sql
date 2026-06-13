-- Migration: Allow admins to edit any property note or site submit comment
-- Date: 2026-04-16

-- ============================================================================
-- 1. property_note: allow admin update on any note
-- ============================================================================

DROP POLICY IF EXISTS "Users can update their own property notes" ON property_note;

CREATE POLICY "Users can update own notes, admins can update any"
  ON property_note
  FOR UPDATE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR public.get_user_ovis_role() = 'admin'
  )
  WITH CHECK (
    created_by = auth.uid()
    OR public.get_user_ovis_role() = 'admin'
  );

-- ============================================================================
-- 2. site_submit_comment: allow admin update on any comment
-- ============================================================================

DROP POLICY IF EXISTS "comment_self_update" ON site_submit_comment;

CREATE POLICY "comment_self_or_admin_update"
  ON site_submit_comment
  FOR UPDATE
  TO authenticated
  USING (
    author_id = auth.uid()
    OR public.get_user_ovis_role() = 'admin'
  )
  WITH CHECK (
    author_id = auth.uid()
    OR public.get_user_ovis_role() = 'admin'
  );
