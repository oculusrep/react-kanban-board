-- Starbucks Licensed Store ("LS") Map Layer
-- Sibling to starbucks_store, but for licensed locations (Kroger, Target, Marriott, AAFES…).
-- Reuses the existing user_has_starbucks_access() gate from 20260505202621_starbucks_layer.sql.
--
-- CSV source columns (22 total, from "LS Store Query.csv"):
--   Store Name English, Store Number, Project Number, Lifecycle Status, Ownership Type,
--   Store Type, Actual Open Dt, Store Age, Licensee Name, Segment, LS Pipeline Decision Dt,
--   Ops District Role, Market Name, County Name, Address English, Suite English, City English,
--   State, Postal Code, Latitude, Longitude, Store Sq Ft
--
-- verified_latitude / verified_longitude are OVIS overrides (same pattern as property).
-- Map pins prefer verified_* if non-null, falling back to latitude/longitude from the CSV.

CREATE TABLE starbucks_licensed_store (
  store_number              TEXT PRIMARY KEY,
  store_name                TEXT,
  project_number            TEXT,
  lifecycle_status          TEXT,
  ownership_type            TEXT,
  store_type                TEXT,
  actual_open_date          DATE,
  store_age                 NUMERIC,
  licensee_name             TEXT,
  segment                   TEXT,
  ls_pipeline_decision_date DATE,
  ops_district_role         TEXT,
  market_name               TEXT,
  county_name               TEXT,
  address                   TEXT,
  suite                     TEXT,
  city                      TEXT,
  state                     TEXT,
  postal_code               TEXT,
  latitude                  DOUBLE PRECISION,
  longitude                 DOUBLE PRECISION,
  verified_latitude         DOUBLE PRECISION,
  verified_longitude        DOUBLE PRECISION,
  store_sqft                INTEGER,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_starbucks_licensed_store_coords
  ON starbucks_licensed_store (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX idx_starbucks_licensed_store_verified_coords
  ON starbucks_licensed_store (verified_latitude, verified_longitude)
  WHERE verified_latitude IS NOT NULL AND verified_longitude IS NOT NULL;

CREATE INDEX idx_starbucks_licensed_store_type    ON starbucks_licensed_store (store_type);
CREATE INDEX idx_starbucks_licensed_store_segment ON starbucks_licensed_store (segment);
CREATE INDEX idx_starbucks_licensed_store_market  ON starbucks_licensed_store (market_name);
CREATE INDEX idx_starbucks_licensed_store_state   ON starbucks_licensed_store (state);

CREATE OR REPLACE FUNCTION update_starbucks_licensed_store_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_starbucks_licensed_store_updated_at
  BEFORE UPDATE ON starbucks_licensed_store
  FOR EACH ROW EXECUTE FUNCTION update_starbucks_licensed_store_updated_at();

-- RLS: SELECT gated by the existing Starbucks-access helper.
-- UPDATE allowed so authorized users can persist verified_lat/lng via the map UI.
-- INSERT/DELETE go through the importer using the service role (bypasses RLS).
ALTER TABLE starbucks_licensed_store ENABLE ROW LEVEL SECURITY;

CREATE POLICY "starbucks_licensed_store_select"
  ON starbucks_licensed_store FOR SELECT TO authenticated
  USING (user_has_starbucks_access());

CREATE POLICY "starbucks_licensed_store_update_verified"
  ON starbucks_licensed_store FOR UPDATE TO authenticated
  USING (user_has_starbucks_access())
  WITH CHECK (user_has_starbucks_access());
