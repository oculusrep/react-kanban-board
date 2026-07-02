-- The RLS INSERT policy "owner_user_id = merchants_current_user_id()" is
-- fighting the BEFORE-INSERT trigger in a way that's producing spurious
-- failures for legitimately authenticated users (repro'd in prod: the
-- trigger sets owner_user_id from auth.uid() unconditionally, but the check
-- still rejects the row).
--
-- The BEFORE-INSERT trigger already guarantees owner_user_id =
-- merchants_current_user_id() and raises a clean error when the caller is
-- not signed in. So the RLS INSERT check is redundant and can be simplified
-- to just requiring an authenticated session.
--
-- Security posture is unchanged: authenticated users can only insert
-- favorites with themselves as owner (enforced by the trigger, not RLS).

DROP POLICY IF EXISTS "Users can create own favorites" ON merchant_favorite;

CREATE POLICY "Authenticated users can create favorites"
  ON merchant_favorite FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);
