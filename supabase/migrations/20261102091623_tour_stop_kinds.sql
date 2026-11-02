-- Tour stop kinds + itinerary fields
-- Created: November 2, 2026
-- Description: A tour stop can now be
--     site_submit     — a site submit (every existing row; unchanged)
--     atlas_store     — an existing Starbucks store from the Atlas layer (starbucks_store)
--     licensed_store  — a Starbucks licensed store (starbucks_licensed_store)
--     custom          — lunch / coffee / hotel / meeting / other: name + address + coordinates
--   Store stops SNAPSHOT the store's name, city, market and coordinates when added. There is
--   deliberately NO foreign key to the store tables: they are reloaded on import, and an FK
--   would either block the reload or silently delete tour stops. store_number is a reference.
--
--   New itinerary fields: projected_opening (free text, e.g. 'Q3/Q4 FY28') and market
--   (stores/custom: the stored value; site submits: NULL = automatic, text = per-stop override).
--
--   tour_stop_markets(p_tour_id) resolves each stop's market:
--     tour_stop.market (override / snapshot)
--     → starbucks_target_area.market_name of the nearest target area within 2 mi (0 = inside)
--     → starbucks_store.market of the nearest Atlas store within 10 mi
--     → NULL
--   Site submit coordinates follow the app's precedence (resolveStopCoord):
--     site_submit.verified → property.verified → site_submit.sf_property → property.lat/lng.
--   SECURITY INVOKER: a caller without Starbucks access (user_has_starbucks_access) gets NULL
--   markets from the lookups rather than an error.
--
-- No new relations. Existing tour_stop grants/RLS cover the new columns (note: the existing
-- tour_stop_portal_select policy lets portal users of the tour's client read them too, same as notes).
-- No BEGIN/COMMIT: apply with psql --single-transaction (round-trip testable).

ALTER TABLE public.tour_stop
  ADD COLUMN IF NOT EXISTS stop_kind TEXT NOT NULL DEFAULT 'site_submit',
  ADD COLUMN IF NOT EXISTS store_number TEXT,
  ADD COLUMN IF NOT EXISTS stop_name TEXT,
  ADD COLUMN IF NOT EXISTS address TEXT,
  ADD COLUMN IF NOT EXISTS city TEXT,
  ADD COLUMN IF NOT EXISTS latitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS longitude DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS market TEXT,
  ADD COLUMN IF NOT EXISTS projected_opening TEXT;

ALTER TABLE public.tour_stop ALTER COLUMN site_submit_id DROP NOT NULL;

ALTER TABLE public.tour_stop DROP CONSTRAINT IF EXISTS tour_stop_kind_check;
ALTER TABLE public.tour_stop ADD CONSTRAINT tour_stop_kind_check CHECK (
  CASE stop_kind
    WHEN 'site_submit' THEN site_submit_id IS NOT NULL AND store_number IS NULL
    WHEN 'atlas_store' THEN site_submit_id IS NULL AND store_number IS NOT NULL
                            AND latitude IS NOT NULL AND longitude IS NOT NULL
    WHEN 'licensed_store' THEN site_submit_id IS NULL AND store_number IS NOT NULL
                            AND latitude IS NOT NULL AND longitude IS NOT NULL
    WHEN 'custom' THEN site_submit_id IS NULL AND store_number IS NULL
                       AND nullif(btrim(stop_name), '') IS NOT NULL
                       AND latitude IS NOT NULL AND longitude IS NOT NULL
    ELSE false
  END
);

ALTER TABLE public.tour_stop DROP CONSTRAINT IF EXISTS tour_stop_coords_range;
ALTER TABLE public.tour_stop ADD CONSTRAINT tour_stop_coords_range CHECK (
  (latitude IS NULL OR latitude BETWEEN -90 AND 90) AND (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

-- A store appears at most once per tour (site submits keep UNIQUE (tour_id, site_submit_id);
-- NULL site_submit_id on other kinds never collides there).
CREATE UNIQUE INDEX IF NOT EXISTS tour_stop_tour_store_key
  ON public.tour_stop (tour_id, stop_kind, store_number)
  WHERE store_number IS NOT NULL;

COMMENT ON COLUMN public.tour_stop.stop_kind IS 'site_submit | atlas_store | licensed_store | custom';
COMMENT ON COLUMN public.tour_stop.store_number IS 'Atlas/licensed store number (reference only, no FK: store tables are reloaded on import).';
COMMENT ON COLUMN public.tour_stop.stop_name IS 'Custom stop name, or the store name snapshotted when added. Site submits use display_label / auto name.';
COMMENT ON COLUMN public.tour_stop.market IS 'Stores/custom: stored market. Site submits: NULL = automatic (tour_stop_markets), text = override.';
COMMENT ON COLUMN public.tour_stop.projected_opening IS 'Free text for the itinerary, e.g. Q3/Q4 FY28.';

-- Custom stop types map onto categories.
INSERT INTO public.tour_stop_category (name, sort_order, default_stop_duration_minutes)
VALUES ('Lunch', 10, 45), ('Coffee', 11, 15), ('Hotel', 12, 0), ('Meeting', 13, 30)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- Market resolution
-- ============================================================================
CREATE OR REPLACE FUNCTION public.tour_stop_markets(p_tour_id UUID)
RETURNS TABLE (stop_id UUID, market TEXT)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, extensions
AS $$
  WITH s AS (
    SELECT ts.id, ts.market,
      CASE WHEN ts.stop_kind = 'site_submit' THEN
        COALESCE(
          CASE WHEN ss.verified_latitude IS NOT NULL AND ss.verified_longitude IS NOT NULL THEN point(ss.verified_longitude, ss.verified_latitude) END,
          CASE WHEN p.verified_latitude IS NOT NULL AND p.verified_longitude IS NOT NULL THEN point(p.verified_longitude, p.verified_latitude) END,
          CASE WHEN ss.sf_property_latitude IS NOT NULL AND ss.sf_property_longitude IS NOT NULL THEN point(ss.sf_property_longitude, ss.sf_property_latitude) END,
          CASE WHEN p.latitude IS NOT NULL AND p.longitude IS NOT NULL THEN point(p.longitude, p.latitude) END)
      ELSE
        CASE WHEN ts.latitude IS NOT NULL AND ts.longitude IS NOT NULL THEN point(ts.longitude, ts.latitude) END
      END AS pt
    FROM tour_stop ts
    LEFT JOIN site_submit ss ON ss.id = ts.site_submit_id
    LEFT JOIN property p ON p.id = ss.property_id
    WHERE ts.tour_id = p_tour_id
  ),
  g AS (
    SELECT s.id, s.market, CASE WHEN s.pt IS NOT NULL THEN st_setsrid(st_makepoint(s.pt[0], s.pt[1]), 4326) END AS geom
    FROM s
  )
  SELECT g.id,
    COALESCE(
      nullif(btrim(g.market), ''),
      (SELECT ta.market_name
         FROM starbucks_target_area ta
        WHERE g.geom IS NOT NULL AND ta.market_name IS NOT NULL
          AND st_dwithin(ta.geom::geography, g.geom::geography, 3218.69)   -- 2 mi
        ORDER BY st_distance(ta.geom::geography, g.geom::geography)
        LIMIT 1),
      (SELECT st.market
         FROM starbucks_store st
        WHERE g.geom IS NOT NULL AND st.market IS NOT NULL
          AND st.latitude IS NOT NULL AND st.longitude IS NOT NULL
          AND st_dwithin(st_setsrid(st_makepoint(st.longitude, st.latitude), 4326)::geography, g.geom::geography, 16093.4)  -- 10 mi
        ORDER BY st_distance(st_setsrid(st_makepoint(st.longitude, st.latitude), 4326)::geography, g.geom::geography)
        LIMIT 1)
    )
  FROM g;
$$;

REVOKE ALL ON FUNCTION public.tour_stop_markets(UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.tour_stop_markets(UUID) TO authenticated;
