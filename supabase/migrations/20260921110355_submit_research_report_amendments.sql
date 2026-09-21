-- Accept the amendment fields in submit_research_report.
--
-- All four are OPTIONAL: a report that omits them behaves exactly as before, so
-- the agent can adopt them without a flag day.
--
--   is_amendment        boolean   this changes an existing approval
--   units_basis         text      'delta' | 'total'  (how to read total_housing_units)
--   amends_case_number  text      the case/PUD number being amended, free text
--   prior_total         integer   unit count before the amendment, if stated
--
-- Normalized rather than trusted: units_basis of 'delta'/'total' implies
-- is_amendment, and an unrecognized units_basis becomes NULL rather than failing
-- the whole report — one bad value in a 40-candidate submission should not lose
-- the other 39.
--
-- Rebuilt from the LIVE definition (pg_get_functiondef, 2026-09-21), not from the
-- migration that first created it.

CREATE OR REPLACE FUNCTION public.submit_research_report(p_run_id uuid, p_candidates jsonb, p_needs_review text DEFAULT NULL::text, p_alt_avenues text DEFAULT NULL::text, p_estimated_cost_cents integer DEFAULT NULL::integer, p_input_tokens bigint DEFAULT NULL::bigint, p_output_tokens bigint DEFAULT NULL::bigint)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted        int := 0;
  v_off_checklist   int := 0;
  v_off_ids         uuid[];
  v_reviewed        int := 0;
BEGIN
  -- Layer-3 guard: every candidate's boundary_municipality_id must be on this
  -- run's checklist. Whole batch rejected if any are off-list.
  SELECT
    array_agg(DISTINCT (c->>'boundary_municipality_id')::uuid),
    COUNT(*)
  INTO v_off_ids, v_off_checklist
  FROM jsonb_array_elements(p_candidates) AS c
  WHERE (c->>'boundary_municipality_id')::uuid NOT IN (
    SELECT boundary_municipality_id FROM research_checklist_item WHERE research_run_id = p_run_id
  );
  IF v_off_checklist > 0 THEN
    RAISE EXCEPTION 'off_checklist_municipalities: % candidate(s) reference muni(s) not on this run''s checklist; offending boundary_municipality_ids: %',
      v_off_checklist, v_off_ids;
  END IF;

  -- Idempotency guard (per run). submit_research_report is the single end-of-run
  -- write, but an agent retry can invoke it more than once on the same run_id.
  -- If a human has already acted on this run's staging rows, refuse to re-stage.
  SELECT COUNT(*) INTO v_reviewed
  FROM municipal_project_staging
  WHERE research_run_id = p_run_id
    AND approval_state <> 'pending';
  IF v_reviewed > 0 THEN
    RAISE EXCEPTION 'run_already_reviewed: run % has % staging row(s) already approved/rejected; refusing to re-stage. Start a new research_run instead.',
      p_run_id, v_reviewed;
  END IF;

  -- Replace-on-resubmit: drop this run's prior PENDING rows so a retry can never
  -- double-stage. Fresh batch below becomes the authoritative staged set.
  -- Any other run's duplicate_of_staging_id pointing here is nulled by the FK's
  -- ON DELETE SET NULL rather than blocking this delete.
  DELETE FROM municipal_project_staging
   WHERE research_run_id = p_run_id
     AND approval_state = 'pending';

  WITH parsed AS (
    SELECT
      (c->>'boundary_municipality_id')::uuid AS bm_id,
      c->>'project_name'                     AS project_name,
      c->>'address'                          AS address,
      c->>'location_description'             AS location_description,
      c->>'parcel_boundary_notes'            AS parcel_boundary_notes,
      COALESCE(c->>'phase_label','')         AS phase_label,
      -- Defensive casts: a single malformed optional value must not abort the
      -- batch (root cause of the 2026-07-13 duplicate-staging run).
      CASE WHEN c->>'total_housing_units' ~ '^-?\d+$' THEN (c->>'total_housing_units')::int END AS total_housing_units,
      CASE WHEN c->>'single_family_lots'  ~ '^-?\d+$' THEN (c->>'single_family_lots')::int  END AS single_family_lots,
      CASE WHEN c->>'townhouse_units'     ~ '^-?\d+$' THEN (c->>'townhouse_units')::int     END AS townhouse_units,
      CASE WHEN c->>'duplex_units'        ~ '^-?\d+$' THEN (c->>'duplex_units')::int        END AS duplex_units,
      CASE WHEN c->>'apt_units'           ~ '^-?\d+$' THEN (c->>'apt_units')::int           END AS apt_units,
      CASE WHEN c->>'cottage_units'       ~ '^-?\d+$' THEN (c->>'cottage_units')::int       END AS cottage_units,
      c->>'zoning'                           AS zoning,
      CASE WHEN c->>'zoning_approval_date'    ~ '^\d{4}-\d{2}-\d{2}$' THEN (c->>'zoning_approval_date')::date    END AS zoning_approval_date,
      c->>'builder_developer'                AS builder_developer,
      c->>'permit_url'                       AS permit_url,
      CASE WHEN c->>'permit_application_date' ~ '^\d{4}-\d{2}-\d{2}$' THEN (c->>'permit_application_date')::date END AS permit_application_date,
      c->>'source'                           AS source,
      -- Optional. Normalized onto the closed set; an unrecognized value lands on
      -- 'other' instead of aborting the batch. Absent -> NULL (never defaulted).
      normalize_discovery_source(c->>'discovery_source')   AS discovery_source,
      -- ...and the original is kept whenever that coercion actually happened,
      -- so a genuinely new source type is recoverable instead of erased.
      discovery_source_unrecognized(c->>'discovery_source') AS discovery_source_raw,
      c->>'notes'                            AS notes,
      -- ---- amendment fields (all optional) ----
      -- Normalized, not trusted: a candidate that states units_basis but forgets
      -- is_amendment is still an amendment. Anything unrecognized is dropped to
      -- NULL rather than rejected, so one bad value can't fail a whole report.
      -- NOTE the outer COALESCE: with units_basis absent the IN (...) is NULL,
      -- and `false OR NULL` is NULL in SQL, not false — which would violate the
      -- NOT NULL on is_amendment for every ordinary non-amendment candidate.
      COALESCE(
        COALESCE((c->>'is_amendment')::boolean, false)
        OR lower(btrim(c->>'units_basis')) IN ('delta','total'),
        false
      )                                      AS is_amendment,
      CASE lower(btrim(c->>'units_basis'))
        WHEN 'delta' THEN 'delta'
        WHEN 'total' THEN 'total'
      END                                    AS units_basis,
      nullif(btrim(c->>'amends_case_number'), '') AS amends_case_number,
      CASE WHEN c->>'prior_total' ~ '^-?\d+$' THEN (c->>'prior_total')::int END AS prior_total,
      COALESCE(
        CASE WHEN c->>'status_stage_id' ~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$'
             THEN (c->>'status_stage_id')::uuid END,
        (SELECT id FROM project_stage
          WHERE lower(btrim(name)) = lower(btrim(c->>'status_name'))
          LIMIT 1)
      )                                      AS status_stage_id,
      COALESCE(c->'raw_stages', '{}'::jsonb) AS raw_stages
    FROM jsonb_array_elements(p_candidates) AS c
  ),
  resolved AS (
    SELECT
      p.*,
      m.id AS municipality_id,
      -- Dup detection against COMMITTED records. COALESCE two probes,
      -- strongest first:
      --   1) exact permit_url match — globally unique, municipality-agnostic;
      --      catches cross-boundary / annexation resurfacing.
      --   2) normalized (project_name, address) within the resolved municipality
      --      — the original probe, retained for candidates lacking a permit_url.
      COALESCE(
        (
          SELECT mp.id
            FROM municipal_project mp
           WHERE p.permit_url IS NOT NULL
             AND btrim(p.permit_url) <> ''
             AND lower(btrim(mp.permit_url)) = lower(btrim(p.permit_url))
           LIMIT 1
        ),
        (
          SELECT mp.id
            FROM municipal_project mp
           WHERE mp.municipality_id = m.id
             AND lower(btrim(mp.project_name)) = lower(btrim(p.project_name))
             AND lower(btrim(mp.address))      = lower(btrim(p.address))
           LIMIT 1
        )
      ) AS matched_existing_id,
      -- Dup detection against OTHER RUNS' PENDING STAGING rows. Same two probes,
      -- same order, but scoped to rows nobody has reviewed yet. This is the
      -- concurrent-run case the committed probes above cannot see: with a
      -- six-chunk Deep Sweep, nothing is committed while the chunks are staging,
      -- so two chunks covering an overlapping window would each stage the same
      -- project and neither would notice.
      --
      -- Oldest match wins so the first-staged row reads as the keeper.
      -- Advisory only: this does not suppress the insert or the later commit.
      COALESCE(
        (
          SELECT s.id
            FROM municipal_project_staging s
           WHERE s.research_run_id <> p_run_id
             AND s.approval_state = 'pending'
             AND p.permit_url IS NOT NULL
             AND btrim(p.permit_url) <> ''
             AND lower(btrim(s.permit_url)) = lower(btrim(p.permit_url))
           ORDER BY s.created_at
           LIMIT 1
        ),
        (
          SELECT s.id
            FROM municipal_project_staging s
           WHERE s.research_run_id <> p_run_id
             AND s.approval_state = 'pending'
             -- Scope on EITHER the resolved municipality OR the boundary
             -- municipality. municipality_id is NULL until a municipality row
             -- exists (it is created at approval), so scoping on it alone would
             -- silently disable this probe for exactly the new-territory sweep
             -- it is meant to protect. boundary_municipality_id is always
             -- present on a staging row. Keeping both also catches the
             -- city-inside-county case (a Grovetown row vs a Columbia County row
             -- for the same project), where the bm_ids differ but the resolved
             -- municipality may not.
             AND (
                   (m.id IS NOT NULL AND s.municipality_id = m.id)
                OR s.boundary_municipality_id = p.bm_id
             )
             AND lower(btrim(s.project_name)) = lower(btrim(p.project_name))
             AND lower(btrim(s.address))      = lower(btrim(p.address))
           ORDER BY s.created_at
           LIMIT 1
        )
      ) AS duplicate_of_staging_id
    FROM parsed p
    LEFT JOIN boundary_municipality bm ON bm.id = p.bm_id
    LEFT JOIN municipality m
      ON lower(btrim(m.name)) = lower(btrim(bm.name))
     AND m.state = bm.state
  ),
  ins AS (
    INSERT INTO municipal_project_staging (
      research_run_id, boundary_municipality_id, municipality_id,
      project_name, address, phase_label,
      location_description, parcel_boundary_notes,
      single_family_lots, townhouse_units, duplex_units, apt_units, cottage_units,
      total_housing_units,
      zoning, zoning_approval_date, notes, raw_stages, status_stage_id,
      builder_developer, permit_url, permit_application_date, source,
      discovery_source, discovery_source_raw,
      matched_existing_id, duplicate_of_staging_id, approval_state,
      is_amendment, units_basis, amends_case_number, prior_total
    )
    SELECT
      p_run_id, r.bm_id, r.municipality_id,
      r.project_name, r.address, r.phase_label,
      r.location_description, r.parcel_boundary_notes,
      r.single_family_lots, r.townhouse_units, r.duplex_units, r.apt_units, r.cottage_units,
      r.total_housing_units,
      r.zoning, r.zoning_approval_date, r.notes, r.raw_stages, r.status_stage_id,
      r.builder_developer, r.permit_url, r.permit_application_date, r.source,
      r.discovery_source, r.discovery_source_raw,
      r.matched_existing_id, r.duplicate_of_staging_id, 'pending',
      r.is_amendment, r.units_basis, r.amends_case_number, r.prior_total
    FROM resolved r
    RETURNING 1
  )
  SELECT COUNT(*) INTO v_inserted FROM ins;

  -- Usage accounting. COALESCE-with-existing so a resubmit that omits usage
  -- does not blank a figure an earlier attempt already recorded.
  UPDATE research_run
     SET state         = 'awaiting_review',
         needs_review  = p_needs_review,
         alt_avenues   = p_alt_avenues,
         completed_at  = now(),
         estimated_cost_cents = COALESCE(p_estimated_cost_cents, estimated_cost_cents),
         input_tokens         = COALESCE(p_input_tokens,         input_tokens),
         output_tokens        = COALESCE(p_output_tokens,        output_tokens)
   WHERE id = p_run_id;

  RETURN v_inserted;
END;
$function$;
