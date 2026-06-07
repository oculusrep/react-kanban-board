-- esri_enrichment_log: one row per ESRI GeoEnrichment call. Doubles as
-- (a) audit log for cost visibility ("who burned credits this month?")
-- and (b) cache backing store ("same lat/lng + radii in the last 30
-- days? skip the ESRI call"). See docs/DEMOGRAPHIC_CACHE_AND_LAYER_PLAN.md
-- for the design.

CREATE TABLE IF NOT EXISTS public.esri_enrichment_log (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  called_at       timestamptz NOT NULL DEFAULT now(),
  mode            text NOT NULL CHECK (mode IN ('rings', 'polygon')),

  -- rings/drive-time mode (mode = 'rings'):
  latitude        double precision,
  longitude       double precision,
  radii           numeric[],
  drive_times     numeric[],

  -- polygon mode (mode = 'polygon'):
  polygon                jsonb,
  polygon_centroid_lat   double precision,
  polygon_centroid_lng   double precision,
  polygon_vertex_count   int,

  -- Snapshot of the result so cache hits can return immediately:
  demographics    jsonb NOT NULL,
  tapestry        jsonb,
  isochrones      jsonb,

  -- Accounting:
  cache_hit       boolean NOT NULL DEFAULT false,
  success         boolean NOT NULL,
  error           text
);

COMMENT ON TABLE public.esri_enrichment_log IS
  'Audit log + cache for ESRI GeoEnrichment calls. Written by the esri-geoenrich edge function on every call (cache_hit=false for fresh ESRI calls, true when returning a cached row).';

-- Cache lookup index (rings mode): match on coordinates and recency.
-- radii/drive_times are filtered with array containment so the row's
-- superset cache covers requests for any subset.
CREATE INDEX IF NOT EXISTS esri_enrichment_log_lookup_rings
  ON public.esri_enrichment_log (latitude, longitude, called_at DESC)
  WHERE mode = 'rings' AND success = true AND cache_hit = false;

-- Polygon cache lookup: by stored centroid (cheap pre-filter) then
-- geometry equality. We deduplicate at write time on rounded coords
-- so the centroid is enough to find candidate rows.
CREATE INDEX IF NOT EXISTS esri_enrichment_log_lookup_polygon
  ON public.esri_enrichment_log (polygon_centroid_lat, polygon_centroid_lng, called_at DESC)
  WHERE mode = 'polygon' AND success = true AND cache_hit = false;

-- "What did <user> call this month?" dashboard query.
CREATE INDEX IF NOT EXISTS esri_enrichment_log_user_time
  ON public.esri_enrichment_log (user_id, called_at DESC);

-- Bbox query for the upcoming "Cached demographics" map layer.
CREATE INDEX IF NOT EXISTS esri_enrichment_log_bbox
  ON public.esri_enrichment_log (latitude, longitude)
  WHERE success = true;

-- ─── RLS ───────────────────────────────────────────────────────────
-- Reads: authenticated users see every successful row (so the cache
-- works across the team) and the upcoming map layer can render
-- everyone's past lookups. Writes: only the service role (edge fn).

ALTER TABLE public.esri_enrichment_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY esri_enrichment_log_read_authenticated
  ON public.esri_enrichment_log
  FOR SELECT
  TO authenticated
  USING (success = true);

CREATE POLICY esri_enrichment_log_write_service_role
  ON public.esri_enrichment_log
  FOR INSERT
  TO service_role
  WITH CHECK (true);
