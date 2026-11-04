-- Per-row unit-count review flag on municipal_project_staging AND municipal_project.
--
-- Why: the market research agent stages real developments whose unit count no
-- source stated, and marks the gap three different ways — NULL, 0, or an
-- invented 25 (the inclusion threshold). The only signal was the run-level
-- free-text needs_review, so no-count rows committed looking clean (health
-- check 2026-11-03: 5 committed with no real count, 2 of them at a fabricated
-- 25).
--
-- Design: FLAG, DON'T BLOCK. A real development with an unknown count still
-- belongs in the pipeline; there is deliberately no CHECK on the unit count.
--
--   units_needs_review   boolean  — this row's unit count needs a human look
--   units_review_reason  text     — short why
--
-- Set automatically by trigger:
--   * total NULL                      (both tables, insert or count change)
--   * total 0                         (both tables — 0 is never a real count)
--   * total exactly 25                (staging only — every staged 25 seen
--                                      through 2026-11-03 was a placeholder)
--   * notes call the count a placeholder/estimate   (staging insert only)
-- Cleared automatically when the count is changed to a positive number and
-- the current reason is one the trigger set (a hand-written reason is left
-- for a human to clear). A reviewer can clear it by hand; the trigger only
-- fires on INSERT or a change to total_housing_units, so a manual clear sticks.
--
-- approve_research_staging_rows carries the staged flag to the committed row
-- (rebuilt from the LIVE definition 2026-11-03, not an older migration file).
-- get_sweep_staging and municipal_project_v expose the two columns.

-- ---------------------------------------------------------------- columns
ALTER TABLE public.municipal_project_staging
  ADD COLUMN units_needs_review  boolean NOT NULL DEFAULT false,
  ADD COLUMN units_review_reason text;

ALTER TABLE public.municipal_project
  ADD COLUMN units_needs_review  boolean NOT NULL DEFAULT false,
  ADD COLUMN units_review_reason text;

COMMENT ON COLUMN public.municipal_project_staging.units_needs_review IS
  'Unit count needs a human look (no count / placeholder). Advisory — never blocks approval.';
COMMENT ON COLUMN public.municipal_project.units_needs_review IS
  'Unit count needs a human look (no count / placeholder). Advisory — never blocks anything.';

-- ---------------------------------------------------------------- trigger
-- The reason strings are the trigger's own vocabulary: it only ever clears a
-- flag whose reason is in this list.
CREATE OR REPLACE FUNCTION public.unit_count_auto_reason(
  p_total int, p_notes text, p_is_staging boolean, p_check_notes boolean
) RETURNS text
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN p_total IS NULL THEN 'No unit count'
    WHEN p_total = 0     THEN 'Unit count is 0 — a placeholder, not a sourced count'
    WHEN p_is_staging AND p_total = 25
      THEN 'Exactly 25 units (the threshold) — confirm it is sourced, not a placeholder'
    WHEN p_is_staging AND p_check_notes AND p_notes ~* '(unit|lot|count|total_housing_units)[^.]{0,80}(placeholder|estimate only|is an estimate)|(placeholder|estimate only)[^.]{0,40}(unit|lot|count)'
      THEN 'Agent notes say the unit count is a placeholder or estimate'
  END;
$$;

CREATE OR REPLACE FUNCTION public.unit_count_is_auto_reason(p_reason text)
RETURNS boolean
LANGUAGE sql IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT p_reason IN (
    'No unit count',
    'Unit count is 0 — a placeholder, not a sourced count',
    'Exactly 25 units (the threshold) — confirm it is sourced, not a placeholder',
    'Agent notes say the unit count is a placeholder or estimate'
  );
$$;

CREATE OR REPLACE FUNCTION public.flag_unit_count_for_review()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $$
DECLARE
  v_staging boolean := TG_TABLE_NAME = 'municipal_project_staging';
  v_reason  text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    v_reason := unit_count_auto_reason(NEW.total_housing_units, NEW.notes, v_staging, true);
    -- Respect a flag the writer set explicitly (approve carries the staged one).
    IF v_reason IS NOT NULL AND NOT NEW.units_needs_review THEN
      NEW.units_needs_review  := true;
      NEW.units_review_reason := v_reason;
    END IF;
    RETURN NEW;
  END IF;

  -- UPDATE OF total_housing_units
  IF NEW.total_housing_units IS NOT DISTINCT FROM OLD.total_housing_units THEN
    RETURN NEW;
  END IF;
  -- The same statement set the flag columns itself: it knows best.
  IF NEW.units_needs_review IS DISTINCT FROM OLD.units_needs_review
     OR NEW.units_review_reason IS DISTINCT FROM OLD.units_review_reason THEN
    RETURN NEW;
  END IF;

  v_reason := unit_count_auto_reason(NEW.total_housing_units, NEW.notes, v_staging, false);
  IF v_reason IS NOT NULL THEN
    IF NOT OLD.units_needs_review OR unit_count_is_auto_reason(OLD.units_review_reason) THEN
      NEW.units_needs_review  := true;
      NEW.units_review_reason := v_reason;
    END IF;
  ELSIF OLD.units_needs_review AND unit_count_is_auto_reason(OLD.units_review_reason) THEN
    NEW.units_needs_review  := false;
    NEW.units_review_reason := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER municipal_project_staging_unit_count_review
  BEFORE INSERT OR UPDATE OF total_housing_units ON public.municipal_project_staging
  FOR EACH ROW EXECUTE FUNCTION public.flag_unit_count_for_review();

CREATE TRIGGER municipal_project_unit_count_review
  BEFORE INSERT OR UPDATE OF total_housing_units ON public.municipal_project
  FOR EACH ROW EXECUTE FUNCTION public.flag_unit_count_for_review();

-- The trigger runs as the editing user (a reviewer saving units from the
-- slideout is `authenticated`), so the two pure helpers it calls need EXECUTE
-- for authenticated. They read nothing and write nothing. The trigger function
-- itself needs no EXECUTE grant to fire.
REVOKE ALL ON FUNCTION public.unit_count_auto_reason(int, text, boolean, boolean) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.unit_count_is_auto_reason(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.flag_unit_count_for_review() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.unit_count_auto_reason(int, text, boolean, boolean) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.unit_count_is_auto_reason(text) TO authenticated, service_role;

-- ---------------------------------------------------------------- backfill
-- UPDATE of the flag columns only, so the trigger does not fire.
UPDATE public.municipal_project_staging s
   SET units_needs_review  = true,
       units_review_reason = public.unit_count_auto_reason(s.total_housing_units, s.notes, true, true)
 WHERE public.unit_count_auto_reason(s.total_housing_units, s.notes, true, true) IS NOT NULL;

UPDATE public.municipal_project mp
   SET units_needs_review  = true,
       units_review_reason = public.unit_count_auto_reason(mp.total_housing_units, mp.notes, false, false)
 WHERE public.unit_count_auto_reason(mp.total_housing_units, mp.notes, false, false) IS NOT NULL;

-- ---------------------------------------------------------------- approve RPC
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
  v_partner                text;
  v_total                  int;   -- ADDED 20261103203347
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
      -- ADDED 20260917: rows merged into this one point at the same project.
      UPDATE municipal_project_staging
         SET approved_municipal_project_id = v_staging.matched_existing_id,
             approved_at = now()
       WHERE merged_into_staging_id = v_staging.id AND approval_state = 'merged';
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

    -- ADDED 20261103203347: per-row unit-count review flag. If the reviewer
    -- left the staged count alone, the staged flag + reason carry over. If they
    -- typed a different count, the staged reason no longer describes the value
    -- being committed, so it is dropped — and the municipal_project trigger
    -- re-flags anything that still commits with no count.
    v_total := COALESCE((v_row->>'total_housing_units')::int, v_staging.total_housing_units);

    INSERT INTO municipal_project (
      municipality_id, address, project_name, phase_label, parcel_numbers,
      location_description, parcel_boundary_notes,
      single_family_lots, townhouse_units, duplex_units, apt_units, cottage_units,
      total_housing_units, zoning, zoning_approval_date, notes, raw_stages,
      status_stage_id, builder_developer, permit_url, permit_application_date,
      source, discovery_source, discovery_source_raw,
      source_research_run_id, centroid, geocoded_address,
      centroid_source, unplaced_reason,
      is_amendment, units_basis, amends_case_number, prior_total,
      units_needs_review, units_review_reason
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
      -- The caller sends latitude/longitude ONLY when the geocode was precise
      -- (ROOFTOP / RANGE_INTERPOLATED). A vague address no longer arrives here as
      -- a coordinate at all, so a county or city centroid can never be written as
      -- if it were the project's location.
      CASE WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL
        THEN ST_SetSRID(ST_MakePoint(v_lng, v_lat), 4326)
        ELSE NULL
      END,
      v_row->>'geocoded_address',
      -- Placement invariant: a pin has a source, no pin has a reason.
      CASE WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL
        THEN 'address_geocode' ELSE NULL END,
      CASE WHEN v_lat IS NOT NULL AND v_lng IS NOT NULL THEN NULL
        -- The reviewer's client says WHY it withheld the coordinate
        -- (admin_area_centroid / road_centroid / geocode_failed / no_address).
        -- An older client that sends neither still satisfies the constraint.
        ELSE COALESCE(v_row->>'unplaced_reason', 'geocode_failed')
      END,
      -- Amendment fields carry straight through from staging. The reviewer can
      -- correct them on the staging row before approving; there is no per-field
      -- override here because, unlike discovery_source, these describe what the
      -- SOURCE said rather than a classification we are accumulating.
      v_staging.is_amendment,
      v_staging.units_basis,
      v_staging.amends_case_number,
      v_staging.prior_total,
      CASE WHEN v_total IS NOT DISTINCT FROM v_staging.total_housing_units
           THEN v_staging.units_needs_review ELSE false END,
      CASE WHEN v_total IS NOT DISTINCT FROM v_staging.total_housing_units
           THEN v_staging.units_review_reason ELSE NULL END
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

      -- ADDED 20260917: keep-both collision guard. The fold-in above is right for
      -- a row that re-finds an already-committed project — but NOT when that
      -- project was committed from a row the reviewer marked as a DIFFERENT
      -- project from this one. Folding would mark this row approved, count it as
      -- matched, and drop its units without a word. Stop instead (the whole call
      -- rolls back).
      SELECT COALESCE(NULLIF(o.project_name, ''), '(unnamed)') INTO v_partner
        FROM municipal_project_staging o
       WHERE o.approved_municipal_project_id = v_mp_id
         AND o.id <> v_staging.id
         AND (o.id = ANY(v_staging.not_duplicate_of_ids) OR v_staging.id = ANY(o.not_duplicate_of_ids))
       LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'keep_both_collision: "%" was kept as a separate project from "%", but both would commit with the same municipality, address, project name and phase label — the second would fold into the first and its units would be lost. Nothing was committed. Give one of them a phase label (e.g. "Phase 2") and approve again.',
          COALESCE(NULLIF(v_pname, ''), '(unnamed)'), v_partner;
      END IF;

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

    -- ADDED 20260917: rows merged into this one point at the committed project.
    UPDATE municipal_project_staging
       SET approved_municipal_project_id = v_mp_id,
           approved_at = now()
     WHERE merged_into_staging_id = v_staging.id AND approval_state = 'merged';
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

-- ---------------------------------------------------------------- sweep read RPC
-- Return type changes, so DROP + CREATE (body from the live definition).
DROP FUNCTION public.get_sweep_staging(uuid);
CREATE OR REPLACE FUNCTION public.get_sweep_staging(p_sweep_id uuid)
 RETURNS TABLE(id uuid, research_run_id uuid, sweep_chunk_index integer, boundary_municipality_id uuid, muni_name text, muni_kind text, matched_existing_id uuid, approval_state text, project_name text, address text, location_description text, parcel_boundary_notes text, total_housing_units integer, builder_developer text, permit_url text, permit_application_date date, source text, discovery_source text, discovery_source_raw text, notes text, reject_reason text, duplicate_of_staging_id uuid, duplicate_of_project_name text, duplicate_of_run_id uuid, duplicate_of_chunk_index integer, phase_label text, not_duplicate_of_ids uuid[], merged_into_staging_id uuid, is_merge_keeper boolean, units_needs_review boolean, units_review_reason text)
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
    s.duplicate_of_staging_id, d.project_name, d.research_run_id, dr.sweep_chunk_index,
    s.phase_label, s.not_duplicate_of_ids, s.merged_into_staging_id, s.merge_snapshot IS NOT NULL,
    s.units_needs_review, s.units_review_reason
  FROM municipal_project_staging s
  JOIN research_run r ON r.id = s.research_run_id AND r.sweep_id = p_sweep_id
  LEFT JOIN boundary_municipality bm ON bm.id = s.boundary_municipality_id
  LEFT JOIN municipal_project_staging d ON d.id = s.duplicate_of_staging_id
  LEFT JOIN research_run dr ON dr.id = d.research_run_id
  ORDER BY bm.name, r.sweep_chunk_index, s.created_at;
$function$;
REVOKE ALL ON FUNCTION public.get_sweep_staging(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sweep_staging(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------- view
-- New columns appended at the end (CREATE OR REPLACE keeps existing grants).
CREATE OR REPLACE VIEW public.municipal_project_v WITH (security_invoker = on) AS
SELECT mp.id,
    mp.municipality_id,
    mp.address,
    mp.project_name,
    mp.phase_label,
    mp.parcel_numbers,
    mp.single_family_lots,
    mp.townhouse_units,
    mp.duplex_units,
    mp.apt_units,
    mp.cottage_units,
    mp.total_housing_units,
    mp.zoning,
    mp.zoning_approval_date,
    mp.notes,
    mp.raw_stages,
    mp.status_stage_id,
    mp.status_override_id,
    mp.geocoded_address,
    mp.centroid,
    mp.geometry,
    mp.property_id,
    mp.source_import_id,
    mp.source_row_number,
    mp.created_at,
    mp.updated_at,
    mp.source,
    mp.builder_developer,
    mp.permit_url,
    mp.permit_application_date,
    mp.source_research_run_id,
    mp.location_description,
    mp.parcel_boundary_notes,
    mp.created_by_id,
    mp.updated_by_id,
    mp.label_offset_x_px,
    mp.label_offset_y_px,
    mp.discovery_source,
    mp.discovery_source_raw,
    mp.centroid_source,
    mp.unplaced_reason,
    mp.geometry_source,
    mp.geometry_source_parcels,
    mp.geometry_fetched_at,
    mp.geometry_stated_acres,
    mp.geometry_computed_acres,
    mp.geometry_needs_review,
    mp.geometry_reviewed_at,
    mp.is_amendment,
    mp.units_basis,
    mp.amends_case_number,
    mp.prior_total,
    st_y(mp.centroid) AS centroid_lat,
    st_x(mp.centroid) AS centroid_lng,
        CASE
            WHEN mp.geometry IS NULL THEN NULL::jsonb
            ELSE st_asgeojson(mp.geometry)::jsonb
        END AS geometry_geojson,
    mp.centroid IS NULL AS is_unplaced,
        CASE
            WHEN mp.geometry_stated_acres IS NULL OR mp.geometry_stated_acres = 0::numeric OR mp.geometry_computed_acres IS NULL THEN NULL::numeric
            ELSE round((mp.geometry_computed_acres - mp.geometry_stated_acres) / mp.geometry_stated_acres * 100::numeric, 1)
        END AS geometry_area_variance_pct,
    mp.geometry IS NOT NULL AND (mp.geometry_source = ANY (ARRAY['parcel_fetch'::text, 'parcel_fetch_adjusted'::text])) AND mp.geometry_reviewed_at IS NULL AS geometry_unreviewed,
    m.name AS municipality_name,
    m.state AS municipality_state,
    m.display_color AS municipality_display_color,
    ps.name AS computed_stage_name,
    COALESCE(mp.status_override_id, mp.status_stage_id) AS effective_stage_id,
    ps_eff.name AS effective_stage_name,
    ps_eff.color AS effective_stage_color,
    ps_eff.line_color AS effective_stage_line_color,
    mp.units_needs_review,
    mp.units_review_reason
   FROM municipal_project mp
     LEFT JOIN municipality m ON m.id = mp.municipality_id
     LEFT JOIN project_stage ps ON ps.id = mp.status_stage_id
     LEFT JOIN project_stage ps_eff ON ps_eff.id = COALESCE(mp.status_override_id, mp.status_stage_id);
REVOKE ALL ON public.municipal_project_v FROM anon;
GRANT SELECT ON public.municipal_project_v TO authenticated;
