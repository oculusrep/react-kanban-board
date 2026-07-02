-- Fix: RLS insert kept rejecting favorites created from the client because
-- the client's cached `userTableId` didn't always match what
-- `merchants_current_user_id()` returned at request time. Rather than trust
-- the client to send the right value, derive it in the DB from the JWT.
--
-- The RLS INSERT policy still enforces (owner_user_id = merchants_current_user_id())
-- so no security regression — this just guarantees the values agree by
-- construction.

ALTER TABLE merchant_favorite
  ALTER COLUMN owner_user_id SET DEFAULT public.merchants_current_user_id();

COMMENT ON COLUMN merchant_favorite.owner_user_id IS
  'The "user".id of the favorite owner. Defaulted from merchants_current_user_id() so clients don''t need to (and can''t incorrectly) supply it.';
