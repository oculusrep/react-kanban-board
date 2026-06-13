-- Boundary dataset for the market research agent's get_municipalities_in_radius tool.
-- See docs/market-research-agent-spec.md §6 and docs/MARKET_RESEARCH_AGENT_V1_PLAN.md Phase A.
--
-- Source: US Census TIGER/Line (TIGERweb ArcGIS REST), state-FIPS filtered.
--   Counties:            /State_County/MapServer/1
--   Incorporated Places: /Places_CouSub_ConCity_SubMCD/MapServer/4   (CDPs are layer 5, excluded)
--
-- v1 scope: GA only (~159 counties + ~538 incorporated places). Backfill is idempotent
-- on (kind, state, geoid); rerunning the backfill script for another state simply adds rows.

CREATE EXTENSION IF NOT EXISTS postgis;

CREATE TABLE public.boundary_municipality (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind         text NOT NULL CHECK (kind IN ('county','city')),
  state        text NOT NULL,                                    -- 'GA'
  fips_state   text NOT NULL,                                    -- '13'
  geoid        text NOT NULL,                                    -- Census GEOID; 5 chars for counties, 7 for places
  name         text NOT NULL,                                    -- normalized: 'Winder', 'Barrow County'
  raw_name     text NOT NULL,                                    -- as returned by TIGER: 'Winder city' / 'Barrow'
  lsadc        text,                                             -- LSADC for places ('25'=city, '43'=town, ...); null for counties
  population   int,                                              -- nullable; populated by a v1.x ACS enrichment pass
  geometry     geometry(MultiPolygon, 4326) NOT NULL,
  centroid     geometry(Point, 4326) NOT NULL,                   -- ST_PointOnSurface(geometry) — guaranteed to fall inside
  source       text NOT NULL DEFAULT 'tigerweb',
  source_year  int,                                              -- vintage year of the TIGER layer
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  UNIQUE (kind, state, geoid)
);
COMMENT ON TABLE public.boundary_municipality IS
  'GA-only (v1) lookup of cities + counties for the market research agent. centroid is ST_PointOnSurface(geometry) so it always falls inside the polygon — preferred over ST_Centroid for proximity ranking on concave shapes. See docs/MARKET_RESEARCH_AGENT_V1_PLAN.md Phase A.';

-- GIST indexes for radius queries
CREATE INDEX boundary_municipality_geometry_gix ON public.boundary_municipality USING GIST (geometry);
CREATE INDEX boundary_municipality_centroid_gix ON public.boundary_municipality USING GIST (centroid);
-- Secondary index for state/kind filtering (we always filter by state in v1)
CREATE INDEX boundary_municipality_state_kind_idx ON public.boundary_municipality (state, kind);

-- updated_at trigger (reuse existing helper)
CREATE TRIGGER boundary_municipality_set_updated_at
BEFORE UPDATE ON public.boundary_municipality
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS: read = authenticated (boundary data is reference data, everyone can see it).
-- Write = service-role only — the only writer is the backfill script using
-- SUPABASE_SERVICE_ROLE_KEY, which bypasses RLS. No admin-write policy needed.
ALTER TABLE public.boundary_municipality ENABLE ROW LEVEL SECURITY;
CREATE POLICY boundary_municipality_read
  ON public.boundary_municipality
  FOR SELECT TO authenticated
  USING (true);

-- Helper RPC for the backfill script. Takes a jsonb array of rows and inserts them
-- using PostGIS to parse the geometry server-side (we can't invoke ST_GeomFromGeoJSON
-- from the JS client directly). ST_Multi wraps single Polygons so the column type
-- (MultiPolygon) is uniform; ST_PointOnSurface picks an internal point for centroid.
--
-- Idempotent: ON CONFLICT (kind, state, geoid) DO UPDATE rewrites the row.
CREATE OR REPLACE FUNCTION public.upsert_boundary_municipalities(rows jsonb)
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  affected int := 0;
BEGIN
  WITH parsed AS (
    SELECT
      (r->>'kind')::text         AS kind,
      (r->>'state')::text        AS state,
      (r->>'fips_state')::text   AS fips_state,
      (r->>'geoid')::text        AS geoid,
      (r->>'name')::text         AS name,
      (r->>'raw_name')::text     AS raw_name,
      (r->>'lsadc')::text        AS lsadc,
      (r->>'source_year')::int   AS source_year,
      ST_Multi(ST_GeomFromGeoJSON(r->'geometry')) AS geom
    FROM jsonb_array_elements(rows) AS r
  ),
  upserted AS (
    INSERT INTO public.boundary_municipality
      (kind, state, fips_state, geoid, name, raw_name, lsadc, geometry, centroid, source_year)
    SELECT
      kind, state, fips_state, geoid, name, raw_name, lsadc,
      geom::geometry(MultiPolygon, 4326),
      ST_PointOnSurface(geom)::geometry(Point, 4326),
      source_year
    FROM parsed
    ON CONFLICT (kind, state, geoid) DO UPDATE SET
      name        = EXCLUDED.name,
      raw_name    = EXCLUDED.raw_name,
      lsadc       = EXCLUDED.lsadc,
      geometry    = EXCLUDED.geometry,
      centroid    = EXCLUDED.centroid,
      source_year = EXCLUDED.source_year,
      updated_at  = now()
    RETURNING 1
  )
  SELECT COUNT(*) INTO affected FROM upserted;
  RETURN affected;
END;
$$;

-- Lock down the helper: service_role only (backfill script).
REVOKE ALL ON FUNCTION public.upsert_boundary_municipalities(jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_boundary_municipalities(jsonb) TO service_role;
