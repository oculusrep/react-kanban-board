-- Migration: Sync auth_user_id in user table
-- Created: January 31, 2026
-- Description: Automatically sync auth_user_id when auth.users are created
--              and backfill existing records

-- ============================================================================
-- 1. BACKFILL: Update existing user records with their auth_user_id
-- ============================================================================

UPDATE "user" u
SET auth_user_id = au.id
FROM auth.users au
WHERE LOWER(u.email) = LOWER(au.email)
AND u.auth_user_id IS NULL;

-- ============================================================================
-- 2. CREATE FUNCTION: Sync auth_user_id on auth.users insert
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_auth_user_id_on_signup()
RETURNS TRIGGER AS $$
BEGIN
  -- When a new auth user is created, update any matching user record
  UPDATE "user"
  SET auth_user_id = NEW.id
  WHERE LOWER(email) = LOWER(NEW.email)
  AND auth_user_id IS NULL;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 3. CREATE TRIGGER: Fire on auth.users insert
-- ============================================================================

-- Drop if exists to allow re-running migration
DROP TRIGGER IF EXISTS sync_auth_user_id_trigger ON auth.users;

CREATE TRIGGER sync_auth_user_id_trigger
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_user_id_on_signup();

-- ============================================================================
-- 4. CREATE FUNCTION: Sync on user table insert (when user record created after auth)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_auth_user_id_on_user_insert()
RETURNS TRIGGER AS $$
BEGIN
  -- When a new user record is created, try to find matching auth user
  IF NEW.auth_user_id IS NULL AND NEW.email IS NOT NULL THEN
    SELECT au.id INTO NEW.auth_user_id
    FROM auth.users au
    WHERE LOWER(au.email) = LOWER(NEW.email)
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 5. CREATE TRIGGER: Fire on user table insert
-- ============================================================================

DROP TRIGGER IF EXISTS sync_auth_user_id_on_user_insert_trigger ON "user";

CREATE TRIGGER sync_auth_user_id_on_user_insert_trigger
  BEFORE INSERT ON "user"
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_user_id_on_user_insert();

-- ============================================================================
-- 6. CREATE FUNCTION: Also sync on user email update
-- ============================================================================

CREATE OR REPLACE FUNCTION public.sync_auth_user_id_on_user_update()
RETURNS TRIGGER AS $$
BEGIN
  -- If email changed and auth_user_id is null, try to find matching auth user
  IF NEW.email IS DISTINCT FROM OLD.email AND NEW.auth_user_id IS NULL THEN
    SELECT au.id INTO NEW.auth_user_id
    FROM auth.users au
    WHERE LOWER(au.email) = LOWER(NEW.email)
    LIMIT 1;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- ============================================================================
-- 7. CREATE TRIGGER: Fire on user table update
-- ============================================================================

DROP TRIGGER IF EXISTS sync_auth_user_id_on_user_update_trigger ON "user";

CREATE TRIGGER sync_auth_user_id_on_user_update_trigger
  BEFORE UPDATE ON "user"
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_auth_user_id_on_user_update();

-- ============================================================================
-- GRANT PERMISSIONS
-- ============================================================================

GRANT EXECUTE ON FUNCTION public.sync_auth_user_id_on_signup TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_auth_user_id_on_user_insert TO authenticated;
GRANT EXECUTE ON FUNCTION public.sync_auth_user_id_on_user_update TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
