-- Parcel subdivisions pass (2026-11-16).
--
-- Groups residential parcels in a county parcel layer by subdivision name within
-- a site's radius, asks Gemini when each was built, and:
--   * build-out / majority completion 2020+  -> staged as Recently Completed
--   * still building                         -> staged as Under Construction
--   * built before 2020                      -> established_subdivision (its own
--                                               map layer, never in growth totals)
--   * already in OVIS                        -> replace suggestion when OVIS has
--                                               fewer units than the parcel count
-- Doc: docs/MARKET_RESEARCH_PARCEL_SUBDIVISIONS.md

-- 1. Vocabulary -------------------------------------------------------------
ALTER TABLE public.research_run DROP CONSTRAINT research_run_research_scope_check;
ALTER TABLE public.research_run ADD CONSTRAINT research_run_research_scope_check
  CHECK (research_scope = ANY (ARRAY['full','window','evergreen','recent_built','parcel_subdivisions']));

ALTER TABLE public.municipal_project_staging DROP CONSTRAINT municipal_project_staging_discovery_source_check;
ALTER TABLE public.municipal_project_staging ADD CONSTRAINT municipal_project_staging_discovery_source_check
  CHECK (discovery_source IS NULL OR discovery_source = ANY (ARRAY['pz_agenda','news','permit_portal','activity_pdf','builder_site','econ_dev','other','gemini_recent','parcel_layer']));
ALTER TABLE public.municipal_project DROP CONSTRAINT municipal_project_discovery_source_check;
ALTER TABLE public.municipal_project ADD CONSTRAINT municipal_project_discovery_source_check
  CHECK (discovery_source IS NULL OR discovery_source = ANY (ARRAY['pz_agenda','news','permit_portal','activity_pdf','builder_site','econ_dev','other','gemini_recent','parcel_layer']));

CREATE OR REPLACE FUNCTION public.normalize_discovery_source(p_raw text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public'
AS $function$
  SELECT CASE
    WHEN p_raw IS NULL OR btrim(p_raw) = '' THEN NULL
    WHEN lower(btrim(replace(p_raw, '-', '_'))) IN
      ('pz_agenda','news','permit_portal','activity_pdf','builder_site','econ_dev','other','gemini_recent','parcel_layer')
      THEN lower(btrim(replace(p_raw, '-', '_')))
    ELSE 'other'
  END;
$function$;

-- 2. Log: parcel-basis rows -------------------------------------------------
ALTER TABLE public.research_recent_log
  ADD COLUMN basis text NOT NULL DEFAULT 'gemini' CHECK (basis IN ('gemini', 'parcels')),
  ADD COLUMN parcel_count integer;
ALTER TABLE public.research_recent_log DROP CONSTRAINT research_recent_log_outcome_check;
ALTER TABLE public.research_recent_log ADD CONSTRAINT research_recent_log_outcome_check
  CHECK (outcome = ANY (ARRAY['replace_suggested','dropped_equal','dropped_lower','dropped_no_count',
                              'dropped_no_evidence','dropped_old_or_small',
                              'staged','established','unknown_year']));

-- Replace: the note names the basis (parcel layer vs Gemini).
CREATE OR REPLACE FUNCTION public.research_recent_apply_replace(p_log_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  l      research_recent_log;
  v_note text;
BEGIN
  IF NOT public.user_has_market_research_approve_access() THEN
    RAISE EXCEPTION 'forbidden: can_approve_market_research required';
  END IF;
  SELECT * INTO l FROM research_recent_log WHERE id = p_log_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'suggestion not found: %', p_log_id; END IF;
  IF l.state <> 'pending' THEN RAISE EXCEPTION 'suggestion is %, not pending', l.state; END IF;

  -- CHANGED: parcel-basis suggestions say so.
  v_note := CASE WHEN l.basis = 'parcels'
    THEN format('[Units %s] OVIS %s → %s (parcel subdivisions pass: %s)',
                to_char(now() AT TIME ZONE 'America/New_York', 'YYYY-MM-DD'),
                coalesce(l.ovis_units::text, 'none'), l.gemini_units, coalesce(l.gemini_source, 'parcel layer'))
    ELSE format('[Units %s] OVIS %s → %s (recently built pass, Gemini: %s)',
                to_char(now() AT TIME ZONE 'America/New_York', 'YYYY-MM-DD'),
                coalesce(l.ovis_units::text, 'none'), l.gemini_units, coalesce(l.gemini_source, 'no source')) END;
  IF l.known_kind = 'committed' THEN
    UPDATE municipal_project SET total_housing_units = l.gemini_units, units_confidence = 'reported',
           notes = concat_ws(E'\n', nullif(notes, ''), v_note), updated_at = now()
     WHERE id = l.known_project_id;
  ELSE
    UPDATE municipal_project_staging SET total_housing_units = l.gemini_units, units_confidence = 'reported',
           notes = concat_ws(E'\n', nullif(notes, ''), v_note), updated_at = now()
     WHERE id = l.known_staging_id;
  END IF;
  IF NOT FOUND THEN RAISE EXCEPTION 'the existing record is gone'; END IF;

  UPDATE research_recent_log SET state = 'replaced', resolved_at = now(), resolved_by_id = auth.uid() WHERE id = p_log_id;
  RETURN jsonb_build_object('id', p_log_id, 'state', 'replaced', 'units', l.gemini_units);
END;
$function$;

-- 3. Summary: parcel-layer Recently Completed rows join the recent bucket ---
CREATE OR REPLACE FUNCTION public.get_research_summary(p_run_ids uuid[])
 RETURNS jsonb
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  WITH p AS (
    SELECT s.id, s.units_confidence, s.count_conflict, s.duplicate_of_project_id,
           (s.geometry IS NOT NULL) AS has_boundary,
           -- ADDED recently built pass: its own bucket, kept out of the pipeline buckets.
           -- CHANGED 2026-11-16: parcel-layer rows staged as Recently Completed too.
           (s.discovery_source = 'gemini_recent'
            OR (s.discovery_source = 'parcel_layer'
                AND s.status_stage_id = (SELECT ps.id FROM project_stage ps WHERE ps.name = 'Recently Completed'))) AS recent,
           -- ADDED research_locate: boundary, a precise geocode of the address,
           -- or a precise located pin (estimated).
           (s.geometry IS NOT NULL OR s.location_precision = 'precise' OR s.located_lat IS NOT NULL) AS precise_pin,
           s.duplicate_of_staging_id, s.lead_reason,
           CASE WHEN s.total_housing_units > 0 AND NOT s.units_needs_review
                THEN s.total_housing_units END AS u
      FROM municipal_project_staging s
     WHERE s.research_run_id = ANY(p_run_ids) AND s.approval_state = 'pending'
  ), b AS (
    SELECT p.*,
      CASE
        WHEN recent THEN CASE WHEN lead_reason IS NULL THEN 'recent' ELSE 'recent_lead' END
        WHEN u IS NULL THEN 'leads'
        WHEN (jsonb_typeof(count_conflict) = 'array' AND jsonb_array_length(count_conflict) > 1)
          OR duplicate_of_project_id IS NOT NULL
          OR (duplicate_of_staging_id IS NOT NULL AND EXISTS (SELECT 1 FROM p d WHERE d.id = p.duplicate_of_staging_id))
          OR lead_reason IS NOT NULL
        THEN 'decision'
        ELSE 'ready'
      END AS bucket,
      coalesce(
        (SELECT min(x->>'id') FROM jsonb_array_elements(
           CASE WHEN jsonb_typeof(count_conflict) = 'array' THEN count_conflict ELSE '[]'::jsonb END) x
          WHERE x->>'kind' = 'staged'),
        CASE WHEN duplicate_of_staging_id IS NOT NULL
             THEN least(id::text, duplicate_of_staging_id::text) END,
        id::text) AS grp
    FROM p
  ), g AS (
    SELECT grp, min(u) AS lo, max(u) AS hi FROM b WHERE bucket = 'decision' GROUP BY grp
  )
  SELECT jsonb_build_object(
    'pending', count(*) FILTER (WHERE NOT recent),
    'ready', jsonb_build_object(
      'records', count(*) FILTER (WHERE bucket = 'ready'),
      'units', coalesce(sum(u) FILTER (WHERE bucket = 'ready'), 0),
      'estimated_units', coalesce(sum(u) FILTER (WHERE bucket = 'ready' AND units_confidence = 'estimated'), 0),
      'with_boundary', count(*) FILTER (WHERE bucket = 'ready' AND has_boundary),
      'with_precise_pin', count(*) FILTER (WHERE bucket = 'ready' AND precise_pin)),
    'decision', jsonb_build_object(
      'records', count(*) FILTER (WHERE bucket = 'decision'),
      'groups', (SELECT count(*) FROM g),
      'units_low', (SELECT coalesce(sum(lo), 0) FROM g),
      'units_high', (SELECT coalesce(sum(hi), 0) FROM g)),
    'leads', jsonb_build_object('records', count(*) FILTER (WHERE bucket = 'leads')),
    'recent', jsonb_build_object(
      'records', count(*) FILTER (WHERE bucket = 'recent'),
      'units', coalesce(sum(u) FILTER (WHERE bucket = 'recent'), 0),
      'without_count', count(*) FILTER (WHERE bucket = 'recent' AND u IS NULL),
      'outside_radius', count(*) FILTER (WHERE bucket = 'recent_lead')))
  FROM b;
$function$;

-- 4. Established (pre-2020) subdivisions -----------------------------------
-- Reference only: never a municipal_project, so never in a pipeline total.
CREATE TABLE public.established_subdivision (
  id                        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  county                    text NOT NULL,
  subdivision_key           text NOT NULL,
  name                      text NOT NULL,
  source_layers             text[] NOT NULL DEFAULT '{}',
  boundary_municipality_id  uuid REFERENCES public.boundary_municipality(id) ON DELETE SET NULL,
  city                      text,
  parcel_count              integer NOT NULL CHECK (parcel_count > 0),
  year_first_homes          integer CHECK (year_first_homes BETWEEN 1850 AND 2100),
  year_built_out            integer CHECK (year_built_out BETWEEN 1850 AND 2100),
  year_majority             integer CHECK (year_majority BETWEEN 1850 AND 2100),
  basis_detail              text,
  sources                   text[] NOT NULL DEFAULT '{}',
  geometry                  geometry(MultiPolygon, 4326) NOT NULL,
  centroid                  geometry(Point, 4326) NOT NULL,
  research_run_id           uuid REFERENCES public.research_run(id) ON DELETE SET NULL,
  created_at                timestamptz NOT NULL DEFAULT now(),
  updated_at                timestamptz NOT NULL DEFAULT now(),
  UNIQUE (county, subdivision_key)
);
CREATE INDEX established_subdivision_geom_idx ON public.established_subdivision USING gist (geometry);

ALTER TABLE public.established_subdivision ENABLE ROW LEVEL SECURITY;
CREATE POLICY established_subdivision_read ON public.established_subdivision
  FOR SELECT TO authenticated USING ((SELECT public.is_internal_user()));

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON public.established_subdivision FROM anon, authenticated;
GRANT SELECT ON public.established_subdivision TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.established_subdivision TO service_role;

-- Map layer read: lat/lng + GeoJSON (RLS applies: SECURITY INVOKER).
CREATE OR REPLACE FUNCTION public.get_established_subdivisions()
 RETURNS TABLE (id uuid, name text, city text, county text, parcel_count integer,
                year_first_homes integer, year_built_out integer, year_majority integer,
                basis_detail text, sources text[], lat double precision, lng double precision, geojson jsonb)
 LANGUAGE sql
 STABLE
 SECURITY INVOKER
 SET search_path TO 'public'
AS $function$
  SELECT e.id, e.name, e.city, e.county, e.parcel_count, e.year_first_homes, e.year_built_out, e.year_majority,
         e.basis_detail, e.sources, ST_Y(e.centroid), ST_X(e.centroid), ST_AsGeoJSON(e.geometry, 6)::jsonb
    FROM established_subdivision e
   ORDER BY e.name;
$function$;
REVOKE ALL ON FUNCTION public.get_established_subdivisions() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_established_subdivisions() TO authenticated;

-- 5. Helpers for the pass (service role only) -------------------------------

-- Union a subdivision's parcels and look it up in OVIS: name (same
-- municipalities as the run), or space (a record's pin inside the union, or a
-- boundary overlapping it by 25%+ of the smaller shape).
CREATE OR REPLACE FUNCTION public.research_parcel_subdivision_lookup(p_run_id uuid, p_name text, p_parts jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_munis uuid[];
  v_names text[];
  v_geom  geometry;
  v_pt    geometry;
  v_nkey  text := public.research_name_key(p_name, '');
  v_muni  record;
  v_match jsonb;
BEGIN
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR session_user = 'postgres') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  SELECT recent_muni_ids INTO v_munis FROM research_run WHERE id = p_run_id;
  SELECT array_agg(lower(btrim(name))) INTO v_names FROM boundary_municipality WHERE id = ANY(v_munis);

  SELECT ST_Union(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON(part::text), 4326)))
    INTO v_geom FROM jsonb_array_elements(p_parts) part;
  v_geom := ST_Multi(ST_CollectionExtract(ST_MakeValid(v_geom), 3));
  IF v_geom IS NULL OR ST_IsEmpty(v_geom) THEN RAISE EXCEPTION 'no polygon from parcels'; END IF;
  v_pt := ST_PointOnSurface(v_geom);

  -- City first, then county.
  SELECT bm.id, bm.name INTO v_muni FROM boundary_municipality bm
   WHERE bm.id = ANY(v_munis) AND ST_Contains(bm.geometry, v_pt)
   ORDER BY (bm.kind = 'county'), bm.name LIMIT 1;

  WITH c AS (
    SELECT 'committed' AS kind, mp.id, mp.project_name AS name, mp.total_housing_units AS units,
           CASE WHEN public.research_name_key(mp.project_name, '') = v_nkey
                     AND lower(btrim(mm.name)) = ANY(v_names) THEN 'name'
                WHEN mp.centroid IS NOT NULL AND ST_Contains(v_geom, mp.centroid) THEN 'pin_inside'
                ELSE 'boundary_overlap' END AS how,
           mp.created_at
      FROM municipal_project mp JOIN municipality mm ON mm.id = mp.municipality_id
     WHERE (public.research_name_key(mp.project_name, '') = v_nkey AND lower(btrim(mm.name)) = ANY(v_names))
        OR (mp.centroid IS NOT NULL AND ST_Contains(v_geom, mp.centroid))
        OR (mp.geometry IS NOT NULL AND ST_Intersects(mp.geometry, v_geom)
            AND ST_Area(ST_Intersection(ST_MakeValid(mp.geometry), v_geom)::geography)
                >= 0.25 * least(ST_Area(mp.geometry::geography), ST_Area(v_geom::geography)))
    UNION ALL
    SELECT 'staged', o.id, o.project_name, o.total_housing_units,
           CASE WHEN public.research_name_key(o.project_name, '') = v_nkey AND o.boundary_municipality_id = ANY(v_munis) THEN 'name'
                WHEN o.geometry IS NOT NULL THEN 'boundary_overlap'
                ELSE 'pin_inside' END,
           o.created_at
      FROM municipal_project_staging o
     WHERE o.research_run_id <> p_run_id
       AND (o.approval_state = 'pending' OR (o.approval_state = 'approved' AND o.approved_municipal_project_id IS NULL))
       AND ((public.research_name_key(o.project_name, '') = v_nkey AND o.boundary_municipality_id = ANY(v_munis))
         OR (o.geometry IS NOT NULL AND ST_Intersects(o.geometry, v_geom)
             AND ST_Area(ST_Intersection(ST_MakeValid(o.geometry), v_geom)::geography)
                 >= 0.25 * least(ST_Area(o.geometry::geography), ST_Area(v_geom::geography)))
         OR (o.geometry IS NULL AND o.located_lat IS NOT NULL
             AND ST_Contains(v_geom, ST_SetSRID(ST_MakePoint(o.located_lng, o.located_lat), 4326)))
         OR (o.geometry IS NULL AND o.located_lat IS NULL AND o.address_lat IS NOT NULL
             AND ST_Contains(v_geom, ST_SetSRID(ST_MakePoint(o.address_lng, o.address_lat), 4326))))
  )
  SELECT coalesce(jsonb_agg(jsonb_build_object('kind', kind, 'id', id, 'name', name, 'units', units, 'how', how)
                  ORDER BY (how = 'name') DESC, (kind = 'committed') DESC, created_at), '[]')
    INTO v_match FROM c;

  RETURN jsonb_build_object(
    'geojson', ST_AsGeoJSON(v_geom, 7)::jsonb,
    'acres', round((ST_Area(v_geom::geography) / 4046.8564224)::numeric, 1),
    'lat', ST_Y(v_pt), 'lng', ST_X(v_pt),
    'distance_mi', (SELECT round((ST_Distance(v_pt::geography,
                      ST_SetSRID(ST_MakePoint(coalesce(s.verified_longitude, p.verified_longitude, p.longitude),
                                              coalesce(s.verified_latitude, p.verified_latitude, p.latitude)), 4326)::geography)
                      / 1609.344)::numeric, 2)
                      FROM research_run r JOIN site_submit s ON s.id = r.site_submit_id
                      LEFT JOIN property p ON p.id = s.property_id WHERE r.id = p_run_id),
    'boundary_municipality_id', v_muni.id, 'municipality', v_muni.name,
    'matches', v_match);
END;
$function$;
REVOKE ALL ON FUNCTION public.research_parcel_subdivision_lookup(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.research_parcel_subdivision_lookup(uuid, text, jsonb) TO service_role;

-- Write or refresh one established subdivision (geometry from the union GeoJSON).
CREATE OR REPLACE FUNCTION public.upsert_established_subdivision(p jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_geom geometry := ST_Multi(ST_CollectionExtract(ST_MakeValid(ST_SetSRID(ST_GeomFromGeoJSON((p->'geojson')::text), 4326)), 3));
  v_id   uuid;
BEGIN
  IF NOT (coalesce(auth.role(), '') = 'service_role' OR session_user = 'postgres') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  INSERT INTO established_subdivision AS e (county, subdivision_key, name, source_layers, boundary_municipality_id, city,
      parcel_count, year_first_homes, year_built_out, year_majority, basis_detail, sources, geometry, centroid, research_run_id)
  VALUES (p->>'county', public.research_name_key(p->>'name', ''), p->>'name',
      coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'source_layers')), '{}'),
      nullif(p->>'boundary_municipality_id', '')::uuid, p->>'city', (p->>'parcel_count')::int,
      (p->>'year_first_homes')::int, (p->>'year_built_out')::int, (p->>'year_majority')::int, p->>'basis_detail',
      coalesce(ARRAY(SELECT jsonb_array_elements_text(p->'sources')), '{}'),
      v_geom, ST_PointOnSurface(v_geom), nullif(p->>'research_run_id', '')::uuid)
  ON CONFLICT (county, subdivision_key) DO UPDATE SET
      name = EXCLUDED.name, source_layers = EXCLUDED.source_layers,
      boundary_municipality_id = EXCLUDED.boundary_municipality_id, city = EXCLUDED.city,
      parcel_count = EXCLUDED.parcel_count, year_first_homes = EXCLUDED.year_first_homes,
      year_built_out = EXCLUDED.year_built_out, year_majority = EXCLUDED.year_majority,
      basis_detail = EXCLUDED.basis_detail, sources = EXCLUDED.sources,
      geometry = EXCLUDED.geometry, centroid = EXCLUDED.centroid,
      research_run_id = EXCLUDED.research_run_id, updated_at = now()
  RETURNING e.id INTO v_id;
  RETURN v_id;
END;
$function$;
REVOKE ALL ON FUNCTION public.upsert_established_subdivision(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_established_subdivision(jsonb) TO service_role;
