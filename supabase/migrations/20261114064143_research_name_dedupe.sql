-- Name-based auto-dedupe for Market Research staging, run at submit time
-- (before the Gemini unit estimator, so we don't pay to estimate a duplicate).
--
-- Group = same normalized name (incl. phase) + same municipality, across
-- pending staged rows AND committed municipal_project rows. Within a group
-- that has at least one unit count:
--   * staged copies with NO count  -> rejected "Duplicate without unit count — kept <id>"
--   * staged copies whose count EQUALS the keeper's -> rejected "Duplicate — kept <id>"
--   * counts that DIFFER -> nothing rejected; each staged counted copy gets a
--     count_conflict snapshot so the approval screen shows them side by side.
-- Keeper = firmest counted copy: committed > approved > reported (or NULL) > estimated, then newest.
-- Rejects, never deletes (Undo works; unreject sets auto_dedupe_skip so it
-- isn't re-rejected). Nothing is merged into the keeper except a parcel ID
-- or acreage it doesn't already have.
--
-- Doc: docs/MARKET_RESEARCH_UNIT_ESTIMATES.md (Name dedupe)

ALTER TABLE public.municipal_project_staging ADD COLUMN count_conflict jsonb;

-- Normalized dedupe key: case, punctuation, parentheticals (except ones naming
-- a phase), a trailing "subdivision" / "community" / "development". Phases are
-- part of the key ("ph 2" = "phase 2"; "Grove Park" <> "Grove Park Phase 2").
-- phase_label is appended unless the name already ends with it.
CREATE FUNCTION public.research_name_key(p_name text, p_phase text)
RETURNS text
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO 'public'
AS $$
  WITH n AS (
    SELECT lower(coalesce(p_name, '')) AS nm, lower(coalesce(p_phase, '')) AS ph
  ), step AS (
    SELECT
      -- keep "(Phase 2)"-style parentheticals, drop the rest
      regexp_replace(regexp_replace(nm, '\(([^)]*\mph(ase)?\.?\s*([0-9]+[a-z]?|[ivx]+)\M[^)]*)\)', ' \1 ', 'g'),
                     '\([^)]*\)', ' ', 'g') AS nm,
      ph
    FROM n
  ), canon AS (
    SELECT
      btrim(regexp_replace(regexp_replace(nm, '\mph(ase)?\.?\s*([0-9]+[a-z]?|[ivx]+)\M', ' phase \2 ', 'g'),
                           '[^a-z0-9]+', ' ', 'g')) AS nm,
      btrim(regexp_replace(regexp_replace(ph, '\mph(ase)?\.?\s*([0-9]+[a-z]?|[ivx]+)\M', ' phase \2 ', 'g'),
                           '[^a-z0-9]+', ' ', 'g')) AS ph
    FROM step
  ), stripped AS (
    SELECT
      btrim(regexp_replace(nm, '\s(subdivision|community|development)(?=(\sphase\s[0-9a-z]+)?$)', '', 'g')) AS nm,
      ph
    FROM canon
  )
  SELECT CASE
           WHEN nm = '' THEN ''
           WHEN ph = '' OR nm = ph OR right(nm, length(ph) + 1) = ' ' || ph THEN nm
           ELSE nm || ' ' || ph
         END
    FROM stripped;
$$;

-- First "<n> acres" / "<n>-acre" / "<n> ac" in a text, or NULL.
CREATE FUNCTION public.research_text_acres(p text)
RETURNS numeric
LANGUAGE sql IMMUTABLE PARALLEL SAFE
SET search_path TO 'public'
AS $$
  SELECT nullif(replace(substring(p FROM '(?i)([0-9][0-9,]*(?:\.[0-9]+)?)\s*-?\s*(?:acres?|ac)\M'), ',', ''), '')::numeric;
$$;

CREATE FUNCTION public.research_auto_dedupe_by_name(p_run_ids uuid[] DEFAULT NULL, p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  g          record;
  m          record;
  k          record;
  v_rej_none jsonb := '[]';
  v_rej_eq   jsonb := '[]';
  v_conf     jsonb := '[]';
  v_snap     jsonb;
  v_reason   text;
  v_acres    numeric;
  v_conflict boolean;
BEGIN
  -- Edge functions call with the secret key (service_role); a direct psql
  -- session is postgres; a reviewer needs approve access.
  IF NOT (coalesce(auth.role(), '') = 'service_role'
          OR session_user = 'postgres'
          OR public.user_has_market_research_approve_access()) THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('research_auto_dedupe_by_name'));

  DROP TABLE IF EXISTS pg_temp._nd;
  CREATE TEMP TABLE _nd ON COMMIT DROP AS
  SELECT 'staged'::text AS kind, s.id, s.research_run_id AS run_id,
         s.project_name, s.phase_label,
         public.research_name_key(s.project_name, s.phase_label) AS nkey,
         lower(btrim(coalesce(mu.name, bm.name))) AS muni,
         coalesce(mu.state, bm.state) AS st,
         CASE WHEN s.total_housing_units > 0 THEN s.total_housing_units END AS units,
         CASE s.units_confidence WHEN 'approved' THEN 3 WHEN 'estimated' THEN 1 ELSE 2 END AS rank,
         s.units_confidence AS conf,
         s.created_at, coalesce(s.not_duplicate_of_ids, '{}') AS not_dup,
         coalesce(s.parcel_numbers, '{}') AS parcels,
         concat_ws(' ', s.location_description, s.parcel_boundary_notes, s.notes) AS txt,
         s.source, s.notes, s.address
    FROM municipal_project_staging s
    JOIN research_run rr ON rr.id = s.research_run_id
    LEFT JOIN municipality mu ON mu.id = s.municipality_id
    LEFT JOIN boundary_municipality bm ON bm.id = s.boundary_municipality_id
   WHERE s.approval_state = 'pending'
     AND NOT s.auto_dedupe_skip
     AND rr.state NOT IN ('pending', 'running')
     -- a summed parts-of-one-project merge keeper is not a plain copy
     AND (s.merge_snapshot IS NULL OR s.merge_snapshot->>'kind' = 'dedupe');

  DELETE FROM _nd WHERE nkey = '' OR muni IS NULL;

  INSERT INTO _nd
  SELECT 'committed', mp.id, NULL, mp.project_name, mp.phase_label,
         public.research_name_key(mp.project_name, mp.phase_label),
         lower(btrim(mm.name)), mm.state,
         CASE WHEN mp.total_housing_units > 0 THEN mp.total_housing_units END,
         4, mp.units_confidence, mp.created_at, '{}'::uuid[],
         coalesce(mp.parcel_numbers, '{}'),
         concat_ws(' ', mp.location_description, mp.parcel_boundary_notes, mp.notes),
         mp.source, mp.notes, mp.address
    FROM municipal_project mp
    JOIN municipality mm ON mm.id = mp.municipality_id
   WHERE (public.research_name_key(mp.project_name, mp.phase_label), lower(btrim(mm.name)))
         IN (SELECT nkey, muni FROM _nd WHERE kind = 'staged');

  -- Clear stale conflict snapshots in scope; this pass recomputes them.
  IF NOT p_dry_run THEN
    UPDATE municipal_project_staging s SET count_conflict = NULL
      FROM _nd
     WHERE _nd.kind = 'staged' AND s.id = _nd.id AND s.count_conflict IS NOT NULL
       AND (p_run_ids IS NULL OR _nd.run_id = ANY(p_run_ids)
            OR EXISTS (SELECT 1 FROM _nd o WHERE o.nkey = _nd.nkey AND o.muni = _nd.muni
                         AND o.st IS NOT DISTINCT FROM _nd.st AND o.run_id = ANY(p_run_ids)));
  END IF;

  FOR g IN
    SELECT nkey, muni, st
      FROM _nd
     GROUP BY nkey, muni, st
    HAVING count(*) > 1
       AND count(*) FILTER (WHERE kind = 'staged') > 0
       AND count(*) FILTER (WHERE units IS NOT NULL) > 0
       AND (p_run_ids IS NULL OR bool_or(run_id = ANY(p_run_ids)))
  LOOP
    SELECT * INTO k FROM _nd
     WHERE nkey = g.nkey AND muni = g.muni AND st IS NOT DISTINCT FROM g.st AND units IS NOT NULL
     ORDER BY rank DESC, created_at DESC
     LIMIT 1;

    -- Count conflict among counted copies (reviewer-separated ones excluded).
    -- Any conflict blocks ALL count-based rejections in the group: only copies
    -- with no count are still auto-rejected.
    v_conflict := (SELECT count(DISTINCT units) FROM _nd
         WHERE nkey = g.nkey AND muni = g.muni AND st IS NOT DISTINCT FROM g.st AND units IS NOT NULL
           AND NOT (k.id = ANY(not_dup))) > 1;
    IF v_conflict THEN
      SELECT jsonb_agg(jsonb_build_object(
               'kind', kind, 'id', id, 'project_name', project_name, 'phase_label', phase_label,
               'units', units, 'units_confidence', CASE WHEN kind = 'committed' THEN coalesce(conf, 'committed') ELSE conf END,
               'address', address, 'source', source, 'notes', left(notes, 1200))
             ORDER BY rank DESC, created_at DESC)
        INTO v_snap
        FROM _nd
       WHERE nkey = g.nkey AND muni = g.muni AND st IS NOT DISTINCT FROM g.st AND units IS NOT NULL;
      v_conf := v_conf || jsonb_build_object('name', k.project_name, 'members', v_snap);
      IF NOT p_dry_run THEN
        UPDATE municipal_project_staging s
           SET count_conflict = v_snap
          FROM _nd
         WHERE _nd.kind = 'staged' AND s.id = _nd.id AND _nd.units IS NOT NULL
           AND _nd.nkey = g.nkey AND _nd.muni = g.muni AND _nd.st IS NOT DISTINCT FROM g.st;
      END IF;
    END IF;

    FOR m IN
      SELECT * FROM _nd
       WHERE nkey = g.nkey AND muni = g.muni AND st IS NOT DISTINCT FROM g.st
         AND kind = 'staged' AND id <> k.id
         AND NOT (k.id = ANY(not_dup))
         AND (units IS NULL OR (units = k.units AND NOT v_conflict))
       ORDER BY created_at
    LOOP
      IF m.units IS NULL THEN
        v_reason := format('Duplicate without unit count — kept %s', k.id);
        v_rej_none := v_rej_none || jsonb_build_object('id', m.id, 'name', m.project_name, 'kept', k.id, 'kept_kind', k.kind);
      ELSE
        v_reason := format('Duplicate — kept %s', k.id);
        v_rej_eq := v_rej_eq || jsonb_build_object('id', m.id, 'name', m.project_name, 'units', m.units, 'kept', k.id, 'kept_kind', k.kind);
      END IF;

      IF NOT p_dry_run THEN
        -- Carry ONLY a parcel ID or acreage the keeper lacks.
        IF cardinality(m.parcels) > 0 AND cardinality(k.parcels) = 0 THEN
          IF k.kind = 'staged' THEN
            UPDATE municipal_project_staging SET parcel_numbers = m.parcels WHERE id = k.id;
          ELSE
            UPDATE municipal_project SET parcel_numbers = m.parcels WHERE id = k.id;
          END IF;
          UPDATE _nd SET parcels = m.parcels WHERE id = k.id;
          k.parcels := m.parcels;
        END IF;
        v_acres := public.research_text_acres(m.txt);
        IF v_acres IS NOT NULL AND public.research_text_acres(k.txt) IS NULL THEN
          IF k.kind = 'staged' THEN
            UPDATE municipal_project_staging
               SET notes = concat_ws(E'\n\n', nullif(btrim(notes), ''), format('Acreage from duplicate %s: %s ac', m.id, v_acres))
             WHERE id = k.id;
          ELSE
            UPDATE municipal_project
               SET notes = concat_ws(E'\n\n', nullif(btrim(notes), ''), format('Acreage from duplicate %s: %s ac', m.id, v_acres))
             WHERE id = k.id;
          END IF;
          UPDATE _nd SET txt = concat_ws(' ', txt, v_acres || ' ac') WHERE id = k.id;
          k.txt := concat_ws(' ', k.txt, v_acres || ' ac');
        END IF;

        UPDATE municipal_project_staging
           SET approval_state = 'rejected',
               reject_reason = v_reason,
               rejected_at = now(), rejected_by_id = NULL,
               auto_resolved_at = now(),
               count_conflict = NULL,
               duplicate_of_staging_id = CASE WHEN k.kind = 'staged' THEN k.id ELSE duplicate_of_staging_id END,
               duplicate_of_project_id = CASE WHEN k.kind = 'committed' THEN k.id ELSE duplicate_of_project_id END
         WHERE id = m.id AND approval_state = 'pending';
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object('dry_run', p_dry_run,
    'rejected_no_count', v_rej_none, 'rejected_equal_count', v_rej_eq, 'count_conflicts', v_conf);
END;
$function$;

REVOKE ALL ON FUNCTION public.research_name_key(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.research_text_acres(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.research_auto_dedupe_by_name(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_name_key(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.research_text_acres(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.research_auto_dedupe_by_name(uuid[], boolean) TO authenticated, service_role;

-- get_sweep_staging: live definition (as rebuilt in 20261114062517) + count_conflict.
DROP FUNCTION public.get_sweep_staging(uuid);
CREATE FUNCTION public.get_sweep_staging(p_sweep_id uuid)
 RETURNS TABLE(id uuid, research_run_id uuid, sweep_chunk_index integer, boundary_municipality_id uuid, muni_name text, muni_kind text, matched_existing_id uuid, approval_state text, project_name text, address text, location_description text, parcel_boundary_notes text, total_housing_units integer, builder_developer text, permit_url text, permit_application_date date, source text, discovery_source text, discovery_source_raw text, notes text, reject_reason text, duplicate_of_staging_id uuid, duplicate_of_project_name text, duplicate_of_run_id uuid, duplicate_of_chunk_index integer, phase_label text, not_duplicate_of_ids uuid[], merged_into_staging_id uuid, is_merge_keeper boolean, units_needs_review boolean, units_review_reason text, units_confidence text, lead_reason text, count_conflict jsonb)
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
    s.units_needs_review, s.units_review_reason, s.units_confidence, s.lead_reason, s.count_conflict
  FROM municipal_project_staging s
  JOIN research_run r ON r.id = s.research_run_id AND r.sweep_id = p_sweep_id
  LEFT JOIN boundary_municipality bm ON bm.id = s.boundary_municipality_id
  LEFT JOIN municipal_project_staging d ON d.id = s.duplicate_of_staging_id
  LEFT JOIN research_run dr ON dr.id = d.research_run_id
  ORDER BY bm.name, r.sweep_chunk_index, s.created_at;
$function$;
REVOKE ALL ON FUNCTION public.get_sweep_staging(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sweep_staging(uuid) TO authenticated, service_role;
