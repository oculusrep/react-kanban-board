-- ============================================================================
-- Starbucks Deal Board — manual priority ("urgent"), decisions §2.25
--
-- A separate channel from heat. Board-owned. Sorts a tile to the top of its
-- column regardless of heat, and does NOT change the heat color (heat keeps
-- meaning only "nobody has touched this").
--
-- Auto-expiring so it can't become wallpaper: marking urgent sets urgent_until
-- = now + 7 days (tunable, URGENT_TTL_DAYS); it auto-clears client-side when the
-- timestamp passes. Re-marking renews. NOT a user-picked date — urgent is a
-- "now" state, unlike parking's "defer until X".
-- ============================================================================

ALTER TABLE deal_activity_state
  ADD COLUMN IF NOT EXISTS urgent_until TIMESTAMPTZ;

COMMENT ON COLUMN deal_activity_state.urgent_until IS
  'Manual priority. While in the future the deal is "urgent" (sorts to top of its column, non-heat marker). Auto-clears when passed; re-mark to renew (default TTL 7 days). NULL = not urgent.';
