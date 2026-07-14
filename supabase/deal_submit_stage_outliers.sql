-- Outliers requiring human review: pairs the backfill deliberately skips.
-- Three categories:
--   1. deal.stage = 'Lost' but site_submit.submit_stage != 'Lost / Killed'
--   2. site_submit.submit_stage = 'Lost / Killed' but deal.stage != 'Lost'
--   3. site_submit is at an unmapped stage (e.g. 'Closed - Under Construction')
--      while the deal is at a mapped stage they would otherwise be aligned to
--
-- Usage:
--   psql "$DATABASE_URL" -f scripts/deal_submit_stage_outliers.sql

WITH mapped_submit AS (
  SELECT id FROM public.submit_stage
  WHERE id IN (SELECT submit_stage_id FROM public.deal_submit_stage_map)
),
mapped_deal AS (
  SELECT id FROM public.deal_stage
  WHERE id IN (SELECT deal_stage_id FROM public.deal_submit_stage_map)
)
SELECT
  c.client_name,
  d.id                  AS deal_id,
  d.deal_name,
  ds.label              AS deal_stage,
  ss.id                 AS site_submit_id,
  ss.site_submit_name,
  css.name              AS submit_stage,
  CASE
    WHEN ds.label = 'Lost' AND (css.name IS NULL OR css.name <> 'Lost / Killed')
      THEN 'Deal Lost, site still active'
    WHEN css.name = 'Lost / Killed' AND ds.label <> 'Lost'
      THEN 'Site Lost/Killed, deal still active'
    WHEN css.id IS NOT NULL AND css.id NOT IN (SELECT id FROM mapped_submit)
      AND d.stage_id IN (SELECT id FROM mapped_deal)
      THEN 'Site at unmapped stage (e.g. Closed - Under Construction)'
    ELSE '(unclassified)'
  END AS discrepancy
FROM public.site_submit ss
JOIN public.deal d         ON d.id = ss.deal_id
LEFT JOIN public.deal_stage ds     ON ds.id = d.stage_id
LEFT JOIN public.submit_stage css  ON css.id = ss.submit_stage_id
LEFT JOIN public.client c          ON c.id = d.client_id
WHERE
  (ds.label = 'Lost' AND (css.name IS NULL OR css.name <> 'Lost / Killed'))
  OR
  (css.name = 'Lost / Killed' AND ds.label <> 'Lost')
  OR
  (
    css.id IS NOT NULL
    AND css.id NOT IN (SELECT id FROM mapped_submit)
    AND d.stage_id IN (SELECT id FROM mapped_deal)
    -- Skip pairs already covered by rules 1/2 (Lost discrepancies)
    AND NOT (ds.label = 'Lost' AND (css.name IS NULL OR css.name <> 'Lost / Killed'))
  )
ORDER BY discrepancy, c.client_name;
