-- Phase 2: reassign mis-attributed merchant_location rows to the brand their
-- Places name actually names, with a full audit trail.
--
-- Background: upsertMerchantLocation keys on google_place_id alone and never
-- sets brand_id, so locations that Google's over-permissive text search
-- returned for the WRONG brand in April/June 2026 (before the name-match
-- filter shipped on 2026-07-02) are stuck under that brand forever — the
-- correct brand's ingest updates the wrong row instead of inserting its own.
--
-- Rule (approved after three dry-run iterations):
--   * in scope   : excluded_at IS NULL AND verified_at IS NULL, and the row's
--                  CURRENT brand fails the shipped nameMatchesBrand (full name
--                  OR "minus last word" stem) — i.e. the map already hides it
--   * reassign   : exactly ONE active brand matches under the strict rule
--   * strict rule: brand name stripped to alphanumerics, [^a-zA-Z0-9]*
--                  permitted between EVERY character, anchored \y...\y
--   * leave alone: 2+ candidates (4 rows, all T-Mobile-family), or none
--
-- Why the strict rule is character-level and boundary-anchored — both
-- halves were learned the hard way in dry runs:
--   * plain substring matching let Del Taco ("deltaco") claim "Delta
--     Community Credit Union", and Apple claim "Crabapple"/"Pineapple Park"
--   * a boundary regex tokenised on the BRAND's punctuation breaks
--     asymmetrically: brand "Wendy's" vs place "Wendys", brand "Ollies" /
--     "TJ Maxx" vs place "Ollie's" / "T.J. Maxx". That version silently
--     dropped 44 legitimate Wendy's rows.
--
-- Expected: 1,132 rows reassigned. verified_* and excluded rows untouched.
--
-- Docs: docs/MERCHANT_BRAND_REASSIGNMENT_PROPOSAL.md

-- The boundary regex over ~6.6k candidate rows x 403 brands needs more than
-- the default statement timeout.
SET statement_timeout = '900s';

-- ---------------------------------------------------------------------------
-- Audit table — makes the whole batch reversible in one statement.
-- ---------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.merchant_location_brand_reassignment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id     uuid NOT NULL REFERENCES public.merchant_location(id) ON DELETE CASCADE,
  old_brand_id    uuid NOT NULL REFERENCES public.merchant_brand(id),
  new_brand_id    uuid NOT NULL REFERENCES public.merchant_brand(id),
  -- Snapshot of the name the decision was made on. merchant_location.name is
  -- overwritten by every re-ingest, so without this the audit row could not
  -- be judged after the fact.
  places_name     text NOT NULL,
  reason          text NOT NULL,
  reassigned_at   timestamptz NOT NULL DEFAULT now(),
  reassigned_by   uuid REFERENCES public."user"(id)
);

CREATE INDEX IF NOT EXISTS idx_mlbr_location ON public.merchant_location_brand_reassignment(location_id);
CREATE INDEX IF NOT EXISTS idx_mlbr_batch    ON public.merchant_location_brand_reassignment(reassigned_at);

ALTER TABLE public.merchant_location_brand_reassignment ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All authenticated users can read reassignments"
  ON public.merchant_location_brand_reassignment;
CREATE POLICY "All authenticated users can read reassignments"
  ON public.merchant_location_brand_reassignment
  FOR SELECT TO authenticated USING (true);

-- Read-only from the app: writes happen in migrations / service_role only.
REVOKE ALL ON public.merchant_location_brand_reassignment FROM anon, authenticated;
GRANT SELECT ON public.merchant_location_brand_reassignment TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_location_brand_reassignment TO service_role;

-- ---------------------------------------------------------------------------
-- The reassignment.
-- ---------------------------------------------------------------------------

WITH br AS MATERIALIZED (
  SELECT b.id, b.name,
         lower(regexp_replace(COALESCE(NULLIF(trim(b.places_display_name),''), b.name),
                              '[^a-zA-Z0-9]','','g')) AS n_full,
         CASE WHEN array_length(regexp_split_to_array(
                    trim(COALESCE(NULLIF(trim(b.places_display_name),''), b.name)),'\s+'),1) > 1
              THEN lower(regexp_replace(array_to_string(
                     (regexp_split_to_array(trim(COALESCE(NULLIF(trim(b.places_display_name),''), b.name)),'\s+'))
                       [1:array_length(regexp_split_to_array(
                          trim(COALESCE(NULLIF(trim(b.places_display_name),''), b.name)),'\s+'),1)-1],
                     ''),'[^a-zA-Z0-9]','','g')) END AS n_stem,
         '\y' || array_to_string(
             regexp_split_to_array(
               regexp_replace(COALESCE(NULLIF(trim(b.places_display_name),''), b.name),
                              '[^a-zA-Z0-9]','','g'), ''),
             '[^a-zA-Z0-9]*') || '\y' AS rx
  FROM public.merchant_brand b
  WHERE b.is_active
), loc AS MATERIALIZED (
  SELECT l.id, l.brand_id, l.name,
         lower(regexp_replace(l.name,'[^a-zA-Z0-9]','','g')) AS n_place
  FROM public.merchant_location l
  WHERE l.excluded_at IS NULL
    AND l.verified_at IS NULL
), mismatched AS MATERIALIZED (
  SELECT loc.* FROM loc JOIN br ON br.id = loc.brand_id
  WHERE NOT ((length(br.n_full) >= 3 AND position(br.n_full IN loc.n_place) > 0)
          OR (br.n_stem IS NOT NULL AND length(br.n_stem) >= 4
              AND position(br.n_stem IN loc.n_place) > 0))
), cand AS MATERIALIZED (
  -- cheap normalized-substring prefilter, then the boundary regex
  SELECT m.id AS loc_id, m.brand_id AS old_brand, m.name AS places_name, br.id AS new_brand
  FROM mismatched m
  JOIN br ON length(br.n_full) >= 5
         AND position(br.n_full IN m.n_place) > 0
  WHERE m.name ~* br.rx
), plan AS MATERIALIZED (
  SELECT loc_id, old_brand, places_name,
         count(*) AS n_matches, (array_agg(new_brand))[1] AS new_brand
  FROM cand GROUP BY loc_id, old_brand, places_name
), applied AS (
  UPDATE public.merchant_location l
     SET brand_id = p.new_brand
    FROM plan p
   WHERE l.id = p.loc_id
     AND p.n_matches = 1
     AND l.brand_id = p.old_brand   -- re-assert: never move a row twice
  RETURNING l.id, p.old_brand, p.new_brand, p.places_name
)
INSERT INTO public.merchant_location_brand_reassignment
  (location_id, old_brand_id, new_brand_id, places_name, reason, reassigned_by)
SELECT a.id, a.old_brand, a.new_brand, a.places_name,
       'bulk-2026-09-30: current brand failed the name-match filter; exactly one active brand matched under the boundary rule',
       (SELECT id FROM public."user" WHERE email = 'mike@oculusrep.com')
FROM applied a;
