-- Deletion hysteresis. A single run's silence is not evidence an obligation is
-- gone: the 2026-10-10 runs showed ~5% of rows churning per run from model
-- non-determinism on borderline conversations, and two rows the owner had
-- confirmed as real and open were deleted on one run's judgement. A row now has
-- to be missed TWICE before it is retired, and any run that returns it resets
-- the counter.
ALTER TABLE public.commitment ADD COLUMN IF NOT EXISTS missed_runs integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.commitment.missed_runs IS
  'Consecutive extraction runs that did not return this obligation. Deleted at >= 2; any run that returns it resets to 0. One run''s silence is model noise, not evidence.';
