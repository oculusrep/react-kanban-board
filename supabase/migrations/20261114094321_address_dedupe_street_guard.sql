-- Address dedupe, street-only guard. When the normalized address has no
-- house number ("brown bridge rd covington"), same street + same count is not
-- enough: also require one of
--   * a shared significant word in the project names (street name, place name
--     and generic words like Road / Subdivision / Phase / Mixed Use / Homes
--     ignored)
--   * the same builder/developer (a shared significant word in the field)
--   * an overlapping parcel ID or case number (case numbers read from name,
--     source and notes, incl. plat/appeal/permit numbers like PP23-000005)
-- Otherwise the pair is FLAGGED (duplicate pointer + auto_dedupe_note, which
-- the summary counts as "needs a decision"), not rejected.
-- Rebuilt from the LIVE research_auto_dedupe_by_address (2026-11-14).

-- Significant words of a name / builder: >= 3 letters, not numeric, not a
-- generic development / street / company word, not in p_exclude (the street
-- and place words).
CREATE FUNCTION public.research_sig_words(p text, p_exclude text)
RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $$
  SELECT coalesce(array_agg(DISTINCT w), '{}')
    FROM regexp_split_to_table(lower(coalesce(p, '')), '[^a-z0-9]+') AS w
   WHERE length(w) >= 3 AND w !~ '^[0-9]+$'
     AND w <> ALL (ARRAY[
       'road','street','drive','avenue','ave','highway','hwy','lane','parkway','pkwy','boulevard','blvd',
       'circle','cir','court','place','trail','trl','way','subdivision','subdiv','phase','mixed','use',
       'homes','home','townhomes','townhome','townhouse','townhouses','residential','development','dev',
       'project','property','properties','single','family','the','and','for','with','commercial',
       'apartments','apartment','units','unit','estates','estate','community','communities','north',
       'south','east','west','new','old','llc','inc','company','corp','group','partners','engineering',
       'ltd','lot','lots','fka','aka','formerly','owner','property','com','www','retail'])
     AND w <> ALL (regexp_split_to_array(lower(coalesce(p_exclude, '')), '[^a-z0-9]+'));
$$;
-- Case numbers for the street-only guard: research_case_numbers (rezoning
-- prefixes, shared with the older dedupe and left unchanged) PLUS plat /
-- appeal / permit numbers like PP23-000005, APP24-000002, FP25-12, LDP24-0031.
CREATE FUNCTION public.research_guard_case_numbers(p_text text, p_zoning text)
RETURNS text[] LANGUAGE sql IMMUTABLE PARALLEL SAFE SET search_path TO 'public'
AS $$
  SELECT coalesce(array_agg(DISTINCT c), '{}') FROM (
    SELECT unnest(public.research_case_numbers(p_text, p_zoning)) AS c
    UNION
    SELECT m[1] || m[2] || '-' || ltrim(m[3], '0')
      FROM regexp_matches(upper(coalesce(p_text, '') || ' ' || coalesce(p_zoning, '')),
             '(?:^|[^A-Z0-9])(PP|FP|APP|LDP|PSU|VAR|ZA|SP|SDP)[- ]?([0-9]{2})[- ]([0-9]{1,6})(?![0-9])', 'g') AS m
  ) t;
$$;
REVOKE ALL ON FUNCTION public.research_guard_case_numbers(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_guard_case_numbers(text, text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.research_sig_words(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.research_sig_words(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.research_auto_dedupe_by_address(p_run_ids uuid[] DEFAULT NULL::uuid[], p_dry_run boolean DEFAULT false)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  g      record;
  k      record;
  m      record;
  v_out  jsonb := '[]';
  v_acres numeric;
  v_related boolean;
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
         concat_ws(' ', s.location_description, s.parcel_boundary_notes, s.notes) AS txt,
         -- ADDED street-only guard: corroborating evidence
         public.research_sig_words(s.project_name, concat_ws(' ', public.research_address_key(s.address), coalesce(mu.name, bm.name))) AS nwords,
         public.research_sig_words(s.builder_developer, '') AS bwords,
         public.research_guard_case_numbers(concat_ws(' ', s.project_name, s.source, s.notes), s.zoning) AS cases
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
         concat_ws(' ', mp.location_description, mp.parcel_boundary_notes, mp.notes),
         public.research_sig_words(mp.project_name, concat_ws(' ', public.research_address_key(mp.address), mm.name)),
         public.research_sig_words(mp.builder_developer, ''),
         public.research_guard_case_numbers(concat_ws(' ', mp.project_name, mp.source, mp.notes), mp.zoning)
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
      -- ADDED: a street-only address (no house number) is weak evidence on its
      -- own. Also require a shared significant name word, the same builder, or
      -- an overlapping parcel ID / case number; otherwise flag, don't reject.
      IF g.akey !~ '^[0-9]' THEN
        v_related := (m.nwords && k.nwords)
          OR (m.bwords && k.bwords)
          OR (m.cases && k.cases)
          OR EXISTS (SELECT 1 FROM unnest(m.parcels) a, unnest(k.parcels) b
                      WHERE upper(regexp_replace(a, '[^0-9A-Za-z]', '', 'g')) = upper(regexp_replace(b, '[^0-9A-Za-z]', '', 'g'))
                        AND btrim(a) <> '');
        IF NOT v_related THEN
          v_out := v_out || jsonb_build_object('id', m.id, 'name', m.project_name, 'units', m.units,
                     'kept', k.id, 'kept_name', k.project_name, 'kept_units', k.units, 'kept_kind', k.kind,
                     'address_key', g.akey, 'flagged', true);
          IF NOT p_dry_run THEN
            UPDATE municipal_project_staging SET
              duplicate_of_staging_id = CASE WHEN k.kind = 'staged' THEN k.id ELSE duplicate_of_staging_id END,
              duplicate_of_project_id = CASE WHEN k.kind = 'committed' THEN k.id ELSE duplicate_of_project_id END,
              auto_dedupe_note = format('Possible duplicate of "%s": same street (%s) and unit count, but no shared name word, builder, parcel ID or case number. Check before approving.', k.project_name, g.akey)
             WHERE id = m.id AND approval_state = 'pending';
          END IF;
          CONTINUE;
        END IF;
      END IF;

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
