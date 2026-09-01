-- Market Research Agent — make the discovery_source 'other' coercion lossless.
--
-- Problem this fixes: 20260901120100 added normalize_discovery_source(), which
-- maps any unrecognized agent value onto 'other' so one bad string cannot abort
-- a whole staged batch. That was the right call for batch safety, but it is
-- LOSSY in a way that quietly defeats the point of the column:
--
--   * A legitimate new source type we have not yet added to the taxonomy
--     ("county newsletter", "school board capacity study") is indistinguishable
--     from actual garbage. Both land on 'other'.
--   * Nothing anywhere would ever tell us the 7 allowed values should be 8.
--     The taxonomy could be wrong for years and every report would look clean.
--
-- Fix: keep the coercion, but preserve the original string alongside it.
--   discovery_source      — the safe, constrained, queryable value ('other')
--   discovery_source_raw  — what the agent actually said, when we coerced it
--
-- discovery_source_raw is populated ONLY when the value was not recognized.
-- For the ~99% recognized case it stays NULL, so it is not a duplicate of
-- discovery_source — it is exactly and only the taxonomy-gap signal. That makes
-- the review query trivial (see the discovery_source_taxonomy_gap view at the
-- bottom) and keeps the column meaningful rather than noisy.
--
-- Chosen over a logged warning deliberately: a NOTICE or console.warn is lost
-- the moment nobody is tailing logs, and this signal is only useful if it
-- accumulates over months. It has to be durable and queryable, so it is a
-- column.

-- ---- 1: columns ----------------------------------------------------------
ALTER TABLE public.municipal_project_staging
  ADD COLUMN IF NOT EXISTS discovery_source_raw text;

ALTER TABLE public.municipal_project
  ADD COLUMN IF NOT EXISTS discovery_source_raw text;

COMMENT ON COLUMN public.municipal_project_staging.discovery_source_raw IS
  'The agent''s ORIGINAL discovery_source string, preserved only when it was not recognized and therefore coerced to ''other''. NULL when the value was recognized (the normal case) or absent. Query it to find taxonomy gaps — values we should perhaps add to the allowed set. See the discovery_source_taxonomy_gap view.';
COMMENT ON COLUMN public.municipal_project.discovery_source_raw IS
  'The agent''s ORIGINAL discovery_source string, preserved only when it was coerced to ''other''. NULL when recognized or absent. Promoted from staging at approval; survives a reviewer override, because it records what the AGENT reported, not what the reviewer concluded.';

-- ---- 2: recognizer -------------------------------------------------------
-- Returns the original string when it is non-blank and NOT in the allowed set;
-- NULL otherwise. Kept as its own function so the allowed list is not
-- duplicated across the RPCs (normalize_discovery_source already owns it once,
-- and this defers to it rather than restating the seven values a third time).
CREATE OR REPLACE FUNCTION public.discovery_source_unrecognized(p_raw text)
RETURNS text
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_raw IS NULL OR btrim(p_raw) = '' THEN NULL
    -- Recognized inputs normalize to themselves; only a coerced value can
    -- normalize to 'other' while not literally being 'other'.
    WHEN normalize_discovery_source(p_raw) = 'other'
     AND lower(btrim(replace(p_raw, '-', '_'))) <> 'other'
      THEN btrim(p_raw)
    ELSE NULL
  END;
$function$;

COMMENT ON FUNCTION public.discovery_source_unrecognized(text) IS
  'Returns the input verbatim (trimmed) when it is a non-blank value that normalize_discovery_source() had to coerce to ''other''; NULL otherwise. Feeds discovery_source_raw so a coercion is never silent.';

-- ---- 3: recreate municipal_project_v (mp.* was expanded at creation) ------
DROP VIEW IF EXISTS public.municipal_project_v;
CREATE VIEW public.municipal_project_v
WITH (security_invoker = true) AS
SELECT
  mp.*,
  ST_Y(mp.centroid) AS centroid_lat,
  ST_X(mp.centroid) AS centroid_lng,
  CASE WHEN mp.geometry IS NULL THEN NULL::jsonb ELSE ST_AsGeoJSON(mp.geometry)::jsonb END AS geometry_geojson,
  m.name  AS municipality_name,
  m.state AS municipality_state,
  m.display_color AS municipality_display_color,
  ps.name AS computed_stage_name,
  COALESCE(mp.status_override_id, mp.status_stage_id) AS effective_stage_id,
  ps_eff.name       AS effective_stage_name,
  ps_eff.color      AS effective_stage_color,
  ps_eff.line_color AS effective_stage_line_color
FROM public.municipal_project mp
LEFT JOIN public.municipality m ON m.id = mp.municipality_id
LEFT JOIN public.project_stage ps ON ps.id = mp.status_stage_id
LEFT JOIN public.project_stage ps_eff ON ps_eff.id = COALESCE(mp.status_override_id, mp.status_stage_id);

GRANT SELECT ON public.municipal_project_v TO authenticated, anon, service_role;

-- ---- 4: get_sweep_staging exposes the raw value --------------------------
-- So the reviewer can see "the agent said X, we filed it as other" in the
-- approval UI and correct it in place, rather than discovering it in a report
-- months later.
DROP FUNCTION IF EXISTS public.get_sweep_staging(uuid);

CREATE FUNCTION public.get_sweep_staging(p_sweep_id uuid)
RETURNS TABLE(
  id uuid, research_run_id uuid, sweep_chunk_index integer,
  boundary_municipality_id uuid, muni_name text, muni_kind text,
  matched_existing_id uuid, approval_state text, project_name text, address text,
  location_description text, parcel_boundary_notes text, total_housing_units integer,
  builder_developer text, permit_url text, permit_application_date date,
  source text, discovery_source text, discovery_source_raw text, notes text
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
    s.permit_application_date, s.source, s.discovery_source, s.discovery_source_raw, s.notes
  FROM municipal_project_staging s
  JOIN research_run r ON r.id = s.research_run_id AND r.sweep_id = p_sweep_id
  LEFT JOIN boundary_municipality bm ON bm.id = s.boundary_municipality_id
  ORDER BY bm.name, r.sweep_chunk_index, s.created_at;
$function$;

GRANT EXECUTE ON FUNCTION public.get_sweep_staging(uuid) TO authenticated;

-- ---- 5: submit_research_report records the raw value ---------------------
-- Signature unchanged from 20260901120000/120100; CREATE OR REPLACE is safe.
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
      discovery_source, discovery_source_raw,
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
      r.discovery_source, r.discovery_source_raw,
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

-- ---- 6: approve_research_staging_rows promotes the raw value -------------
CREATE OR REPLACE FUNCTION public.approve_research_staging_rows(p_rows jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_run_id                 uuid;
  v_approved_new           int := 0;
  v_approved_matched       int := 0;
  v_created_municipalities int := 0;
  v_row                    jsonb;
  v_staging                record;
  v_muni_id                uuid;
  v_bm                     record;
  v_mp_id                  uuid;
  v_lat                    numeric;
  v_lng                    numeric;
  v_addr                   text;
  v_pname                  text;
  v_phase                  text;
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RAISE EXCEPTION 'p_rows must be a non-empty jsonb array';
  END IF;

  FOR v_row IN SELECT * FROM jsonb_array_elements(p_rows) LOOP
    SELECT *
      INTO v_staging
      FROM municipal_project_staging
     WHERE id = (v_row->>'staging_id')::uuid;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'staging row not found: %', (v_row->>'staging_id');
    END IF;
    IF v_staging.approval_state <> 'pending' THEN
      CONTINUE;
    END IF;

    IF v_run_id IS NULL THEN v_run_id := v_staging.research_run_id; END IF;
    IF v_run_id <> v_staging.research_run_id THEN
      RAISE EXCEPTION 'all p_rows must belong to the same research_run (mixed: % vs %)',
        v_run_id, v_staging.research_run_id;
    END IF;

    IF v_staging.matched_existing_id IS NOT NULL THEN
      UPDATE municipal_project_staging
         SET approval_state = 'approved',
             approved_at = now(),
             approved_municipal_project_id = v_staging.matched_existing_id
       WHERE id = v_staging.id;
      v_approved_matched := v_approved_matched + 1;
      CONTINUE;
    END IF;

    IF v_staging.municipality_id IS NOT NULL THEN
      v_muni_id := v_staging.municipality_id;
    ELSE
      SELECT * INTO v_bm FROM boundary_municipality WHERE id = v_staging.boundary_municipality_id;
      IF NOT FOUND THEN
        RAISE EXCEPTION 'staging row % has no boundary_municipality lookup', v_staging.id;
      END IF;
      SELECT id INTO v_muni_id
        FROM municipality
       WHERE lower(btrim(name)) = lower(btrim(v_bm.name))
         AND state = v_bm.state
       LIMIT 1;
      IF v_muni_id IS NULL THEN
        INSERT INTO municipality (name, state) VALUES (v_bm.name, v_bm.state) RETURNING id INTO v_muni_id;
        v_created_municipalities := v_created_municipalities + 1;
      END IF;
      UPDATE municipal_project_staging SET municipality_id = v_muni_id WHERE id = v_staging.id;
    END IF;

    v_lat := (v_row->>'latitude')::numeric;
    v_lng := (v_row->>'longitude')::numeric;

    v_addr  := COALESCE(v_row->>'address',      v_staging.address);
    v_pname := COALESCE(v_row->>'project_name', v_staging.project_name, '');
    v_phase := COALESCE(v_row->>'phase_label',  v_staging.phase_label,  '');

    INSERT INTO municipal_project (
      municipality_id, address, project_name, phase_label, parcel_numbers,
      location_description, parcel_boundary_notes,
      single_family_lots, townhouse_units, duplex_units, apt_units, cottage_units,
      total_housing_units, zoning, zoning_approval_date, notes, raw_stages,
      status_stage_id, builder_developer, permit_url, permit_application_date,
      source, discovery_source, discovery_source_raw,
      source_research_run_id, centroid, geocoded_address
    ) VALUES (
      v_muni_id,
      v_addr,
      v_pname,
      v_phase,
      v_staging.parcel_numbers,
      COALESCE(v_row->>'location_description',        v_staging.location_description),
      COALESCE(v_row->>'parcel_boundary_notes',       v_staging.parcel_boundary_notes),
      COALESCE((v_row->>'single_family_lots')::int,   v_staging.single_family_lots),
      COALESCE((v_row->>'townhouse_units')::int,      v_staging.townhouse_units),
      COALESCE((v_row->>'duplex_units')::int,         v_staging.duplex_units),
      COALESCE((v_row->>'apt_units')::int,            v_staging.apt_units),
      COALESCE((v_row->>'cottage_units')::int,        v_staging.cottage_units),
      COALESCE((v_row->>'total_housing_units')::int,  v_staging.total_housing_units),
      COALESCE(v_row->>'zoning',                      v_staging.zoning),
      COALESCE((v_row->>'zoning_approval_date')::date, v_staging.zoning_approval_date),
      COALESCE(v_row->>'notes',                       v_staging.notes),
      v_staging.raw_stages,
      v_staging.status_stage_id,
      COALESCE(v_row->>'builder_developer',           v_staging.builder_developer),
      COALESCE(v_row->>'permit_url',                  v_staging.permit_url),
      COALESCE((v_row->>'permit_application_date')::date, v_staging.permit_application_date),
      COALESCE(v_row->>'source',                      v_staging.source),
      -- Reviewer override wins, else the staged value. Normalized so a
      -- hand-typed override cannot violate the CHECK constraint.
      -- Key-presence test rather than COALESCE: the reviewer must be able to
      -- clear a WRONG agent value back to "not reported" (NULL). With COALESCE
      -- an explicit null would silently fall back to the staged value, making a
      -- bad attribution impossible to retract — the opposite of why this column
      -- exists. Absent key = no override; present-but-null = deliberate clear.
      -- NOTE: this differs from location_description / parcel_boundary_notes
      -- above, which use COALESCE. See docs/MARKET_RESEARCH_DISCOVERY_SOURCE.md
      -- ("Override semantics") for why the two differ.
      CASE WHEN v_row ? 'discovery_source'
           THEN normalize_discovery_source(v_row->>'discovery_source')
           ELSE v_staging.discovery_source
      END,
      -- Always the staged value, never overridden: this records what the AGENT
      -- reported. A reviewer reclassifying the row does not change the fact that
      -- the agent emitted an unrecognized string, and that fact is the taxonomy
      -- signal we are trying to accumulate.
      v_staging.discovery_source_raw,
      v_staging.research_run_id,
      CASE WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)
        ELSE NULL
      END,
      v_row->>'geocoded_address'
    )
    ON CONFLICT (municipality_id, address, project_name, phase_label) DO NOTHING
    RETURNING id INTO v_mp_id;

    IF v_mp_id IS NULL THEN
      SELECT id INTO v_mp_id
        FROM municipal_project
       WHERE municipality_id = v_muni_id
         AND address         = v_addr
         AND project_name    = v_pname
         AND phase_label     = v_phase
       LIMIT 1;

      UPDATE municipal_project_staging
         SET approval_state = 'approved',
             approved_at = now(),
             approved_municipal_project_id = v_mp_id
       WHERE id = v_staging.id;
      v_approved_matched := v_approved_matched + 1;
    ELSE
      UPDATE municipal_project_staging
         SET approval_state = 'approved',
             approved_at = now(),
             approved_municipal_project_id = v_mp_id
       WHERE id = v_staging.id;
      v_approved_new := v_approved_new + 1;
    END IF;
  END LOOP;

  IF v_run_id IS NOT NULL THEN
    UPDATE research_run
       SET state = 'approved',
           completed_at = COALESCE(completed_at, now())
     WHERE id = v_run_id;
  END IF;

  RETURN jsonb_build_object(
    'approved_new',               v_approved_new,
    'approved_matched',           v_approved_matched,
    'created_municipality_count', v_created_municipalities,
    'research_run_id',            v_run_id
  );
END;
$function$;

-- ---- 7: the taxonomy-gap report -----------------------------------------
-- The whole point of discovery_source_raw. Run this periodically: if the same
-- unrecognized string keeps appearing, the allowed set is missing a value and
-- should grow. Covers staged and committed rows in one place, since a gap is
-- worth seeing whether or not the record was ever approved.
CREATE OR REPLACE VIEW public.discovery_source_taxonomy_gap
WITH (security_invoker = true) AS
SELECT
  raw_value,
  count(*)                       AS occurrences,
  count(*) FILTER (WHERE stage = 'staged')    AS staged_rows,
  count(*) FILTER (WHERE stage = 'committed') AS committed_rows,
  min(first_seen)                AS first_seen,
  max(first_seen)                AS last_seen
FROM (
  SELECT discovery_source_raw AS raw_value, 'staged'::text AS stage, created_at AS first_seen
    FROM municipal_project_staging
   WHERE discovery_source_raw IS NOT NULL
  UNION ALL
  SELECT discovery_source_raw, 'committed'::text, created_at
    FROM municipal_project
   WHERE discovery_source_raw IS NOT NULL
) x
GROUP BY raw_value
ORDER BY occurrences DESC, raw_value;

COMMENT ON VIEW public.discovery_source_taxonomy_gap IS
  'Unrecognized discovery_source strings the agent emitted, which normalize_discovery_source() coerced to ''other''. A value recurring here is evidence the seven-value taxonomy is missing a category. Empty view = taxonomy currently adequate.';

GRANT SELECT ON public.discovery_source_taxonomy_gap TO authenticated, service_role;
