-- Starbucks Map Layer — confidential per-store sales data
-- Access: Mike + Arty (internal, via can_view_starbucks_layer permission override)
--         Starbucks client portal users (via client.starbucks_layer_enabled flag)
-- RLS enforced at DB level — data never reaches the wire without access.
--
-- Source spreadsheet columns (29 total, verified 2026-05-05):
--   Ops Area, Store #, Store Name, City, County, Market, Latitude, Longitude,
--   Store Type, Deal Type, Open Date, Relo Date, Store Age, SF, Lease Exp Date,
--   Optns Remain, Next Option Type, Annual Rent, Landlord, Rent as % of Sales,
--   RTM Sales, RTM Contributn, RTM Cash Flow, TC %, Cash TC %, AWS Last 12 Wks,
--   Sales Channel Mix, R52 Sales OTW, LHI Depreciation

-- ============================================================================
-- starbucks_store
-- One row per store. Stable identity/location data keyed by Store #.
-- ============================================================================
CREATE TABLE starbucks_store (
  store_number     TEXT PRIMARY KEY,
  store_name       TEXT,
  city             TEXT,
  county           TEXT,
  market           TEXT,
  latitude         DOUBLE PRECISION,
  longitude        DOUBLE PRECISION,
  open_date        DATE,
  relo_date        DATE,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_starbucks_store_coords ON starbucks_store (latitude, longitude)
  WHERE latitude IS NOT NULL AND longitude IS NOT NULL;

CREATE INDEX idx_starbucks_store_city ON starbucks_store (city);
CREATE INDEX idx_starbucks_store_market ON starbucks_store (market);

-- ============================================================================
-- starbucks_snapshot
-- One row per store per quarterly upload. snapshot_date comes from filename.
-- ============================================================================
CREATE TABLE starbucks_snapshot (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  store_number        TEXT NOT NULL REFERENCES starbucks_store(store_number) ON DELETE CASCADE,
  snapshot_date       DATE NOT NULL,

  -- Operational / lease
  ops_area            TEXT,
  store_type          TEXT,
  deal_type           TEXT,
  store_age           NUMERIC,
  sf                  INTEGER,
  lease_exp_date      DATE,
  optns_remain        INTEGER,
  next_option_type    TEXT,
  annual_rent         DOUBLE PRECISION,
  landlord            TEXT,
  rent_pct_of_sales   DOUBLE PRECISION,

  -- Sales & financial
  rtm_sales           DOUBLE PRECISION,
  rtm_contribution    DOUBLE PRECISION,
  rtm_cash_flow       DOUBLE PRECISION,
  tc_pct              DOUBLE PRECISION,
  cash_tc_pct         DOUBLE PRECISION,
  aws_last_12_wks     DOUBLE PRECISION,
  sales_channel_mix   TEXT,
  r52_sales_otw       DOUBLE PRECISION,
  lhi_depreciation    DOUBLE PRECISION,

  created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (store_number, snapshot_date)
);

CREATE INDEX idx_starbucks_snapshot_store_number ON starbucks_snapshot (store_number);
CREATE INDEX idx_starbucks_snapshot_date         ON starbucks_snapshot (snapshot_date DESC);
CREATE INDEX idx_starbucks_snapshot_store_date   ON starbucks_snapshot (store_number, snapshot_date DESC);

-- updated_at trigger for starbucks_store
CREATE OR REPLACE FUNCTION update_starbucks_store_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_starbucks_store_updated_at
  BEFORE UPDATE ON starbucks_store
  FOR EACH ROW EXECUTE FUNCTION update_starbucks_store_updated_at();

-- ============================================================================
-- Portal access flag on client table
-- Set to TRUE for the Starbucks client account to grant portal read access.
-- ============================================================================
ALTER TABLE client ADD COLUMN IF NOT EXISTS starbucks_layer_enabled BOOLEAN NOT NULL DEFAULT FALSE;

-- ============================================================================
-- RLS helper — evaluates whether the current authed user has Starbucks access.
-- Two paths:
--   1. Internal user: can_view_starbucks_layer = true in merged JSONB permissions
--   2. Portal user: contact.portal_access_enabled + client.starbucks_layer_enabled
-- SECURITY DEFINER so it can read role/user/client tables without exposing them.
-- ============================================================================
CREATE OR REPLACE FUNCTION user_has_starbucks_access()
RETURNS BOOLEAN LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT
    -- Path 1: internal user with permission flag (user override takes precedence over role)
    EXISTS (
      SELECT 1
      FROM "user" u
      LEFT JOIN role r ON r.name = u.ovis_role
      WHERE u.auth_user_id = auth.uid()
        AND COALESCE(
          (u.permissions  ->> 'can_view_starbucks_layer')::boolean,
          (r.permissions  ->> 'can_view_starbucks_layer')::boolean,
          FALSE
        ) = TRUE
    )
    OR
    -- Path 2: portal user whose linked client has Starbucks layer enabled
    EXISTS (
      SELECT 1
      FROM contact c
      JOIN auth.users au ON LOWER(au.email) = LOWER(c.email)
      JOIN portal_user_client_access puca ON puca.contact_id = c.id
      JOIN client cl ON cl.id = puca.client_id
      WHERE au.id = auth.uid()
        AND c.portal_access_enabled = TRUE
        AND puca.is_active = TRUE
        AND cl.starbucks_layer_enabled = TRUE
    );
$$;

-- ============================================================================
-- RLS policies
-- SELECT only — all writes go through the ETL service role (bypasses RLS).
-- ============================================================================
ALTER TABLE starbucks_store    ENABLE ROW LEVEL SECURITY;
ALTER TABLE starbucks_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "starbucks_store_select"
  ON starbucks_store FOR SELECT TO authenticated
  USING (user_has_starbucks_access());

CREATE POLICY "starbucks_snapshot_select"
  ON starbucks_snapshot FOR SELECT TO authenticated
  USING (user_has_starbucks_access());
