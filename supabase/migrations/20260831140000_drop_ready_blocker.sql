-- ============================================================================
-- Starbucks Deal Board — drop 'ready' from the blocked_on enum
--
-- See DECISIONS §2.12. 'ready' is no longer a blocker. "Ready to submit" is now
-- a DERIVED state: a Pre-Submittal deal with NO blocker that has been classified
-- (ball_in_court set). It renders in a full-width band (hot, "Submit it"), not
-- a column. blocked_on collapses to: awaiting_ll | site_control.
--
-- Prod has 0 'ready' rows; the UPDATE is a safe no-op for reproducibility.
-- ============================================================================

UPDATE deal_activity_state SET blocked_on = NULL WHERE blocked_on = 'ready';

ALTER TABLE deal_activity_state DROP CONSTRAINT IF EXISTS deal_activity_state_blocked_on_check;
ALTER TABLE deal_activity_state
  ADD CONSTRAINT deal_activity_state_blocked_on_check
  CHECK (blocked_on IS NULL OR blocked_on IN ('awaiting_ll', 'site_control'));
