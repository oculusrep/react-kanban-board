-- Starbucks Target Area Map Layer — GA target-area polygons imported from Starbucks-provided KML
-- Source: Starbucks GA_Target_Areas.kml (319 polygons, single-ring, WGS84)
--
-- Access model: identical to starbucks_store / starbucks_snapshot.
--   Internal:  can_view_starbucks_layer in user.permissions or role.permissions (user overrides role)
--   Portal:    contact.portal_access_enabled + client.starbucks_layer_enabled (Starbucks client)
-- The helper user_has_starbucks_access() is already defined in 20260505000001_starbucks_layer.sql
-- and is reused as-is here. Anyone who can see Starbucks store data also sees target areas.
-- Per-feature access split (separate target-area permission/flag) is intentionally NOT done — it
-- would require flipping flags for every Starbucks portal user with zero current product benefit.
--
-- Writes (insert/update/delete) go through service role and bypass RLS, matching the seed/re-import
-- workflow described in STARBUCKS_LAYER_SPEC.md.

-- PostGIS is required for the polygon geometry column. No-op if already enabled.
CREATE EXTENSION IF NOT EXISTS postgis;

-- ============================================================================
-- starbucks_target_area
-- One row per KML Placemark. target_area_id is the GUID from the KML and is
-- the natural key for re-import upserts.
-- ============================================================================
CREATE TABLE starbucks_target_area (
  id                            UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Natural key from Starbucks (GUID in the KML). Used for upsert on re-import.
  target_area_id                TEXT NOT NULL UNIQUE,

  -- Core identifying / display fields
  name                          TEXT NOT NULL,                 -- TARGETAREA_NAME_ENGLISH
  store_type                    TEXT,                          -- 'Drive Thru' | 'Drive Thru Only' | 'Cafe' | null
  priority                      SMALLINT CHECK (priority BETWEEN 1 AND 3),
  re_availability               TEXT,                          -- 'High' | 'Medium' | 'Low' | null
  notes                         TEXT,
  target_open_date              TEXT,                          -- kept as text; Starbucks sends it inconsistently / blank

  -- Geographic / market hierarchy
  state_province                TEXT,
  country                       TEXT,
  cbsa                          TEXT,
  cbsa_name                     TEXT,
  market_id                     BIGINT,
  market_name                   TEXT,
  minimarket_id                 TEXT,
  minimarket_name               TEXT,
  region_id                     INTEGER,
  planned_ops_area_id           INTEGER,
  planned_ops_area_name         TEXT,
  urbanity_code                 TEXT,
  urbanity_description          TEXT,

  -- RE constraints
  re_constraint_primary         TEXT,
  re_constraint_secondary       TEXT,
  re_constraint_tertiary        TEXT,

  -- Starbucks financial model fields
  model_yr1_sales               NUMERIC(14,2),
  model_tc_per                  NUMERIC(10,4),
  model_yr1_tc                  NUMERIC(14,2),
  model_cann_risk               TEXT,
  model_rent                    NUMERIC(14,2),
  model_other_occ               NUMERIC(14,2),
  model_store_cost              NUMERIC(14,2),
  model_last_update_date        DATE,

  -- Recommendation / proximity
  recommendation_distance       NUMERIC(14,4),
  recommendation_id             TEXT,

  -- Ownership / audit (from Starbucks side)
  sdm_mdm                       TEXT,                          -- "SDM/MDM" in the KML
  target_area_created_dt        TIMESTAMPTZ,
  target_area_created_user      TEXT,
  target_area_update_user       TEXT,                          -- TargetArea_UpdateUser
  target_area_update_date       TIMESTAMPTZ,                   -- TargetArea_UpdateDate
  target_area_proximity_alert   TEXT,
  target_area_secondary_concept TEXT,
  target_area_store_format      TEXT,

  -- Geometry (WGS84). Single polygon, no holes in current dataset.
  -- Switch to MultiPolygon if a future import contains multi-ring features.
  geom                          GEOMETRY(Polygon, 4326) NOT NULL,

  -- OVIS audit
  imported_at                   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX idx_starbucks_target_area_geom         ON starbucks_target_area USING GIST (geom);
CREATE INDEX idx_starbucks_target_area_priority     ON starbucks_target_area (priority);
CREATE INDEX idx_starbucks_target_area_store_type   ON starbucks_target_area (store_type);
CREATE INDEX idx_starbucks_target_area_market_name  ON starbucks_target_area (market_name);
CREATE INDEX idx_starbucks_target_area_sdm_mdm      ON starbucks_target_area (sdm_mdm);

-- updated_at trigger (dedicated function per the convention used by starbucks_store)
CREATE OR REPLACE FUNCTION update_starbucks_target_area_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_starbucks_target_area_updated_at
  BEFORE UPDATE ON starbucks_target_area
  FOR EACH ROW EXECUTE FUNCTION update_starbucks_target_area_updated_at();

-- ============================================================================
-- RLS — SELECT only. Reuses user_has_starbucks_access() from the store-layer
-- migration. Writes go through service role (bypasses RLS).
-- ============================================================================
ALTER TABLE starbucks_target_area ENABLE ROW LEVEL SECURITY;

CREATE POLICY "starbucks_target_area_select"
  ON starbucks_target_area FOR SELECT TO authenticated
  USING (user_has_starbucks_access());
