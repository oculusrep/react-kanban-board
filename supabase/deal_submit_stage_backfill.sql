-- One-off backfill: align existing site_submit.submit_stage_id to deal.stage_id
-- via the deal_submit_stage_map mapping. Deal-authoritative.
--
-- Exclusion rules (three) — skip a pair when any of these apply:
--   1. Deal says 'Lost' but site is at anything other than 'Lost / Killed'.
--      Human review — deal side may be premature, or site captures a more
--      specific rejection reason (Pass, Use Declined, Use Conflict).
--   2. Site says 'Lost / Killed' but deal is not 'Lost'. Contradiction — one
--      of the two is wrong.
--   3. Site is at an unmapped stage (e.g. 'Closed - Under Construction').
--      These stages exist to capture site-side nuance the deal side can't
--      represent; overwriting them loses information.
--
-- All skipped pairs are enumerated by scripts/deal_submit_stage_outliers.sql
-- for human review.
--
-- Run AFTER the 20260714120000_deal_submit_stage_sync.sql migration.
-- Wrapped in a transaction — the SELECT before the UPDATE shows what will
-- change. Review, then COMMIT (or ROLLBACK).
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/deal_submit_stage_backfill.sql

BEGIN;

-- Preview counts
WITH candidates AS (
  SELECT
    ss.id                             AS site_submit_id,
    dsm.submit_stage_id               AS target_submit_stage_id,
    ds.label                          AS deal_stage_label,
    css.name                          AS current_submit_stage_name,
    css.id                            AS current_submit_stage_id
  FROM public.site_submit ss
  JOIN public.deal d                        ON d.id = ss.deal_id
  JOIN public.deal_stage ds                 ON ds.id = d.stage_id
  JOIN public.deal_submit_stage_map dsm     ON dsm.deal_stage_id = d.stage_id
  LEFT JOIN public.submit_stage css         ON css.id = ss.submit_stage_id
  WHERE ss.submit_stage_id IS DISTINCT FROM dsm.submit_stage_id
),
site_is_mapped AS (
  SELECT id FROM public.submit_stage
  WHERE id IN (SELECT submit_stage_id FROM public.deal_submit_stage_map)
),
eligible AS (
  SELECT c.site_submit_id, c.target_submit_stage_id
  FROM candidates c
  WHERE
    -- Rule 1: deal Lost, site active → skip
    NOT (
      c.deal_stage_label = 'Lost'
      AND (c.current_submit_stage_name IS NULL OR c.current_submit_stage_name <> 'Lost / Killed')
    )
    -- Rule 2: site Lost/Killed, deal active → skip
    AND NOT (
      c.current_submit_stage_name = 'Lost / Killed'
      AND c.deal_stage_label <> 'Lost'
    )
    -- Rule 3: site at an unmapped stage → skip (protects Closed-Under-Construction etc.)
    AND (
      c.current_submit_stage_id IS NULL  -- null current is fine; we're moving it into the mapping
      OR c.current_submit_stage_id IN (SELECT id FROM site_is_mapped)
    )
)
SELECT 'Will update' AS action, COUNT(*) AS row_count FROM eligible
UNION ALL
SELECT 'Skipped (human review needed)' AS action, COUNT(*) AS row_count
FROM candidates c
WHERE NOT EXISTS (SELECT 1 FROM eligible e WHERE e.site_submit_id = c.site_submit_id);

-- Apply — same predicates
WITH eligible AS (
  SELECT
    ss.id                             AS site_submit_id,
    dsm.submit_stage_id               AS target_submit_stage_id
  FROM public.site_submit ss
  JOIN public.deal d                        ON d.id = ss.deal_id
  JOIN public.deal_stage ds                 ON ds.id = d.stage_id
  JOIN public.deal_submit_stage_map dsm     ON dsm.deal_stage_id = d.stage_id
  LEFT JOIN public.submit_stage css         ON css.id = ss.submit_stage_id
  WHERE ss.submit_stage_id IS DISTINCT FROM dsm.submit_stage_id
    AND NOT (
      ds.label = 'Lost'
      AND (css.name IS NULL OR css.name <> 'Lost / Killed')
    )
    AND NOT (
      css.name = 'Lost / Killed'
      AND ds.label <> 'Lost'
    )
    AND (
      css.id IS NULL
      OR css.id IN (SELECT submit_stage_id FROM public.deal_submit_stage_map)
    )
)
UPDATE public.site_submit ss
   SET submit_stage_id = e.target_submit_stage_id
  FROM eligible e
 WHERE ss.id = e.site_submit_id;

-- Review the counts printed above, then:
--   COMMIT;   (default below)
-- or:
--   ROLLBACK;
COMMIT;
