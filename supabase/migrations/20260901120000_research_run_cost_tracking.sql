-- Market Research Agent — per-run cost / token accounting.
--
-- Motivation: a source-attribution analysis of the last 10 research_runs
-- (2026-09-01) needed cost-per-run to decide which research phases to cut and
-- found that NO cost, token, or spend column existed anywhere on the research
-- tables. The only cost column in the database was
-- google_places_api_log.estimated_cost_cents, which is unrelated. This adds the
-- accounting columns so the question is answerable going forward.
--
--   estimated_cost_cents — integer cents (not numeric dollars) to keep the
--                          column exact and summable without float drift.
--   input_tokens         — bigint; a deep sweep chunk can read a lot of PDF.
--   output_tokens        — bigint, same reasoning.
--
-- All three nullable: every existing research_run row predates this and stays
-- valid with NULL, which reads correctly as "not measured" rather than "free".
--
-- NOT added to research_sweep_chunk. A chunk does not incur cost independently
-- of a run: research_sweep_chunk is strictly 1:1 with research_run
-- (verified 2026-09-01: 30 chunks / 30 distinct research_run_id / max 1 chunk
-- per run), and each chunk's work IS its research_run. Per-chunk cost is
-- therefore chunk -> research_run_id -> research_run.estimated_cost_cents.
-- Duplicating the columns onto the chunk table would create two places to write
-- the same number and a reconciliation problem the moment they disagree.
--
-- POPULATION PATH — read this before assuming these columns will fill
-- themselves. Nothing on the OVIS side knows what a run cost:
--   * ovis-research-trigger POSTs the run to OpenClaw and reads back only
--     `openclaw_run_id`; the response carries no usage data.
--   * ovis-research-mcp exposes no usage/telemetry tool.
--   * ovis-sweep-tick only advances chunk state.
-- The token counts live in the OpenClaw agent's own LLM responses, on the far
-- side of that HTTP boundary. So this migration adds the WRITE PATH but cannot
-- add the numbers: submit_research_report gains three optional parameters that
-- the agent may pass on its single end-of-run write. Until the OpenClaw side
-- sends them, these columns stay NULL. That change is Mike's, not this
-- migration's. See the note at the bottom of this file for the exact payload.

-- ---- 1: columns ----------------------------------------------------------
ALTER TABLE public.research_run
  ADD COLUMN IF NOT EXISTS estimated_cost_cents integer,
  ADD COLUMN IF NOT EXISTS input_tokens         bigint,
  ADD COLUMN IF NOT EXISTS output_tokens        bigint;

COMMENT ON COLUMN public.research_run.estimated_cost_cents IS
  'Estimated total LLM/tool cost of this research run, in integer cents. NULL = not measured (all runs before 2026-09-01, and any run whose agent did not report usage). Populated by the agent via submit_research_report(p_estimated_cost_cents := ...).';
COMMENT ON COLUMN public.research_run.input_tokens IS
  'Total input/prompt tokens consumed by this research run. NULL = not measured. Populated via submit_research_report(p_input_tokens := ...).';
COMMENT ON COLUMN public.research_run.output_tokens IS
  'Total output/completion tokens produced by this research run. NULL = not measured. Populated via submit_research_report(p_output_tokens := ...).';

-- Sanity guards: cost/tokens are non-negative. Cheap, and catches a sign error
-- in the agent's accounting before it poisons a SUM().
ALTER TABLE public.research_run
  DROP CONSTRAINT IF EXISTS research_run_cost_nonneg;
ALTER TABLE public.research_run
  ADD CONSTRAINT research_run_cost_nonneg CHECK (
    (estimated_cost_cents IS NULL OR estimated_cost_cents >= 0)
    AND (input_tokens  IS NULL OR input_tokens  >= 0)
    AND (output_tokens IS NULL OR output_tokens >= 0)
  );

-- ---- 2: submit_research_report accepts optional usage ---------------------
-- Rebuilt from the CURRENT live definition (pg_get_functiondef, 2026-09-01),
-- NOT from an older migration file — the live body has accumulated the
-- defensive numeric casts, the per-run idempotency guard, the
-- replace-on-resubmit DELETE, and the permit_url duplicate probe, all of which
-- would be silently lost by rebuilding from 20260629170000.
--
-- The 4-arg signature is DROPped rather than left in place: adding
-- defaulted parameters would leave two overloads resolvable by the same
-- 4-argument call, and PostgREST would 300-error on the ambiguity.
DROP FUNCTION IF EXISTS public.submit_research_report(uuid, jsonb, text, text);

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
      -- Dup detection. COALESCE two probes, strongest first:
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
      ) AS matched_existing_id
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
      matched_existing_id, approval_state
    )
    SELECT
      p_run_id, r.bm_id, r.municipality_id,
      r.project_name, r.address, r.phase_label,
      r.location_description, r.parcel_boundary_notes,
      r.single_family_lots, r.townhouse_units, r.duplex_units, r.apt_units, r.cottage_units,
      r.total_housing_units,
      r.zoning, r.zoning_approval_date, r.notes, r.raw_stages, r.status_stage_id,
      r.builder_developer, r.permit_url, r.permit_application_date, r.source,
      r.matched_existing_id, 'pending'
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

COMMENT ON FUNCTION public.submit_research_report(uuid, jsonb, text, text, integer, bigint, bigint) IS
  'Single batched end-of-run write for the market research agent. The three trailing usage parameters are OPTIONAL; when omitted the run''s cost columns are left as-is (NULL for a run whose agent never reported usage). OpenClaw must send them for cost tracking to work — nothing on the OVIS side can derive them.';

-- ---- 3: OpenClaw-side payload (NOT applied by this migration) -------------
-- For the columns above to stop being NULL, the OpenClaw agent's existing
-- end-of-run submit_research_report call must add three keys:
--
--   {
--     "research_run_id":   "...",
--     "candidate_records": [ ... ],
--     "needs_review":      "...",
--     "alt_avenues":       "...",
--     "estimated_cost_cents": 1843,     <-- new, integer cents
--     "input_tokens":         2140338,  <-- new
--     "output_tokens":          51204   <-- new
--   }
--
-- Omitting them is safe and changes nothing. This is an OpenClaw-side change
-- and is explicitly out of scope here.
