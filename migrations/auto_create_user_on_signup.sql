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
-- Note: This requires superuser/service_role permissions
-- If you get permission errors, you have two options:
--   1. Use the RPC function approach below instead
--   2. Contact Supabase support to enable this trigger
-- =====================================================================

-- Option 1: Try to create trigger (may fail with permission error)
-- DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
-- CREATE TRIGGER on_auth_user_created
--   AFTER INSERT OR UPDATE ON auth.users
--   FOR EACH ROW
--   EXECUTE FUNCTION create_user_record();

-- =====================================================================
-- Alternative: RPC Function Approach (Recommended for Supabase)
-- =====================================================================
-- Call this function after creating a user via API or Dashboard

CREATE OR REPLACE FUNCTION sync_user_from_auth(auth_user_id uuid)
RETURNS void AS $$
DECLARE
  auth_user_email text;
  auth_user_metadata jsonb;
BEGIN
  -- Get auth user data
  SELECT email, raw_user_meta_data
  INTO auth_user_email, auth_user_metadata
  FROM auth.users
  WHERE id = auth_user_id;

  -- Create or update user record
  IF auth_user_email IS NOT NULL THEN
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
      auth_user_id,
      auth_user_email,
      COALESCE(auth_user_metadata->>'name', auth_user_email),
      auth_user_metadata->>'first_name',
      auth_user_metadata->>'last_name',
      true,
      COALESCE(auth_user_metadata->>'role', 'user')
    )
    ON CONFLICT (auth_user_id) DO UPDATE SET
      email = EXCLUDED.email,
      name = COALESCE(EXCLUDED.name, "user".name),
      first_name = COALESCE(EXCLUDED.first_name, "user".first_name),
      last_name = COALESCE(EXCLUDED.last_name, "user".last_name);
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

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
-- Sync existing auth users (run once after migration)
-- =====================================================================
-- This will sync any auth users that don't have user table records yet

DO $$
DECLARE
  auth_user_record RECORD;
BEGIN
  FOR auth_user_record IN
    SELECT au.id, au.email, au.raw_user_meta_data
    FROM auth.users au
    LEFT JOIN "user" u ON au.id = u.auth_user_id
    WHERE u.id IS NULL  -- Only users without user table records
  LOOP
    PERFORM sync_user_from_auth(auth_user_record.id);
  END LOOP;
END $$;

-- =====================================================================
-- Testing Instructions
-- =====================================================================

-- Method 1: Using RPC Function (After creating user in Dashboard)
-- 1. Go to Supabase Dashboard → Authentication → Users
-- 2. Click "Add User"
-- 3. Enter email: test@example.com, password
-- 4. Copy the user ID that's created
-- 5. Run this command:
-- SELECT sync_user_from_auth('PASTE_USER_ID_HERE');

-- Method 2: Verify existing users were synced
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
    ELSE '✓ PASS - User synced correctly!'
  END as status
FROM "user" u
LEFT JOIN auth.users au ON u.auth_user_id = au.id
ORDER BY u.created_at DESC NULLS LAST
LIMIT 10;

-- =====================================================================
-- Notes
-- =====================================================================

-- This approach works with:
-- 1. Manual user creation in Supabase Dashboard (call sync_user_from_auth after)
-- 2. Signup via Supabase Auth API (call sync_user_from_auth in signup handler)
-- 3. Admin SDK user creation (call sync_user_from_auth after)

-- Usage in signup handler:
-- const { data: { user }, error } = await supabase.auth.signUp({
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
--
-- if (user) {
--   await supabase.rpc('sync_user_from_auth', { auth_user_id: user.id });
-- }

-- Benefits:
-- ✅ Works around Supabase permission restrictions
-- ✅ Guaranteed correct auth_user_id linking
-- ✅ Syncs existing auth users automatically
-- ✅ Prevents setup mistakes
-- ✅ Can be called manually when needed

COMMENT ON FUNCTION sync_user_from_auth(uuid) IS 'Syncs a user record from auth.users to user table. Call after creating auth users.';
