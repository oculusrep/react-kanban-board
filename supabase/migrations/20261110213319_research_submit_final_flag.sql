-- submit_research_report: checkpoint vs final.
--
-- WHY: the agent now submits cumulatively after each municipality so a run that
-- dies mid-flight keeps what it found (Senoia 01b79c02, 2026-11-10: three munis
-- marked complete, 7 projects noted, then the agent stopped before its single
-- end-of-run submit and everything was lost). But every call used to flip the run
-- to awaiting_review, which (a) makes advance_sweep mark a Deep Sweep chunk done
-- and fire the next chunk on top of a still-running agent, and (b) opens the run
-- for review mid-flight, so a reviewer action makes every later checkpoint fail
-- with run_already_reviewed.
--
-- WHAT:
--   1. submit_research_report gains p_final boolean DEFAULT false.
--        final = false  -> checkpoint. Replaces the staged set, run -> 'running'
--                          (never moves an awaiting_review run backwards).
--        final = true   -> the only path to 'awaiting_review'.
--      A forgotten flag leaves the run open; reap_orphaned_research_runs closes
--      it after 90 min idle and the staged rows stay.
--      Also: the run row is locked FOR UPDATE (serializes concurrent submits on
--      one run, which the DELETE+INSERT replace was not safe against), and
--      submits to cancelled / approved / archived runs are refused instead of
--      silently reopening them.
--      Returns jsonb {staged_count, final, state} instead of int.
--   2. Guard trigger: a staging row whose run is 'pending' or 'running' cannot be
--      changed by a review action. Covers every review RPC (approve, reject,
--      unreject, merge, unmerge, not-duplicate) and anything added later,
--      including approve_research_staging_rows, which never checked run state.
--      Updates that only touch duplicate_of_staging_id / merged_into_staging_id
--      are allowed: those are the ON DELETE SET NULL cascades fired when another
--      run's checkpoint replaces its rows.
--
-- advance_sweep is unchanged: it only advances on awaiting_review / approved /
-- archived (done) or failed / cancelled (failed). With (1), a checkpointed run
-- stays 'running', so the engine waits; with (2), approved/archived can no
-- longer be reached from an in-flight run.

-- ---------------------------------------------------------------------------
-- 1. submit_research_report(…, p_final)
-- ---------------------------------------------------------------------------
-- The signature changes, so DROP the 7-arg version rather than leave an
-- overload PostgREST would have to disambiguate.
DROP FUNCTION IF EXISTS public.submit_research_report(uuid, jsonb, text, text, integer, bigint, bigint);

CREATE FUNCTION public.submit_research_report(
  p_run_id               uuid,
  p_candidates           jsonb,
  p_needs_review         text    DEFAULT NULL::text,
  p_alt_avenues          text    DEFAULT NULL::text,
  p_estimated_cost_cents integer DEFAULT NULL::integer,
  p_input_tokens         bigint  DEFAULT NULL::bigint,
  p_output_tokens        bigint  DEFAULT NULL::bigint,
  p_final                boolean DEFAULT false
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_inserted        int := 0;
  v_off_checklist   int := 0;
  v_off_ids         uuid[];
  v_reviewed        int := 0;
  v_prior_state     text;
  v_final           boolean := COALESCE(p_final, false);
  v_new_state       text;
BEGIN
  -- Lock the run row. Serializes concurrent submits for the same run (the
  -- DELETE + INSERT replace below is not safe against two interleaved calls)
  -- and pins the state we decide on.
  SELECT state INTO v_prior_state
    FROM research_run
   WHERE id = p_run_id
   FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'research_run_not_found: %', p_run_id;
  END IF;

  -- A human closed this run. Don't reopen it.
  IF v_prior_state IN ('cancelled', 'approved', 'archived') THEN
    RAISE EXCEPTION 'run_closed: run % is %; refusing to stage. Start a new research_run instead.',
      p_run_id, v_prior_state;
  END IF;

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

  -- Idempotency guard (per run). If a human has already acted on this run's
  -- staging rows, refuse to re-stage. Can only trip after a final submit: the
  -- in-flight guard trigger blocks review actions while the run is running.
  SELECT COUNT(*) INTO v_reviewed
  FROM municipal_project_staging
  WHERE research_run_id = p_run_id
    AND approval_state <> 'pending';
  IF v_reviewed > 0 THEN
    RAISE EXCEPTION 'run_already_reviewed: run % has % staging row(s) already approved/rejected; refusing to re-stage. Start a new research_run instead.',
      p_run_id, v_reviewed;
  END IF;

  -- Replace-on-resubmit: drop this run's prior PENDING rows; the batch below
  -- becomes the authoritative staged set. Each call must therefore carry every
  -- record found so far (checkpoints are cumulative, not deltas).
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

  -- State. Only a final submit opens the run for review. A checkpoint keeps it
  -- 'running' (pending -> running on the first one; a reaped 'failed' run that
  -- turns out to be alive is revived), and never pulls an already-final
  -- awaiting_review run backwards.
  v_new_state := CASE
    WHEN v_final                          THEN 'awaiting_review'
    WHEN v_prior_state = 'awaiting_review' THEN 'awaiting_review'
    ELSE 'running'
  END;

  -- needs_review / alt_avenues are overwritten on every call (a checkpoint
  -- carries them cumulatively, like the records). Usage is COALESCE-with-
  -- existing so a call that omits it does not blank an earlier figure.
  -- The UPDATE also bumps updated_at (trigger), which is what
  -- research_run_last_activity reads: every checkpoint resets the reaper's
  -- 90-min idle clock and the sweep engine's stall clock.
  UPDATE research_run
     SET state         = v_new_state,
         needs_review  = p_needs_review,
         alt_avenues   = p_alt_avenues,
         completed_at  = CASE
                           WHEN v_final                    THEN now()
                           WHEN v_new_state = 'awaiting_review' THEN completed_at
                           ELSE NULL
                         END,
         estimated_cost_cents = COALESCE(p_estimated_cost_cents, estimated_cost_cents),
         input_tokens         = COALESCE(p_input_tokens,         input_tokens),
         output_tokens        = COALESCE(p_output_tokens,        output_tokens)
   WHERE id = p_run_id;

  RETURN jsonb_build_object(
    'staged_count', v_inserted,
    'final',        v_final,
    'state',        v_new_state);
END;
$function$;

-- Grants: the MCP edge function calls this with the secret key. Nobody else.
REVOKE ALL ON FUNCTION public.submit_research_report(uuid, jsonb, text, text, integer, bigint, bigint, boolean)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_research_report(uuid, jsonb, text, text, integer, bigint, bigint, boolean)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 2. No review actions on an in-flight run
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_staging_review_in_flight()
 RETURNS trigger
 LANGUAGE plpgsql
 SET search_path TO 'public'
AS $function$
DECLARE
  v_state text;
BEGIN
  -- FK ON DELETE SET NULL cascades (another run's checkpoint replacing the row
  -- this one pointed at) are not review actions. Let them through.
  IF (to_jsonb(NEW) - 'duplicate_of_staging_id' - 'merged_into_staging_id' - 'updated_at')
     IS NOT DISTINCT FROM
     (to_jsonb(OLD) - 'duplicate_of_staging_id' - 'merged_into_staging_id' - 'updated_at') THEN
    RETURN NEW;
  END IF;

  SELECT state INTO v_state FROM research_run WHERE id = OLD.research_run_id;
  IF v_state IN ('pending', 'running') THEN
    RAISE EXCEPTION 'run_in_flight: research run % is still %; its staged rows can''t be reviewed until the agent sends its final report.',
      OLD.research_run_id, v_state
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.guard_staging_review_in_flight() FROM PUBLIC, anon, authenticated;

-- Named to sort BEFORE the other BEFORE UPDATE triggers on this table
-- (parcel_numbers, set_updated_at, unit_count_review fire alphabetically), so
-- NEW holds only what the statement changed when the diff above runs.
DROP TRIGGER IF EXISTS municipal_project_staging_00_in_flight_guard ON public.municipal_project_staging;
CREATE TRIGGER municipal_project_staging_00_in_flight_guard
  BEFORE UPDATE ON public.municipal_project_staging
  FOR EACH ROW EXECUTE FUNCTION public.guard_staging_review_in_flight();
