-- Fix RLS policies for user_email_signature table
-- The original policies used auth.uid() directly, but user_id references the user table's id,
-- not the auth.users id. This migration fixes the policies to properly match against the user table.

-- Drop existing policies
DROP POLICY IF EXISTS "Users can view own signatures" ON user_email_signature;
DROP POLICY IF EXISTS "Users can create signatures" ON user_email_signature;
DROP POLICY IF EXISTS "Users can update own signatures" ON user_email_signature;
DROP POLICY IF EXISTS "Users can delete own signatures" ON user_email_signature;

-- Recreate policies with proper user lookup
-- Users can only see their own signatures
CREATE POLICY "Users can view own signatures"
  ON user_email_signature FOR SELECT
  USING (
    user_id IN (
      SELECT id FROM "user" WHERE auth_user_id = auth.uid()
    )
  );

-- Users can insert their own signatures
CREATE POLICY "Users can create signatures"
  ON user_email_signature FOR INSERT
  WITH CHECK (
    user_id IN (
      SELECT id FROM "user" WHERE auth_user_id = auth.uid()
    )
  );

-- Users can update their own signatures
CREATE POLICY "Users can update own signatures"
  ON user_email_signature FOR UPDATE
  USING (
    user_id IN (
      SELECT id FROM "user" WHERE auth_user_id = auth.uid()
    )
  );

-- Users can delete their own signatures
CREATE POLICY "Users can delete own signatures"
  ON user_email_signature FOR DELETE
  USING (
    user_id IN (
      SELECT id FROM "user" WHERE auth_user_id = auth.uid()
    )
  );
