-- Fix: INSERT ... RETURNING kept failing RLS because the SELECT policy used
-- an EXISTS(SELECT ... FROM merchant_favorite ...) subquery that couldn't see
-- the row-in-flight. When PostgREST does `.insert(...).select('id')` it
-- translates to INSERT ... RETURNING, at which point Postgres applies the
-- SELECT USING clause to the returned row. A subquery on the same table
-- doesn't see mid-statement uncommitted rows via MVCC, so it returned FALSE
-- and the whole insert failed with the opaque "row-level security policy"
-- error.
--
-- Fix: split the SELECT policy into two. The first checks the row's own
-- owner_user_id column directly (no subquery — visible in RETURNING). The
-- second handles the shared-favorites case with the EXISTS subquery (only
-- fires for post-commit SELECTs, so the MVCC issue doesn't apply). Multiple
-- PERMISSIVE policies are OR'd, so a row is visible if either passes.

-- Also drop the redundant helper function that's no longer referenced,
-- and clean up the debug artifacts.
DROP POLICY IF EXISTS "Users can read own or shared favorites" ON merchant_favorite;

CREATE POLICY "Users can read own favorites"
  ON merchant_favorite FOR SELECT
  TO authenticated
  USING (owner_user_id = public.merchants_current_user_id());

CREATE POLICY "Users can read shared favorites"
  ON merchant_favorite FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM merchant_favorite_share s
      WHERE s.favorite_id = merchant_favorite.id
        AND s.user_id = public.merchants_current_user_id()
    )
  );

-- The relaxed INSERT policy from 20260702210000 stays in place — the
-- BEFORE-INSERT trigger already forces owner_user_id from auth.uid(), so a
-- more restrictive WITH CHECK is redundant.
