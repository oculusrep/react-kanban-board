-- Fix user table RLS to allow get_user_role() to work
-- The get_user_role() function needs to query the user table,
-- but if user table has RLS that blocks reading, it creates a circular dependency

-- Enable RLS on user table if not already enabled
ALTER TABLE "user" ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist (to avoid conflicts)
DROP POLICY IF EXISTS "Users can read their own data" ON "user";
DROP POLICY IF EXISTS "Users can read own profile" ON "user";
DROP POLICY IF EXISTS "Allow users to read their own profile" ON "user";

-- Allow users to read their own row (CRITICAL for get_user_role() to work)
CREATE POLICY "Users can read their own data"
ON "user" FOR SELECT
TO authenticated
USING (id = auth.uid());

-- Allow admins to read all users
CREATE POLICY "Admins can read all users"
ON "user" FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "user" WHERE id = auth.uid() AND ovis_role = 'admin'
  )
);

-- Allow admins to modify users
CREATE POLICY "Admins can modify users"
ON "user" FOR ALL
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM "user" WHERE id = auth.uid() AND ovis_role = 'admin'
  )
)
WITH CHECK (
  EXISTS (
    SELECT 1 FROM "user" WHERE id = auth.uid() AND ovis_role = 'admin'
  )
);
