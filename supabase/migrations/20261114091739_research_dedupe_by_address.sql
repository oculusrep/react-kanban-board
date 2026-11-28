-- Dedupe pass 2: same normalized address + same unit count (within 5%),
-- even when names or phase labels differ. Called at the end of
-- research_auto_dedupe_by_name, so the submit pipeline and Fill missing units
-- run it with no caller changes.
--
-- Group = same municipality + same research_address_key (case, punctuation,
-- ZIP, state and street-suffix spellings ignored; at least street + type +
-- place, so a bare city name never groups), only copies WITH a count, and counts within 5%
-- (max <= 1.05 x min). Pending staged rows plus committed municipal_project rows.
-- Keeper: a committed record if there is one (committed rows are never
-- rejected); else the copy with a permit_url; if none or several have one, the
-- firmness order (approved > reported/NULL > estimated, then newest).
-- The keeper gains whatever it lacks from the others: permit_url, builder,
-- parcel IDs, acreage (as a note); each other copy's source is appended to the
-- keeper's source. Others are rejected (reversible; unreject sets auto_dedupe_skip).
-- Reviewer "not duplicates" pairs and auto_dedupe_skip rows are left alone.

CREATE FUNCTION public.research_address_key(p text)
RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $$
  WITH a AS (SELECT lower(coalesce(p, '')) AS s),
  b AS (  -- drop country, then a TRAILING ZIP only (a 5-digit house number stays), then state
    SELECT regexp_replace(regexp_replace(regexp_replace(s,
             '[\s,]*\m(usa|united states)\M[\s.]*$', '', 'g'),
             '[\s,]*\m\d{5}(-\d{4})?\s*$', '', 'g'),
             '\m(ga|georgia)\M', ' ', 'g') AS s FROM a),
  c AS (SELECT regexp_replace(s, '[^a-z0-9]+', ' ', 'g') AS s FROM b),
  d AS (  -- street-type and direction spellings
    SELECT regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           regexp_replace(regexp_replace(regexp_replace(regexp_replace(regexp_replace(
           regexp_replace(regexp_replace(regexp_replace(regexp_replace(s,
             '\mroad\M', 'rd', 'g'), '\mstreet\M', 'st', 'g'), '\mdrive\M', 'dr', 'g'),
             '\mavenue\M', 'ave', 'g'), '\mhighway\M', 'hwy', 'g'), '\mlane\M', 'ln', 'g'),
             '\mparkway\M', 'pkwy', 'g'), '\mboulevard\M', 'blvd', 'g'), '\mcircle\M', 'cir', 'g'),
             '\mcourt\M', 'ct', 'g'), '\mplace\M', 'pl', 'g'), '\mtrail\M', 'trl', 'g'),
             '\m(north|northeast|northwest|south|southeast|southwest|east|west)\M',
             '', 'g'),
             '\m(n|s|e|w|ne|nw|se|sw)\M', '', 'g') AS s FROM c)
  SELECT btrim(regexp_replace(s, '\s+', ' ', 'g')) FROM d;
$$;

CREATE FUNCTION public.research_auto_dedupe_by_address(p_run_ids uuid[] DEFAULT NULL, p_dry_run boolean DEFAULT false)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE
  g      record;
  k      record;
  m      record;
  v_out  jsonb := '[]';
  v_acres numeric;
BEGIN
  IF NOT (coalesce(auth.role(), '') = 'service_role'
          OR session_user = 'postgres'
          OR public.user_has_market_research_approve_access()) THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;

  DROP TABLE IF EXISTS pg_temp._na;
  CREATE TEMP TABLE _na ON COMMIT DROP AS
  SELECT 'staged'::text AS kind, s.id, s.research_run_id AS run_id, s.project_name,
         public.research_address_key(s.address) AS akey,
         lower(btrim(coalesce(mu.name, bm.name))) AS muni,
         s.total_housing_units AS units,
         (nullif(btrim(s.permit_url), '') IS NOT NULL) AS has_permit,
         CASE s.units_confidence WHEN 'approved' THEN 3 WHEN 'estimated' THEN 1 ELSE 2 END AS rank,
         s.created_at, coalesce(s.not_duplicate_of_ids, '{}') AS not_dup,
         s.permit_url, s.builder_developer, coalesce(s.parcel_numbers, '{}') AS parcels, s.source,
         concat_ws(' ', s.location_description, s.parcel_boundary_notes, s.notes) AS txt
    FROM municipal_project_staging s
    JOIN research_run rr ON rr.id = s.research_run_id
    LEFT JOIN municipality mu ON mu.id = s.municipality_id
    LEFT JOIN boundary_municipality bm ON bm.id = s.boundary_municipality_id
   WHERE s.approval_state = 'pending' AND NOT s.auto_dedupe_skip
     AND rr.state NOT IN ('pending', 'running')
     AND s.total_housing_units > 0 AND NOT s.units_needs_review
     AND (s.merge_snapshot IS NULL OR s.merge_snapshot->>'kind' = 'dedupe');
  -- At least two words ("brown bridge rd"): a bare city or county name is not an address.
  DELETE FROM _na WHERE muni IS NULL OR akey !~ '\S+ \S+ \S+';

  INSERT INTO _na
  SELECT 'committed', mp.id, NULL, mp.project_name, public.research_address_key(mp.address),
         lower(btrim(mm.name)), mp.total_housing_units,
         (nullif(btrim(mp.permit_url), '') IS NOT NULL), 9, mp.created_at, '{}'::uuid[],
         mp.permit_url, mp.builder_developer, coalesce(mp.parcel_numbers, '{}'), mp.source,
         concat_ws(' ', mp.location_description, mp.parcel_boundary_notes, mp.notes)
    FROM municipal_project mp JOIN municipality mm ON mm.id = mp.municipality_id
   WHERE mp.total_housing_units > 0
     AND (public.research_address_key(mp.address), lower(btrim(mm.name)))
         IN (SELECT akey, muni FROM _na WHERE kind = 'staged');

  FOR g IN
    SELECT akey, muni FROM _na GROUP BY akey, muni
    HAVING count(*) > 1 AND count(*) FILTER (WHERE kind = 'staged') > 0
       AND max(units) <= min(units) * 1.05
       AND (p_run_ids IS NULL OR bool_or(run_id = ANY(p_run_ids)))
  LOOP
    SELECT * INTO k FROM _na WHERE akey = g.akey AND muni = g.muni
     ORDER BY (kind = 'committed') DESC, has_permit DESC, rank DESC, created_at DESC LIMIT 1;

    FOR m IN SELECT * FROM _na WHERE akey = g.akey AND muni = g.muni AND kind = 'staged' AND id <> k.id
                AND NOT (k.id = ANY(not_dup)) ORDER BY created_at LOOP
      v_out := v_out || jsonb_build_object('id', m.id, 'name', m.project_name, 'units', m.units,
                 'kept', k.id, 'kept_name', k.project_name, 'kept_units', k.units, 'kept_kind', k.kind,
                 'address_key', g.akey);
      IF NOT p_dry_run THEN
        v_acres := public.research_text_acres(m.txt);
        IF k.kind = 'staged' THEN
          UPDATE municipal_project_staging SET
            permit_url = coalesce(nullif(btrim(permit_url), ''), m.permit_url),
            builder_developer = coalesce(nullif(btrim(builder_developer), ''), m.builder_developer),
            parcel_numbers = CASE WHEN cardinality(coalesce(parcel_numbers, '{}')) = 0 THEN m.parcels ELSE parcel_numbers END,
            notes = CASE WHEN v_acres IS NOT NULL AND public.research_text_acres(k.txt) IS NULL
                         THEN concat_ws(E'\n\n', nullif(btrim(notes), ''), format('Acreage from duplicate %s: %s ac', m.id, v_acres))
                         ELSE notes END,
            source = CASE WHEN nullif(btrim(m.source), '') IS NULL OR position(m.source IN coalesce(source, '')) > 0 THEN source
                          ELSE concat_ws(' | ', nullif(btrim(source), ''), 'Also: ' || m.source) END
           WHERE id = k.id;
        ELSE
          UPDATE municipal_project SET
            permit_url = coalesce(nullif(btrim(permit_url), ''), m.permit_url),
            builder_developer = coalesce(nullif(btrim(builder_developer), ''), m.builder_developer),
            parcel_numbers = CASE WHEN cardinality(coalesce(parcel_numbers, '{}')) = 0 THEN m.parcels ELSE parcel_numbers END,
            notes = CASE WHEN v_acres IS NOT NULL AND public.research_text_acres(k.txt) IS NULL
                         THEN concat_ws(E'\n\n', nullif(btrim(notes), ''), format('Acreage from duplicate %s: %s ac', m.id, v_acres))
                         ELSE notes END,
            source = CASE WHEN nullif(btrim(m.source), '') IS NULL OR position(m.source IN coalesce(source, '')) > 0 THEN source
                          ELSE concat_ws(' | ', nullif(btrim(source), ''), 'Also: ' || m.source) END
           WHERE id = k.id;
        END IF;
        -- the keeper's text now carries the acreage, so a third copy doesn't re-append
        UPDATE _na SET txt = concat_ws(' ', txt, v_acres || ' ac'),
                       permit_url = coalesce(nullif(btrim(permit_url), ''), m.permit_url),
                       source = concat_ws(' | ', source, m.source)
         WHERE id = k.id AND v_acres IS NOT NULL;
        SELECT * INTO k FROM _na WHERE id = k.id;

        UPDATE municipal_project_staging SET
          approval_state = 'rejected',
          reject_reason = CASE WHEN m.units = k.units
                               THEN format('Duplicate (same address) — kept %s', k.id)
                               ELSE format('Duplicate (same address, counts within 5%%) — kept %s', k.id) END,
          rejected_at = now(), rejected_by_id = NULL, auto_resolved_at = now(), count_conflict = NULL,
          duplicate_of_staging_id = CASE WHEN k.kind = 'staged' THEN k.id ELSE duplicate_of_staging_id END,
          duplicate_of_project_id = CASE WHEN k.kind = 'committed' THEN k.id ELSE duplicate_of_project_id END
         WHERE id = m.id AND approval_state = 'pending';
      END IF;
    END LOOP;
  END LOOP;
  RETURN v_out;
END;
$function$;

REVOKE ALL ON FUNCTION public.research_address_key(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.research_auto_dedupe_by_address(uuid[], boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_address_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.research_auto_dedupe_by_address(uuid[], boolean) TO authenticated, service_role;

-- research_auto_dedupe_by_name: live definition + calls the address pass.
CREATE OR REPLACE FUNCTION public.research_auto_dedupe_by_name(p_run_ids uuid[] DEFAULT NULL::uuid[], p_dry_run boolean DEFAULT false)
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
  v_rej_tol  jsonb := '[]';
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
    -- ADDED 20261114 tolerance: counts within 5% of each other (max <= 1.05 x min)
    -- count as matching; only a wider spread is a conflict.
    v_conflict := (SELECT max(units) > min(units) * 1.05 FROM _nd
         WHERE nkey = g.nkey AND muni = g.muni AND st IS NOT DISTINCT FROM g.st AND units IS NOT NULL
           AND NOT (k.id = ANY(not_dup)));
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
         AND (units IS NULL OR NOT v_conflict)
       ORDER BY created_at
    LOOP
      IF m.units IS NULL THEN
        v_reason := format('Duplicate without unit count — kept %s', k.id);
        v_rej_none := v_rej_none || jsonb_build_object('id', m.id, 'name', m.project_name, 'kept', k.id, 'kept_kind', k.kind);
      ELSIF m.units <> k.units THEN
        v_reason := format('Duplicate (counts within 5%%) — kept %s', k.id);
        v_rej_tol := v_rej_tol || jsonb_build_object('id', m.id, 'name', m.project_name, 'units', m.units, 'kept', k.id, 'kept_units', k.units, 'kept_kind', k.kind);
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

  -- ADDED 2026-11-14: second pass, same address + same count (names may differ).
  RETURN jsonb_build_object('dry_run', p_dry_run,
    'rejected_no_count', v_rej_none, 'rejected_equal_count', v_rej_eq,
    'rejected_within_5pct', v_rej_tol, 'count_conflicts', v_conf,
    'rejected_same_address', public.research_auto_dedupe_by_address(p_run_ids, p_dry_run));
END;
$function$;
