-- "Fill missing units" rerun: a rejected-for-no-count row is restored to
-- pending so dedupe and the estimator can see it. Its original rejection is
-- parked here; if it still gets no count it goes back to rejected with exactly
-- that reason, and the column is cleared either way.
-- Doc: docs/MARKET_RESEARCH_UNIT_ESTIMATES.md (Fill missing units)
ALTER TABLE public.municipal_project_staging ADD COLUMN fill_restored jsonb;
