-- Org-wide default merchant favorite.
--
-- Goal: when a user opens the Merchants drawer on the map for the first time
-- in a session, we auto-select a curated brand set ("OREP") and turn the
-- layer on so pins appear immediately. That favorite is owned by one account,
-- but the default must work for EVERY authenticated user — the existing
-- favorite RLS only exposes a favorite to its owner or explicitly-shared
-- users, and there is no "public" scope in merchant_favorite_share.
--
-- Rather than fan-out share rows per user (fragile; new users get nothing),
-- introduce an is_default flag. A favorite flagged is_default is readable by
-- all authenticated users (favorite row + its brand links), so the client can
-- read its brand set regardless of ownership. Edit/delete stay owner-only.

ALTER TABLE merchant_favorite
  ADD COLUMN IF NOT EXISTS is_default boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN merchant_favorite.is_default IS
  'When true, this favorite is the org-wide default: readable by all authenticated users and auto-applied when the Merchants drawer first opens. At most one row may be true (enforced by uniq_merchant_favorite_single_default).';

-- At most one org default at a time.
CREATE UNIQUE INDEX IF NOT EXISTS uniq_merchant_favorite_single_default
  ON merchant_favorite ((true))
  WHERE is_default;

-- Any authenticated user can read the default favorite row. PERMISSIVE SELECT
-- policies are OR'd with the existing own/shared policies, so this only widens
-- visibility for the flagged row.
DROP POLICY IF EXISTS "Anyone can read the default favorite" ON merchant_favorite;
CREATE POLICY "Anyone can read the default favorite"
  ON merchant_favorite FOR SELECT
  TO authenticated
  USING (is_default);

-- The brand-link SELECT policy is gated by merchants_can_view_favorite(); extend
-- it so the default favorite's brand rows are readable by everyone too. Keeps a
-- single source of truth for "can view" instead of adding a parallel policy.
CREATE OR REPLACE FUNCTION public.merchants_can_view_favorite(fav_id uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM merchant_favorite f
    WHERE f.id = fav_id
      AND (
        f.owner_user_id = public.merchants_current_user_id()
        OR f.is_default
      )
  ) OR EXISTS (
    SELECT 1 FROM merchant_favorite_share s
    WHERE s.favorite_id = fav_id
      AND s.user_id = public.merchants_current_user_id()
  );
END;
$function$;

-- Flag the curated "OREP" favorite as the org default.
UPDATE merchant_favorite
  SET is_default = true
  WHERE id = '7bab4ef9-6dd3-47f8-b554-b78e8c488c5a';
