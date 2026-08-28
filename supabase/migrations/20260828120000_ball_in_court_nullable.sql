-- ============================================================================
-- Starbucks Deal Board — ball_in_court: nullable "unclassified" state
--
-- See docs/STARBUCKS_DEAL_BOARD_SPEC.md §3.2, §5.
--
-- Bug this fixes: ball_in_court was NOT NULL DEFAULT 'none', so every deal
-- nobody had classified silently rendered with the 'none' heat tolerance
-- (warm at 0-2d, hot at 3+) and the "No one owns this" chip. That conflates
-- two different things:
--   • 'none'  = a DELIBERATE human classification: genuinely parked, nobody owes.
--   • unset   = Mike hasn't said who owes yet — must NOT be heated by any
--               tolerance; it renders as "unclassified / Set the court".
--
-- Fix: ball_in_court becomes nullable with no default. NULL = unclassified.
-- The existing CHECK (ball_in_court IN (...)) already permits NULL (a NULL
-- yields UNKNOWN, which does not violate a CHECK), so it needs no change.
-- Every current row was auto-defaulted (none were human-set), so reset them
-- all to NULL.
-- ============================================================================

ALTER TABLE deal_activity_state ALTER COLUMN ball_in_court DROP NOT NULL;
ALTER TABLE deal_activity_state ALTER COLUMN ball_in_court DROP DEFAULT;

COMMENT ON COLUMN deal_activity_state.ball_in_court IS
  'NULL = unclassified (Mike has not set who owes the next move; render "Set the court", no heat). us/them/none are deliberate human classifications; none = genuinely parked, nobody owes (spec §3.2).';

-- All existing values are the auto-default, not a human choice → unclassify them.
UPDATE deal_activity_state SET ball_in_court = NULL WHERE ball_in_court = 'none';
