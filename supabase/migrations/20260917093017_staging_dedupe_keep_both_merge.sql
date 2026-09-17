-- Research approval dedupe: KEEP BOTH and MERGE resolutions.
--
-- The same-location cluster card offered only "keep one" (reject the rest). Two
-- real cases had both rows legitimate:
--   * Hall County — "Old Winder Highway Townhome Development" (105) and
--     "Gilliam Old Winder Highway Townhome Expansion" (38): two phases, one address.
--   * Cumming — "Garden District at Cumming City Center" (74) and
--     "Overlook at Cumming City Center" (301): two components of one development.
-- Rejecting either loses real units and the citation that produced them.
--
-- This migration adds:
--   KEEP BOTH  not_duplicate_of_ids — symmetric "these are NOT duplicates" pairs.
--              The (client-side) clustering skips marked pairs, so a resolved card
--              stays resolved across reloads. Also backs the name cluster's
--              "Not duplicates — keep all" / "separate", which were browser-only.
--   MERGE      approval_state 'merged' + merged_into_staging_id on the folded rows,
--              merge_snapshot on the surviving row (pre-merge values, for Undo).
--              Folded rows are neither rejected nor committed.
--
-- Neither path touches reject_reason / rejected_by_id / rejected_at: these are
-- findings, not errors.
--
-- COLLISION GUARD. approve_research_staging_rows inserts with
--   ON CONFLICT (municipality_id, address, project_name, phase_label) DO NOTHING
-- (exact strings; coordinates are not part of the key) and silently folds a
-- conflicting row into the existing project, counted as approved_matched. For two
-- rows the reviewer explicitly kept as separate projects that is silent unit loss.
-- So: mark_research_staging_not_duplicates refuses rows that share that key, and
-- the approve RPC raises instead of folding when the project it would fold into
-- was committed from a row marked not-a-duplicate of this one.
--
-- approve_research_staging_rows below is the LIVE definition (pg_get_functiondef,
-- 2026-09-17) with two additions: the keep-both collision guard and stamping
-- merged rows with the committed project id. get_sweep_staging is likewise the
-- live definition plus four trailing columns.

-- ---------------------------------------------------------------------------
-- Columns + state
-- ---------------------------------------------------------------------------
ALTER TABLE public.municipal_project_staging
  ADD COLUMN IF NOT EXISTS not_duplicate_of_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS merged_into_staging_id uuid,
  ADD COLUMN IF NOT EXISTS merge_snapshot jsonb;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
     WHERE conname = 'municipal_project_staging_merged_into_fkey'
       AND conrelid = 'public.municipal_project_staging'::regclass
  ) THEN
    ALTER TABLE public.municipal_project_staging
      ADD CONSTRAINT municipal_project_staging_merged_into_fkey
      FOREIGN KEY (merged_into_staging_id)
      REFERENCES public.municipal_project_staging(id) ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.municipal_project_staging
  DROP CONSTRAINT IF EXISTS municipal_project_staging_approval_state_check;
ALTER TABLE public.municipal_project_staging
  ADD CONSTRAINT municipal_project_staging_approval_state_check
  CHECK (approval_state = ANY (ARRAY['pending'::text, 'approved'::text, 'rejected'::text, 'merged'::text]));

CREATE INDEX IF NOT EXISTS municipal_project_staging_merged_into_idx
  ON public.municipal_project_staging (merged_into_staging_id)
  WHERE merged_into_staging_id IS NOT NULL;

COMMENT ON COLUMN public.municipal_project_staging.not_duplicate_of_ids IS
  'Staging rows the reviewer confirmed are DISTINCT projects from this one (keep both / not duplicates). Symmetric: each pair is recorded on both rows. The approval modal''s dedupe clustering skips these pairs. Cleared by clear_research_staging_not_duplicates (Undo).';
COMMENT ON COLUMN public.municipal_project_staging.merged_into_staging_id IS
  'Set with approval_state = ''merged'': this row was folded into the named surviving staging row (units summed, citation preserved in its notes). Not a rejection. Once the survivor commits, approved_municipal_project_id is stamped here too.';
COMMENT ON COLUMN public.municipal_project_staging.merge_snapshot IS
  'On a merge SURVIVOR: its pre-merge unit counts, notes, status, permit_url and source plus folded_ids — what unmerge_research_staging_rows restores. NULL when the row is not a merge survivor.';

-- ---------------------------------------------------------------------------
-- Commit-key resolver (internal). The exact key the approve RPC's ON CONFLICT
-- uses, with reviewer overrides applied. Municipality mirrors the approve RPC's
-- lookup; a municipality that doesn't exist yet keys on boundary name + state,
-- since the approve RPC would create it once and reuse it for the second row.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.research_staging_commit_keys(p_rows jsonb)
 RETURNS TABLE(id uuid, approval_state text, project_name text, muni_key text, address text, pname text, phase text)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT s.id,
         s.approval_state,
         s.project_name,
         COALESCE(
           s.municipality_id::text,
           (SELECT m.id::text
              FROM boundary_municipality bm
              JOIN municipality m
                ON lower(btrim(m.name)) = lower(btrim(bm.name)) AND m.state = bm.state
             WHERE bm.id = s.boundary_municipality_id
             LIMIT 1),
           (SELECT 'new:' || lower(btrim(bm.name)) || '|' || bm.state
              FROM boundary_municipality bm
             WHERE bm.id = s.boundary_municipality_id)
         ),
         COALESCE(e->>'address',      s.address),
         COALESCE(e->>'project_name', s.project_name, ''),
         COALESCE(e->>'phase_label',  s.phase_label,  '')
    FROM jsonb_array_elements(p_rows) e
    JOIN municipal_project_staging s ON s.id = (e->>'staging_id')::uuid;
$function$;

REVOKE ALL ON FUNCTION public.research_staging_commit_keys(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.research_staging_commit_keys(jsonb) TO service_role;

-- ---------------------------------------------------------------------------
-- KEEP BOTH
-- p_rows: [{staging_id, project_name?, address?, phase_label?}] — the reviewer's
-- unsaved edits are passed so the collision check sees what will actually commit.
-- p_anchor_id NULL: every pair in p_rows is marked. Set: only anchor <-> each other
-- row (the name cluster's per-row "separate").
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mark_research_staging_not_duplicates(p_rows jsonb, p_anchor_id uuid DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids   uuid[];
  v_found int;
  v_a     text;
  v_b     text;
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;

  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) < 2 THEN
    RAISE EXCEPTION 'p_rows must list at least two staging rows';
  END IF;

  SELECT array_agg(DISTINCT (e->>'staging_id')::uuid) INTO v_ids
    FROM jsonb_array_elements(p_rows) e;

  PERFORM 1 FROM municipal_project_staging WHERE id = ANY(v_ids) FOR UPDATE;

  SELECT count(*) INTO v_found FROM municipal_project_staging WHERE id = ANY(v_ids);
  IF v_found <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'staging row not found in p_rows';
  END IF;
  IF p_anchor_id IS NOT NULL AND NOT (p_anchor_id = ANY(v_ids)) THEN
    RAISE EXCEPTION 'p_anchor_id must be one of p_rows';
  END IF;
  IF EXISTS (SELECT 1 FROM municipal_project_staging WHERE id = ANY(v_ids) AND approval_state <> 'pending') THEN
    RAISE EXCEPTION 'keep_both_not_pending: every row must still be pending';
  END IF;

  -- Collision guard: two rows with the same commit key would fold into ONE
  -- municipal_project at approve (ON CONFLICT DO NOTHING) and the second row's
  -- units would vanish. Refuse; the reviewer must tell them apart.
  SELECT COALESCE(NULLIF(a.project_name, ''), '(unnamed)'), COALESCE(NULLIF(b.project_name, ''), '(unnamed)')
    INTO v_a, v_b
    FROM research_staging_commit_keys(p_rows) a
    JOIN research_staging_commit_keys(p_rows) b ON a.id < b.id
   WHERE (p_anchor_id IS NULL OR a.id = p_anchor_id OR b.id = p_anchor_id)
     AND a.muni_key = b.muni_key
     AND a.address  = b.address
     AND a.pname    = b.pname
     AND a.phase    = b.phase
   LIMIT 1;
  IF FOUND THEN
    RAISE EXCEPTION 'keep_both_collision: "%" and "%" have the same municipality, address, project name and phase label, so committing both would fold them into one record and lose one row''s units. Give one of them a phase label (e.g. "Phase 2") and try again.', v_a, v_b;
  END IF;

  UPDATE municipal_project_staging s
     SET not_duplicate_of_ids = ARRAY(
           SELECT DISTINCT x
             FROM unnest(
                    s.not_duplicate_of_ids
                    || CASE WHEN p_anchor_id IS NULL OR s.id = p_anchor_id
                            THEN array_remove(v_ids, s.id)
                            ELSE ARRAY[p_anchor_id] END
                  ) x
            ORDER BY x)
   WHERE s.id = ANY(v_ids);

  RETURN jsonb_build_object(
    'marked', cardinality(v_ids),
    'rows', (SELECT jsonb_agg(jsonb_build_object('id', id, 'not_duplicate_of_ids', not_duplicate_of_ids))
               FROM municipal_project_staging WHERE id = ANY(v_ids))
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.mark_research_staging_not_duplicates(jsonb, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.mark_research_staging_not_duplicates(jsonb, uuid) TO authenticated, service_role;

-- Undo keep-both for one row: drop every not-a-duplicate pair it is part of (both
-- directions). Its cluster re-forms on the next render.
CREATE OR REPLACE FUNCTION public.clear_research_staging_not_duplicates(p_staging_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_partners uuid[];
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;

  SELECT not_duplicate_of_ids INTO v_partners
    FROM municipal_project_staging WHERE id = p_staging_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'staging row not found: %', p_staging_id;
  END IF;

  UPDATE municipal_project_staging
     SET not_duplicate_of_ids = array_remove(not_duplicate_of_ids, p_staging_id)
   WHERE p_staging_id = ANY(not_duplicate_of_ids);

  UPDATE municipal_project_staging
     SET not_duplicate_of_ids = '{}'
   WHERE id = p_staging_id AND not_duplicate_of_ids <> '{}';

  RETURN jsonb_build_object('cleared', cardinality(v_partners) > 0, 'partners', to_jsonb(v_partners));
END;
$function$;

REVOKE ALL ON FUNCTION public.clear_research_staging_not_duplicates(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.clear_research_staging_not_duplicates(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- MERGE
-- Folds p_fold_ids into p_keep_id (the survivor keeps its name/address/dates):
--   * each unit column sums across all rows (NULL only if every row is NULL)
--   * notes become a dated block per row: name · units · date, Source, Permit, notes
--   * status = the row with the most recent dated event (GREATEST of zoning
--     approval / permit application date), falling back to staged time; rows with
--     no status are skipped rather than letting "unknown" overwrite a real status
--   * permit_url / source stay the survivor's; if it has none, the most recent
--     other row's fills in (every citation is in notes regardless)
-- Folded rows -> approval_state 'merged', merged_into_staging_id = survivor.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.merge_research_staging_rows(p_keep_id uuid, p_fold_ids uuid[])
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_ids     uuid[];
  v_found   int;
  v_status  uuid;
  v_permit  text;
  v_source  text;
  v_notes   text;
  v_runs    uuid[];
  v_closed  uuid[] := '{}';
  v_run     uuid;
  v_pending int;
  v_keep    municipal_project_staging%ROWTYPE;
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;

  IF p_keep_id IS NULL OR p_fold_ids IS NULL OR cardinality(p_fold_ids) = 0 THEN
    RAISE EXCEPTION 'p_keep_id and a non-empty p_fold_ids are required';
  END IF;
  IF p_keep_id = ANY(p_fold_ids) THEN
    RAISE EXCEPTION 'p_keep_id cannot also be in p_fold_ids';
  END IF;

  v_ids := ARRAY(SELECT DISTINCT x FROM unnest(array_prepend(p_keep_id, p_fold_ids)) x);

  PERFORM 1 FROM municipal_project_staging WHERE id = ANY(v_ids) FOR UPDATE;

  SELECT count(*) INTO v_found FROM municipal_project_staging WHERE id = ANY(v_ids);
  IF v_found <> cardinality(v_ids) THEN
    RAISE EXCEPTION 'staging row not found';
  END IF;
  IF EXISTS (SELECT 1 FROM municipal_project_staging WHERE id = ANY(v_ids) AND approval_state <> 'pending') THEN
    RAISE EXCEPTION 'merge_not_pending: every row must still be pending';
  END IF;
  IF EXISTS (SELECT 1 FROM municipal_project_staging WHERE id = ANY(v_ids) AND merge_snapshot IS NOT NULL) THEN
    RAISE EXCEPTION 'merge_already_merged: one of these rows is already the result of a merge — undo that merge first';
  END IF;
  -- A hard-matched row approves by pointing at the existing project and never
  -- writes its values, so the summed units would never land.
  IF EXISTS (SELECT 1 FROM municipal_project_staging WHERE id = ANY(v_ids) AND matched_existing_id IS NOT NULL) THEN
    RAISE EXCEPTION 'merge_matched_existing: one of these rows already matches a committed project — resolve that match first';
  END IF;

  SELECT status_stage_id INTO v_status
    FROM municipal_project_staging
   WHERE id = ANY(v_ids) AND status_stage_id IS NOT NULL
   ORDER BY GREATEST(zoning_approval_date, permit_application_date) DESC NULLS LAST, created_at DESC
   LIMIT 1;

  SELECT * INTO v_keep FROM municipal_project_staging WHERE id = p_keep_id;

  v_permit := COALESCE(NULLIF(btrim(v_keep.permit_url), ''), (
    SELECT permit_url FROM municipal_project_staging
     WHERE id = ANY(p_fold_ids) AND NULLIF(btrim(permit_url), '') IS NOT NULL
     ORDER BY GREATEST(zoning_approval_date, permit_application_date) DESC NULLS LAST, created_at DESC
     LIMIT 1));
  v_source := COALESCE(NULLIF(btrim(v_keep.source), ''), (
    SELECT source FROM municipal_project_staging
     WHERE id = ANY(p_fold_ids) AND NULLIF(btrim(source), '') IS NOT NULL
     ORDER BY GREATEST(zoning_approval_date, permit_application_date) DESC NULLS LAST, created_at DESC
     LIMIT 1), v_keep.source);

  SELECT '[Merged ' || to_char((now() AT TIME ZONE 'America/New_York')::date, 'YYYY-MM-DD')
         || ' from ' || count(*) || ' research records — units summed; each record''s source below]'
         || E'\n\n'
         || string_agg(block, E'\n\n' ORDER BY event_date ASC NULLS LAST, created_at ASC)
    INTO v_notes
    FROM (
      SELECT created_at,
             GREATEST(zoning_approval_date, permit_application_date) AS event_date,
             concat_ws(E'\n',
               '— ' || COALESCE(NULLIF(btrim(project_name), ''), '(unnamed)')
                 || ' · ' || COALESCE(total_housing_units::text || ' units', 'units not reported')
                 || ' · ' || concat_ws(' · ',
                      'zoning approved ' || to_char(zoning_approval_date, 'YYYY-MM-DD'),
                      'permit applied '  || to_char(permit_application_date, 'YYYY-MM-DD'),
                      CASE WHEN zoning_approval_date IS NULL AND permit_application_date IS NULL
                           THEN 'staged ' || to_char((created_at AT TIME ZONE 'America/New_York')::date, 'YYYY-MM-DD')
                      END)
                 || ' —',
               'Source: ' || COALESCE(NULLIF(btrim(source), ''), 'not recorded'),
               'Permit: ' || NULLIF(btrim(permit_url), ''),
               NULLIF(btrim(notes), '')
             ) AS block
        FROM municipal_project_staging
       WHERE id = ANY(v_ids)
    ) b;

  UPDATE municipal_project_staging k
     SET merge_snapshot = jsonb_build_object(
           'folded_ids',          to_jsonb(p_fold_ids),
           'merged_at',           now(),
           'single_family_lots',  k.single_family_lots,
           'townhouse_units',     k.townhouse_units,
           'duplex_units',        k.duplex_units,
           'apt_units',           k.apt_units,
           'cottage_units',       k.cottage_units,
           'total_housing_units', k.total_housing_units,
           'notes',               k.notes,
           'status_stage_id',     k.status_stage_id,
           'permit_url',          k.permit_url,
           'source',              k.source
         ),
         single_family_lots  = agg.single_family_lots,
         townhouse_units     = agg.townhouse_units,
         duplex_units        = agg.duplex_units,
         apt_units           = agg.apt_units,
         cottage_units       = agg.cottage_units,
         total_housing_units = agg.total_housing_units,
         notes               = v_notes,
         status_stage_id     = COALESCE(v_status, k.status_stage_id),
         permit_url          = v_permit,
         source              = v_source
    FROM (
      SELECT sum(single_family_lots)::int  AS single_family_lots,
             sum(townhouse_units)::int     AS townhouse_units,
             sum(duplex_units)::int        AS duplex_units,
             sum(apt_units)::int           AS apt_units,
             sum(cottage_units)::int       AS cottage_units,
             sum(total_housing_units)::int AS total_housing_units
        FROM municipal_project_staging
       WHERE id = ANY(v_ids)
    ) agg
   WHERE k.id = p_keep_id;

  WITH upd AS (
    UPDATE municipal_project_staging
       SET approval_state = 'merged',
           merged_into_staging_id = p_keep_id
     WHERE id = ANY(p_fold_ids)
    RETURNING research_run_id
  )
  SELECT array_agg(DISTINCT research_run_id) INTO v_runs FROM upd;

  -- A folded row from another chunk run may have been that run's last pending
  -- row; close it out the same way reject does.
  IF v_runs IS NOT NULL THEN
    FOREACH v_run IN ARRAY v_runs LOOP
      SELECT count(*) INTO v_pending
        FROM municipal_project_staging
       WHERE research_run_id = v_run AND approval_state = 'pending';
      IF v_pending = 0 THEN
        UPDATE research_run
           SET state = 'archived', completed_at = COALESCE(completed_at, now())
         WHERE id = v_run AND state = 'awaiting_review';
        IF FOUND THEN
          v_closed := v_closed || v_run;
        END IF;
      END IF;
    END LOOP;
  END IF;

  SELECT * INTO v_keep FROM municipal_project_staging WHERE id = p_keep_id;

  RETURN jsonb_build_object(
    'keep_id',             p_keep_id,
    'folded_ids',          to_jsonb(p_fold_ids),
    'total_housing_units', v_keep.total_housing_units,
    'notes',               v_keep.notes,
    'permit_url',          v_keep.permit_url,
    'source',              v_keep.source,
    'runs_closed',         to_jsonb(v_closed)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.merge_research_staging_rows(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.merge_research_staging_rows(uuid, uuid[]) TO authenticated, service_role;

-- Undo a merge: restore the survivor from its snapshot, return folded rows to
-- pending. Refused once the survivor has been committed.
CREATE OR REPLACE FUNCTION public.unmerge_research_staging_rows(p_keep_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_keep     municipal_project_staging%ROWTYPE;
  v_snap     jsonb;
  v_restored uuid[];
  v_runs     uuid[];
  v_reopened uuid[];
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;

  SELECT * INTO v_keep FROM municipal_project_staging WHERE id = p_keep_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'staging row not found: %', p_keep_id;
  END IF;
  IF v_keep.merge_snapshot IS NULL THEN
    RETURN jsonb_build_object('unmerged', false);
  END IF;
  IF v_keep.approval_state <> 'pending' THEN
    RAISE EXCEPTION 'unmerge_committed: the merged record was already committed — edit the committed project instead';
  END IF;
  v_snap := v_keep.merge_snapshot;

  PERFORM 1 FROM municipal_project_staging WHERE merged_into_staging_id = p_keep_id FOR UPDATE;

  UPDATE municipal_project_staging
     SET single_family_lots  = (v_snap->>'single_family_lots')::int,
         townhouse_units     = (v_snap->>'townhouse_units')::int,
         duplex_units        = (v_snap->>'duplex_units')::int,
         apt_units           = (v_snap->>'apt_units')::int,
         cottage_units       = (v_snap->>'cottage_units')::int,
         total_housing_units = (v_snap->>'total_housing_units')::int,
         notes               = v_snap->>'notes',
         status_stage_id     = (v_snap->>'status_stage_id')::uuid,
         permit_url          = v_snap->>'permit_url',
         source              = v_snap->>'source',
         merge_snapshot      = NULL
   WHERE id = p_keep_id;

  WITH upd AS (
    UPDATE municipal_project_staging
       SET approval_state = 'pending',
           merged_into_staging_id = NULL
     WHERE merged_into_staging_id = p_keep_id AND approval_state = 'merged'
    RETURNING id, research_run_id
  )
  SELECT array_agg(id), array_agg(DISTINCT research_run_id) INTO v_restored, v_runs FROM upd;

  WITH reo AS (
    UPDATE research_run
       SET state = 'awaiting_review'
     WHERE id = ANY(COALESCE(v_runs, '{}')) AND state IN ('archived', 'approved')
    RETURNING id
  )
  SELECT array_agg(id) INTO v_reopened FROM reo;

  SELECT * INTO v_keep FROM municipal_project_staging WHERE id = p_keep_id;

  RETURN jsonb_build_object(
    'unmerged',            true,
    'restored_ids',        to_jsonb(COALESCE(v_restored, '{}')),
    'runs_reopened',       to_jsonb(COALESCE(v_reopened, '{}')),
    'total_housing_units', v_keep.total_housing_units,
    'notes',               v_keep.notes,
    'permit_url',          v_keep.permit_url,
    'source',              v_keep.source
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.unmerge_research_staging_rows(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unmerge_research_staging_rows(uuid) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- approve_research_staging_rows — live definition + keep-both collision guard +
-- merged-row stamping. Search "ADDED 20260917" for the changes.
-- ---------------------------------------------------------------------------
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

-- ---------------------------------------------------------------------------
-- get_sweep_staging — live definition + phase_label, not_duplicate_of_ids,
-- merged_into_staging_id, is_merge_keeper. RETURNS TABLE changes need DROP.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_sweep_staging(uuid);
CREATE FUNCTION public.get_sweep_staging(p_sweep_id uuid)
 RETURNS TABLE(id uuid, research_run_id uuid, sweep_chunk_index integer, boundary_municipality_id uuid, muni_name text, muni_kind text, matched_existing_id uuid, approval_state text, project_name text, address text, location_description text, parcel_boundary_notes text, total_housing_units integer, builder_developer text, permit_url text, permit_application_date date, source text, discovery_source text, discovery_source_raw text, notes text, reject_reason text, duplicate_of_staging_id uuid, duplicate_of_project_name text, duplicate_of_run_id uuid, duplicate_of_chunk_index integer, phase_label text, not_duplicate_of_ids uuid[], merged_into_staging_id uuid, is_merge_keeper boolean)
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
    s.phase_label, s.not_duplicate_of_ids, s.merged_into_staging_id, s.merge_snapshot IS NOT NULL
  FROM municipal_project_staging s
  JOIN research_run r ON r.id = s.research_run_id AND r.sweep_id = p_sweep_id
  LEFT JOIN boundary_municipality bm ON bm.id = s.boundary_municipality_id
  LEFT JOIN municipal_project_staging d ON d.id = s.duplicate_of_staging_id
  LEFT JOIN research_run dr ON dr.id = d.research_run_id
  ORDER BY bm.name, r.sweep_chunk_index, s.created_at;
$function$;

GRANT EXECUTE ON FUNCTION public.get_sweep_staging(uuid) TO anon, authenticated, service_role;
