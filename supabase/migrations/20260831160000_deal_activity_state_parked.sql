-- ============================================================================
-- Starbucks Deal Board — Parked state (decisions §2.24)
--
-- "Parked" = a deal waiting on something long-horizon (e.g. landlord confirming
-- water/sewer feasibility) — no chasing needed, shouldn't burn on the board.
--
-- Board-owned, NOT a deal_stage: parking cuts across stages, and the deal's real
-- stage (and its site_submit) is unchanged so the client site report stays
-- accurate. A deal can be parked at Pre-Submittal, Submitted-Reviewing, or
-- Negotiating LOI.
--
-- Requires a review date (parked_until) — no indefinite parking. While
-- parked_until is in the future the deal is off the board; on/after that date it
-- returns in whatever column its stage puts it, with the clock running from the
-- review date (the park action sets ball_in_court_since = parked_until, so
-- days-since counts from then once it returns).
-- ============================================================================

ALTER TABLE deal_activity_state
  ADD COLUMN IF NOT EXISTS parked_until DATE;

COMMENT ON COLUMN deal_activity_state.parked_until IS
  'Review date for a parked deal. While in the future the deal is off the board (excluded from columns + the daily number, shown in the Parking lot). On/after this date it returns. NULL = not parked.';
