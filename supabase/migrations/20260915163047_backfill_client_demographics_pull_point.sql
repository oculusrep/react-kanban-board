-- Backfill site_submit.client_demographics.pull_point where the pull coordinate is provable.
--
-- Drive-time figures depend on the exact start point (docs/ESRI_DRIVE_TIME_POINT_SENSITIVITY.md),
-- and client_demographics never stored one. From 2026-09-15 the app writes pull_point on every
-- save; this recovers it for existing records, and ONLY where the evidence is exact:
--
--   1. esri_enrichment_log: a successful call within 2 minutes before (or 10 s after) the record's
--      enriched_at whose demographics match the stored data on EVERY key. The log's latitude /
--      longitude is the requested coordinate (for a cache hit, also the cache key, so the cached
--      figures were pulled at that same rounded point).
--   2. Copied from the property: the record's enriched_at equals the property's esri_enriched_at
--      (SiteSubmitCreateForm copies property figures verbatim) and the property recorded
--      esri_enriched_latitude / longitude.
--
-- Everything else is left without pull_point; research labels those figures "pull coordinate
-- NOT RECORDED". Data only, no schema change. updated_at is not bumped: the audit trigger is
-- disabled for this statement only, inside this transaction.

CREATE TEMP TABLE _pull_point_backfill ON COMMIT DROP AS
WITH cd AS (
  SELECT ss.id, ss.property_id,
         (ss.client_demographics->>'enriched_at')::timestamptz AS enriched_at,
         ss.client_demographics->'data' AS data
    FROM site_submit ss
   WHERE ss.client_demographics IS NOT NULL
     AND ss.client_demographics->'pull_point' IS NULL
     AND jsonb_typeof(ss.client_demographics->'data') = 'object'
),
log_match AS (
  SELECT DISTINCT ON (cd.id)
         cd.id, l.latitude, l.longitude, l.called_at
    FROM cd
    JOIN esri_enrichment_log l
      ON l.success
     AND l.called_at BETWEEN cd.enriched_at - interval '2 minutes' AND cd.enriched_at + interval '10 seconds'
   WHERE NOT EXISTS (
           SELECT 1 FROM jsonb_each(cd.data) e
            WHERE e.value IS DISTINCT FROM l.demographics->e.key)
   ORDER BY cd.id, abs(extract(epoch FROM cd.enriched_at - l.called_at))
),
copied AS (
  SELECT cd.id, p.esri_enriched_latitude AS latitude, p.esri_enriched_longitude AS longitude
    FROM cd JOIN property p ON p.id = cd.property_id
   WHERE p.esri_enriched_at = cd.enriched_at
     AND p.esri_enriched_latitude IS NOT NULL AND p.esri_enriched_longitude IS NOT NULL
)
SELECT id, jsonb_build_object('latitude', latitude, 'longitude', longitude,
         'source', 'backfill:esri_enrichment_log ' || to_char(called_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')) AS pull_point
  FROM log_match
UNION ALL
SELECT c.id, jsonb_build_object('latitude', c.latitude, 'longitude', c.longitude, 'source', 'backfill:copied_from_property')
  FROM copied c
 WHERE NOT EXISTS (SELECT 1 FROM log_match m WHERE m.id = c.id);

ALTER TABLE public.site_submit DISABLE TRIGGER update_site_submit_audit_fields;

UPDATE public.site_submit ss
   SET client_demographics = jsonb_set(ss.client_demographics, '{pull_point}', b.pull_point)
  FROM _pull_point_backfill b
 WHERE b.id = ss.id;

ALTER TABLE public.site_submit ENABLE TRIGGER update_site_submit_audit_fields;
