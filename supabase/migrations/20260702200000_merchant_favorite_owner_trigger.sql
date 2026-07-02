-- Belt-and-suspenders: force merchant_favorite.owner_user_id to the current
-- user's id at insert time, regardless of what the client sends. Protects
-- against stale cached JS or a client that sets owner_user_id incorrectly.
--
-- Fails with a clean error if the caller isn't authenticated (auth.uid() NULL),
-- rather than the opaque "row-level security policy" message.
--
-- The RLS INSERT policy (owner_user_id = merchants_current_user_id()) still
-- runs after the trigger and is now trivially satisfied.

CREATE OR REPLACE FUNCTION public.merchant_favorite_set_owner()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  uid uuid;
BEGIN
  uid := public.merchants_current_user_id();
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in — cannot create favorite (auth.uid() is NULL)';
  END IF;
  NEW.owner_user_id := uid;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS merchant_favorite_set_owner_trg ON merchant_favorite;
CREATE TRIGGER merchant_favorite_set_owner_trg
  BEFORE INSERT ON merchant_favorite
  FOR EACH ROW
  EXECUTE FUNCTION public.merchant_favorite_set_owner();

COMMENT ON FUNCTION public.merchant_favorite_set_owner IS
  'BEFORE INSERT trigger: overrides owner_user_id with merchants_current_user_id() so the RLS check always passes for signed-in users regardless of client payload.';
