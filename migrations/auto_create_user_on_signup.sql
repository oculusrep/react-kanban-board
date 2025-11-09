-- Migration: Automatic User Table Record Creation on Signup
-- Purpose: Automatically create user table record when auth user is created
-- Benefit: Eliminates manual SQL and ensures correct auth_user_id linking

-- =====================================================================
-- Create function to automatically create user table record
-- =====================================================================

CREATE OR REPLACE FUNCTION create_user_record()
RETURNS TRIGGER AS $$
BEGIN
  -- Automatically create user table record when auth user is created
  INSERT INTO "user" (
    auth_user_id,
    email,
    name,
    first_name,
    last_name,
    active,
    ovis_role
  )
  VALUES (
    NEW.id,                                                    -- auth.users.id
    NEW.email,                                                 -- auth.users.email
    COALESCE(NEW.raw_user_meta_data->>'name', NEW.email),    -- Name from metadata or email
    NEW.raw_user_meta_data->>'first_name',                    -- First name from metadata
    NEW.raw_user_meta_data->>'last_name',                     -- Last name from metadata
    true,                                                      -- Active by default
    COALESCE(NEW.raw_user_meta_data->>'role', 'user')        -- Role from metadata or 'user'
  )
  ON CONFLICT (auth_user_id) DO UPDATE SET
    -- Update email if it changed in auth.users
    email = EXCLUDED.email,
    -- Update name if provided in metadata
    name = COALESCE(EXCLUDED.name, "user".name),
    first_name = COALESCE(EXCLUDED.first_name, "user".first_name),
    last_name = COALESCE(EXCLUDED.last_name, "user".last_name);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- Create trigger on auth.users table
-- =====================================================================

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT OR UPDATE ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION create_user_record();

-- =====================================================================
-- Add unique constraint to ensure auth_user_id is unique (if not exists)
-- =====================================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_auth_user_id_unique'
  ) THEN
    ALTER TABLE "user"
      ADD CONSTRAINT user_auth_user_id_unique UNIQUE (auth_user_id);
  END IF;
END $$;

-- =====================================================================
-- Verification
-- =====================================================================

-- Check that trigger was created
SELECT
  trigger_name,
  event_object_table,
  action_timing,
  event_manipulation,
  action_statement
FROM information_schema.triggers
WHERE trigger_name = 'on_auth_user_created';

-- Check that function exists
SELECT
  routine_name,
  routine_type,
  routine_schema
FROM information_schema.routines
WHERE routine_name = 'create_user_record';

-- =====================================================================
-- Testing Instructions
-- =====================================================================

-- To test this trigger:
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Click "Add User"
-- 3. Enter email: test.trigger@example.com
-- 4. Enter password
-- 5. Optionally add user metadata:
--    {
--      "name": "Test User",
--      "first_name": "Test",
--      "last_name": "User",
--      "role": "user"
--    }
-- 6. Click "Create User"
-- 7. Run this verification query:

/*
SELECT
  u.id as user_table_id,
  u.auth_user_id,
  u.name,
  u.email,
  u.active,
  u.ovis_role,
  au.email as auth_email,
  CASE
    WHEN u.auth_user_id IS NULL THEN '✗ FAIL - auth_user_id is NULL'
    WHEN au.id IS NULL THEN '✗ FAIL - auth user not found'
    WHEN u.email != au.email THEN '⚠ WARNING - emails do not match'
    ELSE '✓ PASS - User created automatically!'
  END as status
FROM "user" u
LEFT JOIN auth.users au ON u.auth_user_id = au.id
WHERE u.email = 'test.trigger@example.com';
*/

-- =====================================================================
-- Notes
-- =====================================================================

-- This trigger works with:
-- 1. Manual user creation in Supabase Dashboard
-- 2. Signup via Supabase Auth API
-- 3. Admin SDK user creation
-- 4. Any method that creates auth.users records

-- User metadata can be passed during signup:
-- const { data, error } = await supabase.auth.signUp({
--   email: 'user@example.com',
--   password: 'password',
--   options: {
--     data: {
--       name: 'John Smith',
--       first_name: 'John',
--       last_name: 'Smith',
--       role: 'user'
--     }
--   }
-- });

-- Benefits:
-- ✅ Automatic user table record creation
-- ✅ Guaranteed correct auth_user_id linking
-- ✅ No manual SQL needed
-- ✅ Prevents setup mistakes
-- ✅ Works for all signup methods

COMMENT ON FUNCTION create_user_record() IS 'Automatically creates user table record when auth user is created or updated. Ensures auth_user_id is always correct.';
COMMENT ON TRIGGER on_auth_user_created ON auth.users IS 'Triggers automatic user table record creation on auth user signup';
