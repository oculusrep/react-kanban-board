-- Optimize user role query performance by removing circular RLS dependencies
-- The current RLS policies have nested subqueries that cause slow performance

-- First, create a security definer function to get user role (bypasses RLS)
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS TEXT
LANGUAGE sql
SECURITY DEFINER
STABLE
AS $$
  SELECT ovis_role FROM public.user WHERE id = auth.uid();
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.get_current_user_role() TO authenticated;

-- Now update the RLS policies to use this function instead of nested subqueries
DROP POLICY IF EXISTS "Admins can read all users" ON "user";
DROP POLICY IF EXISTS "Admins can modify users" ON "user";

-- Simplified admin read policy using the function
CREATE POLICY "Admins can read all users"
ON "user" FOR SELECT
TO authenticated
USING (public.get_current_user_role() = 'admin');

-- Simplified admin modify policy using the function
CREATE POLICY "Admins can modify users"
ON "user" FOR ALL
TO authenticated
USING (public.get_current_user_role() = 'admin')
WITH CHECK (public.get_current_user_role() = 'admin');

-- Add index on ovis_role for faster role checks (if not exists)
CREATE INDEX IF NOT EXISTS idx_user_ovis_role ON "user"(ovis_role);

-- Add index on id (should already exist as PRIMARY KEY, but explicit for clarity)
-- This ensures fast lookups by auth.uid()
CREATE INDEX IF NOT EXISTS idx_user_id ON "user"(id);
