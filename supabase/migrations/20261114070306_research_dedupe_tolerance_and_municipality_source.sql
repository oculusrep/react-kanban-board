-- 1. Name dedupe: counts within 5% of each other count as matching
--    ("Duplicate (counts within 5%) — kept <id>"). Rebuilt from the LIVE definition.
-- 2. municipality_source: per-municipality memory of which research sources
--    work, are blocked, or don't exist, read/written by the research agent via
--    ovis-research-mcp (get_municipality_sources / set_municipality_source).
--    Seeded from the Alcovy Road deep sweep (607d4cc7, 2026-11-13).
-- Doc: docs/MARKET_RESEARCH_MUNICIPALITY_SOURCES.md

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

  RETURN jsonb_build_object('dry_run', p_dry_run,
    'rejected_no_count', v_rej_none, 'rejected_equal_count', v_rej_eq,
    'rejected_within_5pct', v_rej_tol, 'count_conflicts', v_conf);
END;
$function$

;

CREATE TABLE public.municipality_source (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  boundary_municipality_id uuid NOT NULL REFERENCES public.boundary_municipality(id) ON DELETE CASCADE,
  source_type              text NOT NULL CHECK (source_type IN ('permit_portal', 'minutes', 'agendas', 'plat_records')),
  url                      text,
  status                   text NOT NULL CHECK (status IN ('works', 'blocked', 'none_exists')),
  notes                    text,
  last_verified            timestamptz NOT NULL DEFAULT now(),
  verified_by_run_id       uuid REFERENCES public.research_run(id) ON DELETE SET NULL,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);
-- One entry per (municipality, source type, URL); "none exists" rows have no URL.
CREATE UNIQUE INDEX municipality_source_key
  ON public.municipality_source (boundary_municipality_id, source_type, coalesce(url, ''));

CREATE TRIGGER municipality_source_set_updated_at BEFORE UPDATE ON public.municipality_source
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

ALTER TABLE public.municipality_source ENABLE ROW LEVEL SECURITY;
CREATE POLICY municipality_source_read ON public.municipality_source
  FOR SELECT TO authenticated USING ((SELECT public.is_internal_user()));

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON public.municipality_source FROM anon, authenticated;
GRANT SELECT ON public.municipality_source TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.municipality_source TO service_role;

-- Seed: Alcovy Road deep sweep. verified_by = the chunk run that established it;
-- last_verified = that run's completion time.
INSERT INTO public.municipality_source
  (boundary_municipality_id, source_type, url, status, notes, last_verified, verified_by_run_id)
SELECT v.bm::uuid, v.st, v.url, v.status, v.notes, rr.completed_at, rr.id
  FROM (VALUES
    -- Covington
    ('6a862169-3977-42ff-a53d-f07afec0e819', 'permit_portal', NULL, 'none_exists',
     'No online permit search. Paper/in-person applications only. Confirmed in all 6 chunks.',
     '711e188e-cf3c-45b8-9b3b-daa437ea0251'),
    ('6a862169-3977-42ff-a53d-f07afec0e819', 'agendas', 'https://www.cityofcovington.org/', 'blocked',
     'CPC (2nd Tue) agenda PDFs live under ckeditorfiles/ with unpredictable filenames; event-ID and URL guessing failed (chunk 3, IDs 1283-1340). Some months never published (Jun/Jul 2025). Plain fetch of the site returns 406. Workaround that worked: City Council agendas/minutes, which carry PC recommendations and final plats.',
     '3d89ba5a-43f0-4610-8cf1-51b6b72c588a'),
    ('6a862169-3977-42ff-a53d-f07afec0e819', 'minutes', 'https://www.cityofcovington.org/', 'blocked',
     'CPC minutes online only through Apr 2023. City Council minutes ARE online and are the usable P&Z spine (one Aug 2024 PDF 404).',
     '711e188e-cf3c-45b8-9b3b-daa437ea0251'),
    -- Oxford
    ('50a2db75-4ae2-4fda-a34c-05bee2cc60f4', 'permit_portal', NULL, 'none_exists',
     'No online permit portal; paper-based development permits. Confirmed in all 6 chunks.',
     '711e188e-cf3c-45b8-9b3b-daa437ea0251'),
    ('50a2db75-4ae2-4fda-a34c-05bee2cc60f4', 'minutes', 'https://www.oxfordgeorgia.org/', 'none_exists',
     'Planning Commission minutes not posted after 2022 (pages 404). Council minutes posted only through May 2025 as of Nov 2026. PC actions appear embedded in council e-packets.',
     '711e188e-cf3c-45b8-9b3b-daa437ea0251'),
    ('50a2db75-4ae2-4fda-a34c-05bee2cc60f4', 'agendas', 'https://www.oxfordgeorgia.org/', 'works',
     'Council regular/work session agendas and e-packets on the city site. Some e-packets exceed fetch size (Jun 2025, 11 MB) and Jul-Oct 2025 e-packets 404. Town is ~2 sq mi; nearly all items are single-home permits.',
     '3d89ba5a-43f0-4610-8cf1-51b6b72c588a'),
    -- Newton County
    ('70401099-bddb-4769-9fb9-54ab8b4b0f1b', 'permit_portal', 'https://newtondevelopment.ncboc.com/case_status/', 'works',
     'WORKS (settles the sweep''s contradiction): public, no login. Needs a browser (JS-rendered); plain web_fetch can''t drive it, which is why chunk 0 called it undrivable and chunk 3 missed it. Chunks 1, 2, 4, 5 used it: Planning tab has Preliminary Plat (192 records total), Final Plat, LDP-Residential, Rezoning, Clearing & Grading, Multi-Family. Multi-Family date filter needs month-by-month calendar backtracking. Enumerate the Preliminary Plat list once and filter by date rather than per chunk.',
     '711e188e-cf3c-45b8-9b3b-daa437ea0251'),
    ('70401099-bddb-4769-9fb9-54ab8b4b0f1b', 'plat_records', 'https://newtondevelopment.ncboc.com/case_status/', 'works',
     'Preliminary and Final Plat case records (PP/FP numbers, lot counts in plat documents) are in the same portal.',
     '711e188e-cf3c-45b8-9b3b-daa437ea0251'),
    ('70401099-bddb-4769-9fb9-54ab8b4b0f1b', 'agendas', 'https://www.newtoncountyga.gov/AgendaCenter', 'works',
     'PC (4th Tue) and BOC agendas. Cloudflare: plain fetch returns 403, firecrawl gets through (chunk 2 retrieved all 6). Agenda IDs are not sequential by date; guessing IDs wasted calls (chunks 3, 4). Older PDFs (Nov 2023-Apr 2024) were 403 even so.',
     'cce2a6e3-da70-4618-8a94-259d863fd3c3'),
    ('70401099-bddb-4769-9fb9-54ab8b4b0f1b', 'minutes', 'https://www.newtoncountyga.gov/AgendaCenter', 'works',
     'BOC minutes posted, with lag (e.g. Sep 15 2026 not yet posted at sweep time). Same Cloudflare behaviour as agendas.',
     'a1dc01e6-db2e-4ef6-a6a3-f50b2575fd34')
  ) AS v(bm, st, url, status, notes, run)
  JOIN public.research_run rr ON rr.id = v.run::uuid;
