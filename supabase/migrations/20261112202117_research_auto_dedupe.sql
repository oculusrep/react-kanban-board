-- Auto-resolve obvious duplicates in the research review queue.
--
-- Two cases, run when a review opens (auto_resolve_research_duplicates):
--   1. Pending vs pending: the same project staged more than once is MERGED into
--      one row, keeping the fullest value per field and the union of sources.
--      Unlike merge_research_staging_rows (one project reported in parts, units
--      SUMMED), nothing is added up: copies agree on the count or have none.
--   2. Pending vs committed: a staged copy of a project already on the map is
--      REJECTED as "duplicates committed record X".
--
-- Only unambiguous matches resolve: exact normalized name + phase in the same
-- place, or a shared case number in the same place, AND no conflicting unit
-- count AND compatible addresses. Anything else is left for the reviewer (and
-- a pending-vs-committed near-miss is flagged with the reason).
--
-- Every auto action is undoable through the existing paths (Undo merge →
-- unmerge_research_staging_rows, Undo reject → unreject_research_staging_row);
-- undoing sets auto_dedupe_skip so the next review open doesn't redo it.
--
-- Scope is every pending row in a run that is not in flight, not just the run
-- being opened: the committed record is global, so a copy staged by another run
-- (141 South was staged by four separate Quick runs) is still the same copy.

-- ---------------------------------------------------------------- columns
ALTER TABLE public.municipal_project_staging
  ADD COLUMN IF NOT EXISTS auto_dedupe_skip boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS duplicate_of_project_id uuid
    REFERENCES public.municipal_project(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS auto_resolved_at timestamptz,
  ADD COLUMN IF NOT EXISTS auto_dedupe_note text;

COMMENT ON COLUMN public.municipal_project_staging.auto_dedupe_skip IS
  'Reviewer undid an automatic dedupe on this row; auto_resolve_research_duplicates leaves it alone.';
COMMENT ON COLUMN public.municipal_project_staging.duplicate_of_project_id IS
  'Committed municipal_project this staged row appears to copy. With auto_resolved_at set it was auto-rejected; without, it is a flag (see auto_dedupe_note).';
COMMENT ON COLUMN public.municipal_project_staging.auto_resolved_at IS
  'Set when auto_resolve_research_duplicates merged (keeper or folded row) or rejected this row.';

-- ---------------------------------------------------------------- helpers
-- Same normalization as the review UI's normalizeProjectName: lowercase, drop
-- parentheticals (case codes, builder names), punctuation to spaces.
CREATE OR REPLACE FUNCTION public.research_dedupe_name(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT btrim(regexp_replace(regexp_replace(lower(coalesce(p, '')), '\([^)]*\)', ' ', 'g'), '[^a-z0-9]+', ' ', 'g'));
$$;

-- Zoning / annexation case numbers named in the project name or zoning field
-- (not notes: notes cite OTHER cases, e.g. the one being amended).
-- "Z-21-2026" -> Z21-2026, "Z2026-05", "REZ25-05", "RZ-26-03", "A2024-03".
CREATE OR REPLACE FUNCTION public.research_case_numbers(p_name text, p_zoning text)
RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT coalesce(array_agg(DISTINCT m[1] || m[2] || '-' || m[3]), '{}')
    FROM regexp_matches(upper(coalesce(p_name, '') || ' ' || coalesce(p_zoning, '')),
                        '(?:^|[^A-Z0-9])(REZ|RZ|Z|PUD|PRD|PD|ANX|AX|A|CUP|SUP)[- ]?([0-9]{2,4})[- ]([0-9]{1,4})(?![0-9])',
                        'g') AS m;
$$;

-- Address -> comparable tokens: lowercase, zip and state dropped, common
-- abbreviations expanded, filler words removed.
CREATE OR REPLACE FUNCTION public.research_addr_tokens(p text)
RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  WITH t AS (
    SELECT tok, ord
      FROM regexp_split_to_table(
             btrim(regexp_replace(regexp_replace(lower(coalesce(p, '')), '\m[0-9]{5}(-[0-9]{4})?\M', ' ', 'g'), '[^a-z0-9]+', ' ', 'g')),
             '\s+') WITH ORDINALITY AS x(tok, ord)
     WHERE tok <> ''
  )
  SELECT coalesce(array_agg(
           CASE tok
             WHEN 'st' THEN 'street' WHEN 'rd' THEN 'road' WHEN 'dr' THEN 'drive'
             WHEN 'ln' THEN 'lane' WHEN 'ave' THEN 'avenue' WHEN 'av' THEN 'avenue'
             WHEN 'blvd' THEN 'boulevard' WHEN 'hwy' THEN 'highway' WHEN 'pkwy' THEN 'parkway'
             WHEN 'ct' THEN 'court' WHEN 'cir' THEN 'circle' WHEN 'trl' THEN 'trail'
             WHEN 'pl' THEN 'place' WHEN 'ter' THEN 'terrace'
             ELSE tok END ORDER BY ord), '{}')
    FROM t
   WHERE tok NOT IN ('ga', 'georgia', 'and', 'at', 'of', 'the', 'near', 'corner', 'off',
                     'n', 's', 'e', 'w', 'ne', 'nw', 'se', 'sw', 'usa');
$$;

-- City named in the address: the segment just before ", GA".
CREATE OR REPLACE FUNCTION public.research_addr_city(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
  SELECT nullif(btrim((regexp_match(
           btrim(regexp_replace(lower(coalesce(p, '')), '[0-9]{5}(-[0-9]{4})?\s*$', '')),
           '([^,]+?)\s*,?\s+(?:ga|georgia)\.?\s*,?\s*(?:usa)?$'))[1]), '');
$$;

-- Do two addresses describe the same place? Deliberately lenient about how
-- fully an address is written ("Hwy 16 & Pylant St" vs "SW corner of GA Hwy 16
-- & Pylant Street"), strict about different house numbers or different streets.
CREATE OR REPLACE FUNCTION public.research_addr_compatible(a text, b text)
RETURNS boolean LANGUAGE plpgsql IMMUTABLE PARALLEL SAFE SET search_path = public AS $$
DECLARE
  ta text[] := public.research_addr_tokens(a);
  tb text[] := public.research_addr_tokens(b);
  street_types text[] := ARRAY['street','road','drive','lane','avenue','boulevard','parkway',
                               'court','circle','trail','way','place','terrace','pike','highway','route'];
  num_a text[]; num_b text[]; st_a text[]; st_b text[];
BEGIN
  IF cardinality(ta) = 0 OR cardinality(tb) = 0 THEN RETURN true; END IF;
  IF ta = tb OR ta <@ tb OR tb <@ ta THEN RETURN true; END IF;

  -- House numbers: a number not following highway/route/sr/us/i.
  SELECT coalesce(array_agg(t), '{}') INTO num_a FROM (
    SELECT tok AS t, lag(tok) OVER (ORDER BY i) AS prev FROM unnest(ta) WITH ORDINALITY u(tok, i)) x
   WHERE t ~ '^[0-9]+[a-z]?$' AND coalesce(prev, '') NOT IN ('highway','route','sr','us','i','interstate','hwy');
  SELECT coalesce(array_agg(t), '{}') INTO num_b FROM (
    SELECT tok AS t, lag(tok) OVER (ORDER BY i) AS prev FROM unnest(tb) WITH ORDINALITY u(tok, i)) x
   WHERE t ~ '^[0-9]+[a-z]?$' AND coalesce(prev, '') NOT IN ('highway','route','sr','us','i','interstate','hwy');
  IF cardinality(num_a) > 0 AND cardinality(num_b) > 0 AND NOT (num_a && num_b) THEN
    RETURN false;
  END IF;

  -- Vague side (no street type and no house number): a place name, not an address.
  IF NOT (ta && street_types) AND cardinality(num_a) = 0 THEN RETURN true; END IF;
  IF NOT (tb && street_types) AND cardinality(num_b) = 0 THEN RETURN true; END IF;

  -- Shared street: "<word> <street type>" or "highway <n>".
  SELECT coalesce(array_agg(DISTINCT s), '{}') INTO st_a FROM (
    SELECT CASE WHEN tok IN ('highway','route') THEN tok || ' ' || lead(tok) OVER w
                ELSE lag(tok) OVER w || ' ' || tok END AS s, tok
      FROM unnest(ta) WITH ORDINALITY u(tok, i) WINDOW w AS (ORDER BY i)) x
   WHERE tok = ANY(street_types) AND s IS NOT NULL;
  SELECT coalesce(array_agg(DISTINCT s), '{}') INTO st_b FROM (
    SELECT CASE WHEN tok IN ('highway','route') THEN tok || ' ' || lead(tok) OVER w
                ELSE lag(tok) OVER w || ' ' || tok END AS s, tok
      FROM unnest(tb) WITH ORDINALITY u(tok, i) WINDOW w AS (ORDER BY i)) x
   WHERE tok = ANY(street_types) AND s IS NOT NULL;
  RETURN st_a && st_b;
END;
$$;

-- ---------------------------------------------------------------- dedupe merge
-- Fold p_fold_ids into p_keep_id as COPIES of one project. Internal: called by
-- auto_resolve_research_duplicates only (no grant).
CREATE OR REPLACE FUNCTION public._research_dedupe_merge(p_keep_id uuid, p_fold_ids uuid[], p_auto boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_ids    uuid[] := array_prepend(p_keep_id, p_fold_ids);
  v_keep   municipal_project_staging%ROWTYPE;
  v_snap   jsonb;
  v_cols   text[] := ARRAY['project_name','address','phase_label','location_description','parcel_boundary_notes',
                           'builder_developer','zoning','zoning_approval_date','permit_application_date','permit_url',
                           'source','notes','total_housing_units','single_family_lots','townhouse_units','duplex_units',
                           'apt_units','cottage_units','status_stage_id','discovery_source','discovery_source_raw',
                           'municipality_id','boundary_municipality_id','parcel_numbers','not_duplicate_of_ids',
                           'is_amendment','units_basis','amends_case_number','prior_total'];
  v_permit text;
BEGIN
  SELECT * INTO v_keep FROM municipal_project_staging WHERE id = p_keep_id FOR UPDATE;
  PERFORM 1 FROM municipal_project_staging WHERE id = ANY(p_fold_ids) FOR UPDATE;

  -- Prior keeper values, captured once: a later copy folded into the same keeper
  -- extends folded_ids and keeps the ORIGINAL values to restore on undo.
  IF v_keep.merge_snapshot IS NOT NULL AND v_keep.merge_snapshot->>'kind' = 'dedupe' THEN
    v_snap := jsonb_set(v_keep.merge_snapshot, '{folded_ids}',
                        (v_keep.merge_snapshot->'folded_ids') || to_jsonb(p_fold_ids));
  ELSE
    v_snap := jsonb_build_object(
      'kind', 'dedupe', 'auto', p_auto, 'merged_at', now(),
      'folded_ids', to_jsonb(p_fold_ids),
      'fields', (SELECT jsonb_object_agg(k, v) FROM jsonb_each(to_jsonb(v_keep)) e(k, v) WHERE k = ANY(v_cols)));
  END IF;

  v_permit := coalesce(nullif(btrim(v_keep.permit_url), ''),
    (SELECT permit_url FROM municipal_project_staging WHERE id = ANY(p_fold_ids) AND nullif(btrim(permit_url), '') IS NOT NULL
      ORDER BY length(permit_url) DESC LIMIT 1));

  WITH m AS (
    SELECT s.*, (s.id = p_keep_id) AS is_keep FROM municipal_project_staging s WHERE s.id = ANY(v_ids)
  )
  UPDATE municipal_project_staging k SET
    project_name          = coalesce((SELECT project_name FROM m WHERE nullif(btrim(project_name), '') IS NOT NULL ORDER BY length(project_name) DESC, is_keep DESC LIMIT 1), k.project_name),
    -- An address with a house number beats a longer description.
    address               = coalesce((SELECT address FROM m WHERE nullif(btrim(address), '') IS NOT NULL ORDER BY (address ~ '^\s*[0-9]') DESC, length(address) DESC, is_keep DESC LIMIT 1), k.address),
    phase_label           = coalesce(nullif(btrim(k.phase_label), ''), (SELECT phase_label FROM m WHERE nullif(btrim(phase_label), '') IS NOT NULL ORDER BY length(phase_label) DESC LIMIT 1), k.phase_label),
    location_description  = coalesce((SELECT location_description FROM m WHERE nullif(btrim(location_description), '') IS NOT NULL ORDER BY length(location_description) DESC, is_keep DESC LIMIT 1), k.location_description),
    parcel_boundary_notes = coalesce((SELECT parcel_boundary_notes FROM m WHERE nullif(btrim(parcel_boundary_notes), '') IS NOT NULL ORDER BY length(parcel_boundary_notes) DESC, is_keep DESC LIMIT 1), k.parcel_boundary_notes),
    builder_developer     = coalesce((SELECT builder_developer FROM m WHERE nullif(btrim(builder_developer), '') IS NOT NULL ORDER BY length(builder_developer) DESC, is_keep DESC LIMIT 1), k.builder_developer),
    zoning                = coalesce((SELECT zoning FROM m WHERE nullif(btrim(zoning), '') IS NOT NULL ORDER BY length(zoning) DESC, is_keep DESC LIMIT 1), k.zoning),
    notes                 = coalesce((SELECT notes FROM m WHERE nullif(btrim(notes), '') IS NOT NULL ORDER BY length(notes) DESC, is_keep DESC LIMIT 1), k.notes),
    zoning_approval_date    = coalesce(k.zoning_approval_date, (SELECT max(zoning_approval_date) FROM m)),
    permit_application_date = coalesce(k.permit_application_date, (SELECT max(permit_application_date) FROM m)),
    permit_url            = v_permit,
    -- Union of sources, plus any other permit URL the copies cited.
    source                = coalesce((SELECT string_agg(src, E'\n' ORDER BY first_seen) FROM (
                               SELECT src, min(ord) AS first_seen FROM (
                                 SELECT btrim(source) AS src, CASE WHEN is_keep THEN 0 ELSE 1 END AS ord FROM m WHERE nullif(btrim(source), '') IS NOT NULL
                                 UNION ALL
                                 SELECT 'Also cited: ' || btrim(permit_url), 2 FROM m
                                  WHERE nullif(btrim(permit_url), '') IS NOT NULL AND btrim(permit_url) IS DISTINCT FROM btrim(v_permit)
                               ) u GROUP BY src) d), k.source),
    total_housing_units   = coalesce(nullif(k.total_housing_units, 0), (SELECT max(nullif(total_housing_units, 0)) FROM m), k.total_housing_units),
    single_family_lots    = coalesce(k.single_family_lots, (SELECT max(single_family_lots) FROM m)),
    townhouse_units       = coalesce(k.townhouse_units, (SELECT max(townhouse_units) FROM m)),
    duplex_units          = coalesce(k.duplex_units, (SELECT max(duplex_units) FROM m)),
    apt_units             = coalesce(k.apt_units, (SELECT max(apt_units) FROM m)),
    cottage_units         = coalesce(k.cottage_units, (SELECT max(cottage_units) FROM m)),
    status_stage_id       = coalesce((SELECT status_stage_id FROM m WHERE status_stage_id IS NOT NULL
                                      ORDER BY GREATEST(zoning_approval_date, permit_application_date) DESC NULLS LAST, created_at DESC LIMIT 1), k.status_stage_id),
    discovery_source      = coalesce(k.discovery_source, (SELECT discovery_source FROM m WHERE discovery_source IS NOT NULL LIMIT 1)),
    discovery_source_raw  = coalesce(k.discovery_source_raw, (SELECT discovery_source_raw FROM m WHERE discovery_source_raw IS NOT NULL LIMIT 1)),
    municipality_id       = coalesce(k.municipality_id, (SELECT municipality_id FROM m WHERE municipality_id IS NOT NULL LIMIT 1)),
    boundary_municipality_id = coalesce(k.boundary_municipality_id, (SELECT boundary_municipality_id FROM m WHERE boundary_municipality_id IS NOT NULL LIMIT 1)),
    parcel_numbers        = coalesce((SELECT array_agg(DISTINCT pn) FROM m, unnest(m.parcel_numbers) pn), k.parcel_numbers),
    not_duplicate_of_ids  = coalesce((SELECT array_agg(DISTINCT nd) FROM m, unnest(m.not_duplicate_of_ids) nd WHERE nd <> ALL(v_ids)), '{}'),
    merge_snapshot        = v_snap,
    auto_resolved_at      = CASE WHEN p_auto THEN now() ELSE k.auto_resolved_at END
  WHERE k.id = p_keep_id;

  UPDATE municipal_project_staging
     SET approval_state = 'merged', merged_into_staging_id = p_keep_id,
         auto_resolved_at = CASE WHEN p_auto THEN now() ELSE auto_resolved_at END
   WHERE id = ANY(p_fold_ids);
  -- Runs that lost their last pending row are NOT archived here: the reviewer
  -- should still see what was merged away, with its undo.
END;
$$;
REVOKE ALL ON FUNCTION public._research_dedupe_merge(uuid, uuid[], boolean) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------- the resolver
CREATE OR REPLACE FUNCTION public.auto_resolve_research_duplicates(p_dry_run boolean DEFAULT false)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_rejected jsonb := '[]';
  v_flagged  jsonb := '[]';
  v_merged   jsonb := '[]';
  v_manual   jsonb := '[]';
  r record;
  v_comp record;
  v_keep uuid;
  v_changed int;
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;

  -- Serialize: two reviewers opening at once must not merge the same rows twice.
  PERFORM pg_advisory_xact_lock(hashtext('auto_resolve_research_duplicates'));

  DROP TABLE IF EXISTS pg_temp._ard_pool;
  CREATE TEMP TABLE _ard_pool ON COMMIT DROP AS
  SELECT s.id, s.created_at, s.project_name, s.address, s.not_duplicate_of_ids,
         (s.merge_snapshot IS NOT NULL) AS has_snap,
         public.research_dedupe_name(s.project_name) AS nname,
         public.research_dedupe_name(s.phase_label)  AS nphase,
         public.research_case_numbers(s.project_name, s.zoning) AS cases,
         nullif(s.total_housing_units, 0) AS units,
         array_remove(ARRAY[lower(mu.name), lower(bm.name), public.research_addr_city(s.address)], NULL) AS places,
         -- "Fullest" record: populated fields, a house-numbered address, then notes length.
         ( (nullif(btrim(s.address), '') IS NOT NULL)::int + (s.address ~ '^\s*[0-9]')::int
         + (nullif(s.total_housing_units, 0) IS NOT NULL)::int + (nullif(btrim(s.builder_developer), '') IS NOT NULL)::int
         + (nullif(btrim(s.permit_url), '') IS NOT NULL)::int + (nullif(btrim(s.source), '') IS NOT NULL)::int
         + (nullif(btrim(s.location_description), '') IS NOT NULL)::int + (nullif(btrim(s.parcel_boundary_notes), '') IS NOT NULL)::int
         + (nullif(btrim(s.zoning), '') IS NOT NULL)::int + (s.zoning_approval_date IS NOT NULL)::int
         + (s.permit_application_date IS NOT NULL)::int + (nullif(btrim(s.notes), '') IS NOT NULL)::int
         )::numeric + least(length(coalesce(s.notes, '')), 4000) / 10000.0 AS fullness
    FROM municipal_project_staging s
    JOIN research_run rr ON rr.id = s.research_run_id
    LEFT JOIN municipality mu ON mu.id = s.municipality_id
    LEFT JOIN boundary_municipality bm ON bm.id = s.boundary_municipality_id
   WHERE s.approval_state = 'pending'
     AND NOT s.auto_dedupe_skip
     AND s.matched_existing_id IS NULL
     AND rr.state NOT IN ('pending', 'running')
     -- A summed (parts-of-one-project) merge keeper is a different animal; leave it.
     AND (s.merge_snapshot IS NULL OR s.merge_snapshot->>'kind' = 'dedupe');

  -- ---------- case 2: staged copies of committed records ----------
  FOR r IN
    WITH hits AS (
      SELECT p.id AS sid, p.project_name AS sname, p.units AS sunits, p.address AS saddr,
             mp.id AS mid, mp.project_name AS mname, nullif(mp.total_housing_units, 0) AS munits, mp.address AS maddr,
             (p.nname <> '' AND p.nname = public.research_dedupe_name(mp.project_name)
               AND p.nphase = public.research_dedupe_name(mp.phase_label)) AS by_name
        FROM _ard_pool p
        JOIN municipal_project mp ON
             (   (p.nname <> '' AND p.nname = public.research_dedupe_name(mp.project_name)
                  AND p.nphase = public.research_dedupe_name(mp.phase_label))
              OR (cardinality(p.cases) > 0 AND p.cases && public.research_case_numbers(mp.project_name, mp.zoning)))
        LEFT JOIN municipality mm ON mm.id = mp.municipality_id
       WHERE p.places && array_remove(ARRAY[lower(mm.name), public.research_addr_city(mp.address)], NULL)
    )
    SELECT sid, sname,
           jsonb_agg(jsonb_build_object('id', mid, 'name', mname, 'units', munits,
             'units_ok', (sunits IS NULL OR munits IS NULL OR sunits = munits),
             'addr_ok', public.research_addr_compatible(saddr, maddr),
             'maddr', maddr, 'sunits', sunits, 'saddr', saddr)) AS hits
      FROM hits GROUP BY sid, sname
  LOOP
    DECLARE
      v_clean jsonb := (SELECT jsonb_agg(h) FROM jsonb_array_elements(r.hits) h
                         WHERE (h->>'units_ok')::boolean AND (h->>'addr_ok')::boolean);
      v_first jsonb := r.hits->0;
      v_note  text;
    BEGIN
      IF v_clean IS NOT NULL AND jsonb_array_length(v_clean) = 1 THEN
        v_rejected := v_rejected || jsonb_build_object('id', r.sid, 'name', r.sname,
                        'committed_id', v_clean->0->>'id', 'committed_name', v_clean->0->>'name');
        IF NOT p_dry_run THEN
          UPDATE municipal_project_staging
             SET approval_state = 'rejected',
                 reject_reason = format('Duplicates committed record "%s" (auto-resolved)', v_clean->0->>'name'),
                 rejected_at = now(), rejected_by_id = NULL,
                 duplicate_of_project_id = (v_clean->0->>'id')::uuid,
                 auto_resolved_at = now(), auto_dedupe_note = NULL
           WHERE id = r.sid;
        END IF;
        DELETE FROM _ard_pool WHERE id = r.sid;
      ELSE
        v_note := CASE
          WHEN v_clean IS NOT NULL THEN format('matches %s committed records', jsonb_array_length(v_clean))
          WHEN NOT (v_first->>'units_ok')::boolean THEN format('unit counts differ: %s staged vs %s committed', v_first->>'sunits', v_first->>'units')
          ELSE format('addresses differ: "%s" vs committed "%s"', v_first->>'saddr', v_first->>'maddr') END;
        v_flagged := v_flagged || jsonb_build_object('id', r.sid, 'name', r.sname,
                       'committed_id', v_first->>'id', 'committed_name', v_first->>'name', 'reason', v_note);
        IF NOT p_dry_run THEN
          UPDATE municipal_project_staging
             SET duplicate_of_project_id = (v_first->>'id')::uuid,
                 auto_dedupe_note = 'Possible duplicate of committed "' || (v_first->>'name') || '" — ' || v_note
           WHERE id = r.sid
             AND (duplicate_of_project_id IS DISTINCT FROM (v_first->>'id')::uuid OR auto_dedupe_note IS NULL);
        END IF;
      END IF;
    END;
  END LOOP;

  -- ---------- case 1: copies within the pending set ----------
  DROP TABLE IF EXISTS pg_temp._ard_edge;
  CREATE TEMP TABLE _ard_edge ON COMMIT DROP AS
  SELECT a.id AS a, b.id AS b
    FROM _ard_pool a JOIN _ard_pool b ON a.id < b.id
   WHERE a.places && b.places
     AND (   (a.nname <> '' AND a.nname = b.nname AND a.nphase = b.nphase)
          OR (cardinality(a.cases) > 0 AND a.cases && b.cases))
     AND NOT (b.id = ANY(coalesce(a.not_duplicate_of_ids, '{}')) OR a.id = ANY(coalesce(b.not_duplicate_of_ids, '{}')));

  -- Connected components by label propagation.
  DROP TABLE IF EXISTS pg_temp._ard_comp;
  CREATE TEMP TABLE _ard_comp ON COMMIT DROP AS
  SELECT id, id::text AS comp FROM _ard_pool WHERE id IN (SELECT a FROM _ard_edge UNION SELECT b FROM _ard_edge);
  LOOP
    WITH nb AS (
      SELECT c.id, least(c.comp, min(c2.comp)) AS comp
        FROM _ard_comp c
        JOIN _ard_edge e ON e.a = c.id OR e.b = c.id
        JOIN _ard_comp c2 ON c2.id = CASE WHEN e.a = c.id THEN e.b ELSE e.a END
       GROUP BY c.id, c.comp
    )
    UPDATE _ard_comp c SET comp = nb.comp FROM nb WHERE nb.id = c.id AND nb.comp < c.comp;
    GET DIAGNOSTICS v_changed = ROW_COUNT;
    EXIT WHEN v_changed = 0;
  END LOOP;

  FOR v_comp IN
    SELECT c.comp, array_agg(c.id ORDER BY p.has_snap DESC, p.fullness DESC, p.created_at) AS ids,
           array_agg(DISTINCT p.units) FILTER (WHERE p.units IS NOT NULL) AS unit_values,
           min(p.project_name) AS name
      FROM _ard_comp c JOIN _ard_pool p ON p.id = c.id
     GROUP BY c.comp
  LOOP
    -- Whole-group checks: transitivity can join rows that disagree pairwise.
    IF coalesce(cardinality(v_comp.unit_values), 0) > 1 THEN
      v_manual := v_manual || jsonb_build_object('ids', to_jsonb(v_comp.ids), 'name', v_comp.name,
                    'reason', 'unit counts differ: ' || array_to_string(v_comp.unit_values, ' vs '));
      CONTINUE;
    END IF;
    IF EXISTS (SELECT 1 FROM _ard_pool x JOIN _ard_pool y ON x.id < y.id
                WHERE x.id = ANY(v_comp.ids) AND y.id = ANY(v_comp.ids)
                  AND NOT public.research_addr_compatible(x.address, y.address)) THEN
      v_manual := v_manual || jsonb_build_object('ids', to_jsonb(v_comp.ids), 'name', v_comp.name,
                    'reason', 'addresses differ: ' || (SELECT string_agg(DISTINCT coalesce(address, '—'), ' / ') FROM _ard_pool WHERE id = ANY(v_comp.ids)));
      CONTINUE;
    END IF;
    v_keep := v_comp.ids[1];
    v_merged := v_merged || jsonb_build_object('keep_id', v_keep, 'name', v_comp.name,
                  'folded_ids', to_jsonb(v_comp.ids[2:]));
    IF NOT p_dry_run THEN
      PERFORM public._research_dedupe_merge(v_keep, v_comp.ids[2:], true);
    END IF;
  END LOOP;

  RETURN jsonb_build_object('dry_run', p_dry_run, 'merged', v_merged, 'rejected', v_rejected,
                            'flagged', v_flagged, 'left_for_review', v_manual);
END;
$$;

-- ---------------------------------------------------------------- undo paths
-- unmerge: rebuilt from the live definition (20261112 pg_get_functiondef), plus
-- the dedupe branch (restore every field the merge chose) and the skip flag.
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
  v_f        municipal_project_staging%ROWTYPE;
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

  IF v_snap->>'kind' = 'dedupe' THEN
    v_f := jsonb_populate_record(NULL::municipal_project_staging, v_snap->'fields');
    UPDATE municipal_project_staging SET
      project_name = v_f.project_name, address = v_f.address, phase_label = v_f.phase_label,
      location_description = v_f.location_description, parcel_boundary_notes = v_f.parcel_boundary_notes,
      builder_developer = v_f.builder_developer, zoning = v_f.zoning,
      zoning_approval_date = v_f.zoning_approval_date, permit_application_date = v_f.permit_application_date,
      permit_url = v_f.permit_url, source = v_f.source, notes = v_f.notes,
      total_housing_units = v_f.total_housing_units, single_family_lots = v_f.single_family_lots,
      townhouse_units = v_f.townhouse_units, duplex_units = v_f.duplex_units, apt_units = v_f.apt_units,
      cottage_units = v_f.cottage_units, status_stage_id = v_f.status_stage_id,
      discovery_source = v_f.discovery_source, discovery_source_raw = v_f.discovery_source_raw,
      municipality_id = v_f.municipality_id, boundary_municipality_id = v_f.boundary_municipality_id,
      parcel_numbers = v_f.parcel_numbers, not_duplicate_of_ids = coalesce(v_f.not_duplicate_of_ids, '{}'),
      is_amendment = v_f.is_amendment, units_basis = v_f.units_basis,
      amends_case_number = v_f.amends_case_number, prior_total = v_f.prior_total,
      merge_snapshot = NULL,
      auto_resolved_at = NULL,
      -- Undoing an AUTO merge is the reviewer saying "not that": don't redo it.
      auto_dedupe_skip = auto_dedupe_skip OR coalesce((v_snap->>'auto')::boolean, false)
    WHERE id = p_keep_id;
  ELSE
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
  END IF;

  WITH upd AS (
    UPDATE municipal_project_staging
       SET approval_state = 'pending',
           merged_into_staging_id = NULL,
           auto_resolved_at = NULL,
           auto_dedupe_skip = auto_dedupe_skip OR coalesce((v_snap->>'auto')::boolean, false)
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

-- unreject: rebuilt from the live definition, plus the skip flag for an
-- auto-rejected row. duplicate_of_project_id is kept so the card still says
-- which committed record it resembles.
CREATE OR REPLACE FUNCTION public.unreject_research_staging_row(p_staging_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_did      boolean;
  v_run_id   uuid;
  v_reopened boolean := false;
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;

  UPDATE municipal_project_staging
     SET approval_state = 'pending',
         reject_reason  = NULL,
         rejected_by_id = NULL,
         rejected_at    = NULL,
         auto_dedupe_skip = auto_dedupe_skip OR (auto_resolved_at IS NOT NULL),
         auto_dedupe_note = CASE WHEN auto_resolved_at IS NOT NULL AND duplicate_of_project_id IS NOT NULL
                                 THEN 'Auto-rejected as a duplicate, then restored by a reviewer'
                                 ELSE auto_dedupe_note END,
         auto_resolved_at = NULL
   WHERE id = p_staging_id AND approval_state = 'rejected'
   RETURNING research_run_id INTO v_run_id;
  v_did := FOUND;

  -- The run has a pending row again -> pull it back out of its terminal state so
  -- it re-surfaces in the review queue. completed_at is left as-is (audit trail).
  IF v_did AND v_run_id IS NOT NULL THEN
    UPDATE research_run
       SET state = 'awaiting_review'
     WHERE id = v_run_id AND state IN ('archived', 'approved');
    v_reopened := FOUND;
  END IF;

  RETURN jsonb_build_object('unrejected', v_did, 'run_reopened', v_reopened);
END;
$function$;

-- What the review screen shows: every auto action touching these runs' rows.
CREATE OR REPLACE FUNCTION public.get_research_auto_resolutions(p_run_ids uuid[])
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.user_has_market_research_run_access() THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  RETURN jsonb_build_object(
    -- Auto-merges whose keeper OR any folded copy belongs to these runs.
    'merged', coalesce((
      SELECT jsonb_agg(jsonb_build_object(
               'keep_id', k.id, 'keep_name', k.project_name, 'keep_run_id', k.research_run_id,
               'keep_state', k.approval_state, 'units', k.total_housing_units,
               'folded', (SELECT jsonb_agg(jsonb_build_object('id', f.id, 'name', f.project_name,
                                 'run_id', f.research_run_id, 'units', f.total_housing_units, 'address', f.address)
                                 ORDER BY f.created_at)
                            FROM municipal_project_staging f WHERE f.merged_into_staging_id = k.id))
               ORDER BY k.project_name)
        FROM municipal_project_staging k
       WHERE k.merge_snapshot->>'kind' = 'dedupe' AND coalesce((k.merge_snapshot->>'auto')::boolean, false)
         AND (k.research_run_id = ANY(p_run_ids)
              OR EXISTS (SELECT 1 FROM municipal_project_staging f
                          WHERE f.merged_into_staging_id = k.id AND f.research_run_id = ANY(p_run_ids)))), '[]'),
    'rejected', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'name', s.project_name, 'committed_id', mp.id,
                                          'committed_name', mp.project_name) ORDER BY s.project_name)
        FROM municipal_project_staging s JOIN municipal_project mp ON mp.id = s.duplicate_of_project_id
       WHERE s.research_run_id = ANY(p_run_ids) AND s.approval_state = 'rejected' AND s.auto_resolved_at IS NOT NULL), '[]'),
    'flagged', coalesce((
      SELECT jsonb_agg(jsonb_build_object('id', s.id, 'committed_id', mp.id, 'committed_name', mp.project_name,
                                          'note', s.auto_dedupe_note))
        FROM municipal_project_staging s JOIN municipal_project mp ON mp.id = s.duplicate_of_project_id
       WHERE s.research_run_id = ANY(p_run_ids) AND s.approval_state = 'pending'), '[]')
  );
END;
$$;

-- ---------------------------------------------------------------- grants
REVOKE ALL ON FUNCTION public.auto_resolve_research_duplicates(boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_resolve_research_duplicates(boolean) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_research_auto_resolutions(uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_research_auto_resolutions(uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.unmerge_research_staging_rows(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unmerge_research_staging_rows(uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.unreject_research_staging_row(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.unreject_research_staging_row(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._research_dedupe_merge(uuid, uuid[], boolean) TO service_role;
-- Pure helpers: callable by the definer functions above; no Data API exposure.
REVOKE ALL ON FUNCTION public.research_dedupe_name(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.research_case_numbers(text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.research_addr_tokens(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.research_addr_city(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.research_addr_compatible(text, text) FROM PUBLIC, anon, authenticated;
