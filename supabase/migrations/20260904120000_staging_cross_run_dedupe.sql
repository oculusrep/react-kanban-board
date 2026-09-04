-- Market Research — detect duplicates against OTHER RUNS' PENDING STAGING ROWS.
--
-- The gap this closes (documented in docs/MARKET_RESEARCH_DISCOVERY_SOURCE.md,
-- "Same-window re-runs are a dedupe gap"):
--
-- submit_research_report's duplicate probe only ever queried committed
-- municipal_project rows. Two runs staged before either is approved are
-- therefore invisible to each other BY CONSTRUCTION — there is nothing
-- committed yet to match against.
--
-- Observed 2026-08-10: runs a14c3e7b (20:39) and ee1be095 (20:45), six minutes
-- apart over the same Hall County scope, independently staged the same four BOC
-- agenda items (items 2730 / 2468 / 2512 / 2579) under different project names.
-- matched_existing_id was false on all 14 rows; the soft proximity check did not
-- flag them either (names and addresses differed). Approving both would have
-- created four duplicate projects, and the
-- ON CONFLICT (municipality_id, address, project_name, phase_label) key would
-- not have stopped it because both name AND address differed.
--
-- Why this is now a priority rather than an edge case: Deep Sweep fires six
-- chunks that each stage independently into the same sweep. Overlapping
-- pending runs are the NORMAL case for a multi-chunk sweep, not an anomaly.
--
-- Design notes:
--
--   * NEW COLUMN, not a reuse of matched_existing_id. That column is a FK to
--     municipal_project and, more importantly, approve_research_staging_rows
--     branches on it to mark a row 'approved' WITHOUT committing anything.
--     Overloading it would make cross-run duplicates silently vanish at
--     approval instead of being resolved by a human. This flag is ADVISORY: it
--     changes nothing about approval, it only surfaces the collision for the
--     reviewer, who resolves it with the existing keep-one control.
--
--   * permit_url first, exactly as the committed probe does. It is the
--     strongest signal available and it is exact — it would have caught all
--     four rows in the incident above, where the name/address probe could not.
--
--   * Other runs only (research_run_id <> p_run_id). A run's own prior pending
--     rows are deleted by the replace-on-resubmit step immediately above, so
--     matching against them would be matching against rows that no longer
--     exist.
--
--   * Oldest pending match wins, so the pointer runs newest -> oldest and the
--     first-staged row reads as the keeper.
--
--   * ON DELETE SET NULL is REQUIRED, not tidiness. submit_research_report
--     DELETEs a run's pending rows on resubmit; under the default RESTRICT, a
--     pointer from another run would make that DELETE fail and break every
--     agent retry on an overlapping window.

-- ---- 1: column -----------------------------------------------------------
ALTER TABLE public.municipal_project_staging
  ADD COLUMN IF NOT EXISTS duplicate_of_staging_id uuid;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'municipal_project_staging_duplicate_of_fkey'
       AND conrelid = 'public.municipal_project_staging'::regclass
  ) THEN
    ALTER TABLE public.municipal_project_staging
      ADD CONSTRAINT municipal_project_staging_duplicate_of_fkey
      FOREIGN KEY (duplicate_of_staging_id)
      REFERENCES public.municipal_project_staging(id)
      ON DELETE SET NULL;
  END IF;
END $$;

COMMENT ON COLUMN public.municipal_project_staging.duplicate_of_staging_id IS
  'Another run''s PENDING staging row that this candidate appears to duplicate (permit_url match first, then municipality + project_name + address). Advisory only — it does not affect approval; the reviewer resolves it. Distinct from matched_existing_id, which points at a COMMITTED municipal_project and does suppress the commit. Nulled automatically if the pointed-to row is deleted.';

-- Probe support. The table is small today, but a six-chunk Deep Sweep runs this
-- probe once per candidate against every other chunk's pending rows.
CREATE INDEX IF NOT EXISTS municipal_project_staging_pending_permit_url_idx
  ON public.municipal_project_staging (lower(btrim(permit_url)))
  WHERE approval_state = 'pending' AND permit_url IS NOT NULL;

CREATE INDEX IF NOT EXISTS municipal_project_staging_pending_name_addr_idx
  ON public.municipal_project_staging (municipality_id, lower(btrim(project_name)), lower(btrim(address)))
  WHERE approval_state = 'pending';

-- ---- 2: submit_research_report gains the cross-run probe ------------------
-- Rebuilt from the CURRENT live definition (pg_get_functiondef, 2026-09-04),
-- per the CLAUDE.md rule — not from any migration file.
CREATE OR REPLACE FUNCTION public.submit_research_report(
  p_run_id               uuid,
  p_candidates           jsonb,
  p_needs_review         text   DEFAULT NULL,
  p_alt_avenues          text   DEFAULT NULL,
  p_estimated_cost_cents integer DEFAULT NULL,
  p_input_tokens         bigint  DEFAULT NULL,
  p_output_tokens        bigint  DEFAULT NULL
) RETURNS integer
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
      matched_existing_id, duplicate_of_staging_id, approval_state
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
      r.matched_existing_id, r.duplicate_of_staging_id, 'pending'
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

-- ---- 3: surface the collision to the reviewer ----------------------------
-- Returns the pointer plus enough about the OTHER row to decide without
-- leaving the screen: its name, its run, and which sweep chunk staged it.
DROP FUNCTION IF EXISTS public.get_sweep_staging(uuid);

CREATE FUNCTION public.get_sweep_staging(p_sweep_id uuid)
RETURNS TABLE(
  id uuid, research_run_id uuid, sweep_chunk_index integer,
  boundary_municipality_id uuid, muni_name text, muni_kind text,
  matched_existing_id uuid, approval_state text, project_name text, address text,
  location_description text, parcel_boundary_notes text, total_housing_units integer,
  builder_developer text, permit_url text, permit_application_date date,
  source text, discovery_source text, discovery_source_raw text, notes text,
  reject_reason text,
  duplicate_of_staging_id uuid, duplicate_of_project_name text,
  duplicate_of_run_id uuid, duplicate_of_chunk_index integer
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.id, s.research_run_id, r.sweep_chunk_index,
    s.boundary_municipality_id, bm.name, bm.kind,
    s.matched_existing_id, s.approval_state,
    s.project_name, s.address, s.location_description, s.parcel_boundary_notes,
    s.total_housing_units, s.builder_developer, s.permit_url,
    s.permit_application_date, s.source, s.discovery_source, s.discovery_source_raw,
    s.notes, s.reject_reason,
    s.duplicate_of_staging_id, d.project_name, d.research_run_id, dr.sweep_chunk_index
  FROM municipal_project_staging s
  JOIN research_run r ON r.id = s.research_run_id AND r.sweep_id = p_sweep_id
  LEFT JOIN boundary_municipality bm ON bm.id = s.boundary_municipality_id
  LEFT JOIN municipal_project_staging d ON d.id = s.duplicate_of_staging_id
  LEFT JOIN research_run dr ON dr.id = d.research_run_id
  ORDER BY bm.name, r.sweep_chunk_index, s.created_at;
$function$;

GRANT EXECUTE ON FUNCTION public.get_sweep_staging(uuid) TO authenticated;

-- ---- 4: cross-run duplicate report ---------------------------------------
-- Standing view of unresolved cross-run collisions, so a sweep can be checked
-- for this class of duplicate without opening the approval modal.
CREATE OR REPLACE VIEW public.staging_cross_run_duplicate
WITH (security_invoker = true) AS
SELECT
  s.id                     AS staging_id,
  s.research_run_id,
  s.project_name,
  s.address,
  s.permit_url,
  s.total_housing_units,
  d.id                     AS duplicate_of_staging_id,
  d.research_run_id        AS duplicate_of_run_id,
  d.project_name           AS duplicate_of_project_name,
  d.address                AS duplicate_of_address,
  d.total_housing_units    AS duplicate_of_units,
  CASE
    WHEN s.permit_url IS NOT NULL AND d.permit_url IS NOT NULL
     AND lower(btrim(s.permit_url)) = lower(btrim(d.permit_url)) THEN 'permit_url'
    ELSE 'name_address'
  END                      AS matched_on,
  s.created_at
FROM municipal_project_staging s
JOIN municipal_project_staging d ON d.id = s.duplicate_of_staging_id
WHERE s.approval_state = 'pending'
  AND d.approval_state = 'pending'
ORDER BY s.created_at DESC;

COMMENT ON VIEW public.staging_cross_run_duplicate IS
  'Pending staging rows that duplicate a pending row from a DIFFERENT research run, with the row they duplicate. Empty = no unresolved cross-run collisions. Populated by submit_research_report''s cross-run probe (2026-09-04); rows staged before that date have duplicate_of_staging_id NULL and will not appear.';

GRANT SELECT ON public.staging_cross_run_duplicate TO authenticated, service_role;
