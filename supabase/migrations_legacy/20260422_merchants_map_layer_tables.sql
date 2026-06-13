-- Migration: Merchants map layer — core tables
-- Date: 2026-04-22
-- Spec: docs/MERCHANTS_LAYER_SPEC.md
--
-- Creates seven tables supporting the Merchants map layer:
--   merchant_category        - admin-managed taxonomy
--   merchant_brand           - curated master list of merchant brands
--   merchant_location        - Google Places cache (one row per physical location)
--   merchant_favorite        - user-owned merchant sets ("Starbucks Competition")
--   merchant_favorite_brand  - many-to-many: favorites <-> brands
--   merchant_favorite_share  - Google-Docs-style sharing of favorites
--   merchant_closure_alert   - in-app alerts when a location's business_status flips
--
-- RLS model:
--   - Admin-managed tables (category, brand, location): all authenticated read; write = admins only.
--   - User-owned (favorite, favorite_brand): owner has full control; shared users get view or edit.
--   - Alerts: everyone reads/acknowledges; writes from system via service_role.
--
-- Helper functions (SECURITY DEFINER) avoid cross-table RLS recursion between
-- merchant_favorite and merchant_favorite_share.


-- ============================================================================
-- 0. Helper functions (SECURITY DEFINER — bypass RLS)
-- ============================================================================

-- plpgsql (not sql) so references to tables created later in this migration
-- are resolved lazily at call time, not at function-creation time.

-- Returns the "user".id for the currently-authenticated Supabase auth user.
-- SECURITY DEFINER lets callers use this in RLS policies without triggering
-- RLS on the "user" table for every row check.
CREATE OR REPLACE FUNCTION public.merchants_current_user_id()
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
DECLARE
  result uuid;
BEGIN
  SELECT id INTO result FROM "user" WHERE auth_user_id = auth.uid() LIMIT 1;
  RETURN result;
END;
$$;

-- Returns TRUE if the current user owns the given favorite.
CREATE OR REPLACE FUNCTION public.merchants_is_favorite_owner(fav_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM merchant_favorite f
    WHERE f.id = fav_id
      AND f.owner_user_id = public.merchants_current_user_id()
  );
END;
$$;

-- Returns TRUE if the current user can edit the given favorite (owner or edit-shared).
CREATE OR REPLACE FUNCTION public.merchants_can_edit_favorite(fav_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM merchant_favorite f
    WHERE f.id = fav_id
      AND f.owner_user_id = public.merchants_current_user_id()
  ) OR EXISTS (
    SELECT 1 FROM merchant_favorite_share s
    WHERE s.favorite_id = fav_id
      AND s.user_id = public.merchants_current_user_id()
      AND s.permission = 'edit'
  );
END;
$$;

-- Returns TRUE if the current user can view the given favorite (owner or any-permission share).
CREATE OR REPLACE FUNCTION public.merchants_can_view_favorite(fav_id uuid)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM merchant_favorite f
    WHERE f.id = fav_id
      AND f.owner_user_id = public.merchants_current_user_id()
  ) OR EXISTS (
    SELECT 1 FROM merchant_favorite_share s
    WHERE s.favorite_id = fav_id
      AND s.user_id = public.merchants_current_user_id()
  );
END;
$$;

-- Returns TRUE if the current user has ovis_role='admin'.
CREATE OR REPLACE FUNCTION public.merchants_is_admin()
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
STABLE
AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM "user" u
    WHERE u.auth_user_id = auth.uid()
      AND u.ovis_role = 'admin'
  );
END;
$$;


-- ============================================================================
-- 1. merchant_category — admin-managed taxonomy
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_category (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                    text NOT NULL UNIQUE,          -- "Grocery Stores"
  display_order           integer NOT NULL DEFAULT 100,  -- For UI sort in drawer
  refresh_frequency_days  integer NOT NULL DEFAULT 30,   -- Per-category Places refresh cadence (spec §10)
  last_refreshed_at       timestamptz,                   -- Last time any brand in this category was refreshed
  created_at              timestamptz NOT NULL DEFAULT now(),
  updated_at              timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_merchant_category_display_order ON merchant_category(display_order);

ALTER TABLE merchant_category ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read categories"
  ON merchant_category FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert categories"
  ON merchant_category FOR INSERT
  TO authenticated
  WITH CHECK (
    public.merchants_is_admin()
  );

CREATE POLICY "Admins can update categories"
  ON merchant_category FOR UPDATE
  TO authenticated
  USING (
    public.merchants_is_admin()
  );

CREATE POLICY "Admins can delete categories"
  ON merchant_category FOR DELETE
  TO authenticated
  USING (
    public.merchants_is_admin()
  );


-- ============================================================================
-- 2. merchant_brand — curated master list
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_brand (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name                text NOT NULL,                      -- "Starbucks"
  normalized_name     text NOT NULL UNIQUE,               -- "starbucks" (lowercased, trimmed) for dedup
  category_id         uuid NOT NULL REFERENCES merchant_category(id) ON DELETE RESTRICT,

  -- Brandfetch resolution (spec §5 — hotlinked at render time, no local cache)
  brandfetch_domain   text,                               -- "starbucks.com"; overrides auto-match when set
  logo_url            text,                               -- Brandfetch CDN URL (hotlinked, not downloaded)
  logo_fetched_at     timestamptz,                        -- Last successful Brandfetch API call; refreshed monthly to maintain license

  -- Places search tuning
  places_search_query text,                               -- Override for Text Search (default uses name)
  places_type_filter  text,                               -- Optional: 'cafe', 'grocery_or_supermarket', etc.

  -- Ingestion state
  last_ingested_at    timestamptz,                        -- Last Places ingestion for this brand
  last_verified_at    timestamptz,                        -- Last closure-verification run

  -- Operational
  is_active           boolean NOT NULL DEFAULT true,      -- Soft-disable without deleting
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_merchant_brand_category ON merchant_brand(category_id);
CREATE INDEX idx_merchant_brand_active ON merchant_brand(is_active) WHERE is_active = true;

ALTER TABLE merchant_brand ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read brands"
  ON merchant_brand FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert brands"
  ON merchant_brand FOR INSERT
  TO authenticated
  WITH CHECK (
    public.merchants_is_admin()
  );

CREATE POLICY "Admins can update brands"
  ON merchant_brand FOR UPDATE
  TO authenticated
  USING (
    public.merchants_is_admin()
  );

CREATE POLICY "Admins can delete brands"
  ON merchant_brand FOR DELETE
  TO authenticated
  USING (
    public.merchants_is_admin()
  );


-- ============================================================================
-- 3. merchant_location — Google Places cache
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_location (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id            uuid NOT NULL REFERENCES merchant_brand(id) ON DELETE CASCADE,
  google_place_id     text NOT NULL UNIQUE,
  name                text NOT NULL,                      -- From Places (may vary slightly from brand.name)
  latitude            numeric(10, 7) NOT NULL,
  longitude           numeric(10, 7) NOT NULL,
  formatted_address   text,
  phone               text,
  website             text,

  -- Status tracking (spec §11)
  business_status     text NOT NULL DEFAULT 'OPERATIONAL'
                        CHECK (business_status IN ('OPERATIONAL','CLOSED_TEMPORARILY','CLOSED_PERMANENTLY')),
  previous_status     text,                               -- Populated on status transition
  status_changed_at   timestamptz,                        -- When business_status last flipped

  -- Two-timestamp rule (spec §10.3)
  last_fetched_at     timestamptz NOT NULL DEFAULT now(), -- When we last called Places
  last_verified_at    timestamptz NOT NULL DEFAULT now(), -- When Places last confirmed OPERATIONAL

  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_merchant_location_brand ON merchant_location(brand_id);
CREATE INDEX idx_merchant_location_status ON merchant_location(business_status)
  WHERE business_status != 'OPERATIONAL';
-- Composite B-tree for viewport-bounded queries. PostGIS is not used elsewhere in this repo.
CREATE INDEX idx_merchant_location_geo ON merchant_location(latitude, longitude);

ALTER TABLE merchant_location ENABLE ROW LEVEL SECURITY;

CREATE POLICY "All authenticated users can read locations"
  ON merchant_location FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins can insert locations"
  ON merchant_location FOR INSERT
  TO authenticated
  WITH CHECK (
    public.merchants_is_admin()
  );

CREATE POLICY "Admins can update locations"
  ON merchant_location FOR UPDATE
  TO authenticated
  USING (
    public.merchants_is_admin()
  );

CREATE POLICY "Admins can delete locations"
  ON merchant_location FOR DELETE
  TO authenticated
  USING (
    public.merchants_is_admin()
  );


-- ============================================================================
-- 4. merchant_favorite — user-owned merchant sets
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_favorite (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id   uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  name            text NOT NULL,                         -- "Starbucks Competition"
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_merchant_favorite_owner ON merchant_favorite(owner_user_id);

ALTER TABLE merchant_favorite ENABLE ROW LEVEL SECURITY;

-- A favorite is visible to its owner or to anyone it's been shared with.
CREATE POLICY "Users can read own or shared favorites"
  ON merchant_favorite FOR SELECT
  TO authenticated
  USING (public.merchants_can_view_favorite(id));

-- Creating a favorite requires owner_user_id to be the current user.
CREATE POLICY "Users can create own favorites"
  ON merchant_favorite FOR INSERT
  TO authenticated
  WITH CHECK (owner_user_id = public.merchants_current_user_id());

-- Owner can always update; users with 'edit' share permission can also update.
CREATE POLICY "Owner or edit-shared users can update favorites"
  ON merchant_favorite FOR UPDATE
  TO authenticated
  USING (public.merchants_can_edit_favorite(id));

-- Only the owner can delete a favorite.
CREATE POLICY "Only owner can delete favorites"
  ON merchant_favorite FOR DELETE
  TO authenticated
  USING (owner_user_id = public.merchants_current_user_id());


-- ============================================================================
-- 5. merchant_favorite_brand — many-to-many
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_favorite_brand (
  favorite_id  uuid NOT NULL REFERENCES merchant_favorite(id) ON DELETE CASCADE,
  brand_id     uuid NOT NULL REFERENCES merchant_brand(id) ON DELETE CASCADE,
  PRIMARY KEY (favorite_id, brand_id)
);

CREATE INDEX idx_merchant_favorite_brand_brand ON merchant_favorite_brand(brand_id);

ALTER TABLE merchant_favorite_brand ENABLE ROW LEVEL SECURITY;

-- Read if the user can read the parent favorite.
CREATE POLICY "Users can read brand links on visible favorites"
  ON merchant_favorite_brand FOR SELECT
  TO authenticated
  USING (public.merchants_can_view_favorite(favorite_id));

-- Insert/update/delete if the user can edit the parent favorite (owner or edit-shared).
CREATE POLICY "Owner or edit-shared can add brands to favorites"
  ON merchant_favorite_brand FOR INSERT
  TO authenticated
  WITH CHECK (public.merchants_can_edit_favorite(favorite_id));

CREATE POLICY "Owner or edit-shared can remove brands from favorites"
  ON merchant_favorite_brand FOR DELETE
  TO authenticated
  USING (public.merchants_can_edit_favorite(favorite_id));


-- ============================================================================
-- 6. merchant_favorite_share — Google-Docs-style sharing
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_favorite_share (
  favorite_id  uuid NOT NULL REFERENCES merchant_favorite(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES "user"(id) ON DELETE CASCADE,
  permission   text NOT NULL CHECK (permission IN ('view','edit')) DEFAULT 'view',
  shared_at    timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (favorite_id, user_id)
);

CREATE INDEX idx_merchant_favorite_share_user ON merchant_favorite_share(user_id);

ALTER TABLE merchant_favorite_share ENABLE ROW LEVEL SECURITY;

-- Shares visible to the favorite's owner and to the shared-with user.
CREATE POLICY "Owner and recipient can read share rows"
  ON merchant_favorite_share FOR SELECT
  TO authenticated
  USING (
    user_id = public.merchants_current_user_id()
    OR public.merchants_is_favorite_owner(favorite_id)
  );

-- Only the favorite's owner can share.
CREATE POLICY "Only owner can create share rows"
  ON merchant_favorite_share FOR INSERT
  TO authenticated
  WITH CHECK (public.merchants_is_favorite_owner(favorite_id));

CREATE POLICY "Only owner can update share permission"
  ON merchant_favorite_share FOR UPDATE
  TO authenticated
  USING (public.merchants_is_favorite_owner(favorite_id));

CREATE POLICY "Only owner can delete share rows"
  ON merchant_favorite_share FOR DELETE
  TO authenticated
  USING (public.merchants_is_favorite_owner(favorite_id));


-- ============================================================================
-- 7. merchant_closure_alert — in-app alerts for status changes
-- ============================================================================

CREATE TABLE IF NOT EXISTS merchant_closure_alert (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id      uuid NOT NULL REFERENCES merchant_location(id) ON DELETE CASCADE,
  detected_at      timestamptz NOT NULL DEFAULT now(),
  previous_status  text,
  new_status       text NOT NULL,
  acknowledged_by  uuid REFERENCES "user"(id),
  acknowledged_at  timestamptz
);

CREATE INDEX idx_merchant_closure_alert_location ON merchant_closure_alert(location_id);
CREATE INDEX idx_merchant_closure_alert_unack ON merchant_closure_alert(detected_at DESC)
  WHERE acknowledged_at IS NULL;

ALTER TABLE merchant_closure_alert ENABLE ROW LEVEL SECURITY;

-- All authenticated users can view alerts (everyone should see closures in their workflow).
CREATE POLICY "All authenticated users can read alerts"
  ON merchant_closure_alert FOR SELECT
  TO authenticated
  USING (true);

-- All authenticated users can acknowledge alerts.
CREATE POLICY "All authenticated users can acknowledge alerts"
  ON merchant_closure_alert FOR UPDATE
  TO authenticated
  USING (true);

-- Only admins can manually insert/delete (cron jobs run via service_role and bypass RLS).
CREATE POLICY "Admins can insert alerts"
  ON merchant_closure_alert FOR INSERT
  TO authenticated
  WITH CHECK (
    public.merchants_is_admin()
  );

CREATE POLICY "Admins can delete alerts"
  ON merchant_closure_alert FOR DELETE
  TO authenticated
  USING (
    public.merchants_is_admin()
  );


-- ============================================================================
-- updated_at triggers
-- Relies on the repo-wide update_updated_at_column() function.
-- ============================================================================

DROP TRIGGER IF EXISTS merchant_category_updated_at ON merchant_category;
CREATE TRIGGER merchant_category_updated_at
  BEFORE UPDATE ON merchant_category
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS merchant_brand_updated_at ON merchant_brand;
CREATE TRIGGER merchant_brand_updated_at
  BEFORE UPDATE ON merchant_brand
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS merchant_favorite_updated_at ON merchant_favorite;
CREATE TRIGGER merchant_favorite_updated_at
  BEFORE UPDATE ON merchant_favorite
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();


-- ============================================================================
-- Table documentation
-- ============================================================================

COMMENT ON TABLE merchant_category IS 'Admin-managed taxonomy for merchant brands. One brand belongs to exactly one category in v1.';
COMMENT ON TABLE merchant_brand IS 'Curated master list of merchant brands shown on the Merchants map layer. Admin-managed.';
COMMENT ON TABLE merchant_location IS 'Google Places cache — one row per physical merchant location. Populated by admin-triggered ingestion and monthly refresh. business_status mirrors Google Places.';
COMMENT ON TABLE merchant_favorite IS 'User-owned named sets of merchant brands (e.g., "Starbucks Competition"). Private by default; shareable via merchant_favorite_share.';
COMMENT ON TABLE merchant_favorite_brand IS 'Many-to-many link: which brands belong to which favorite.';
COMMENT ON TABLE merchant_favorite_share IS 'Google-Docs-style sharing for favorites. Permission: view or edit.';
COMMENT ON TABLE merchant_closure_alert IS 'In-app alerts raised when a merchant_location.business_status transitions. Acknowledged by any authenticated user.';

COMMENT ON COLUMN merchant_location.last_fetched_at IS 'When we last called Places about this location, regardless of outcome. See spec §10.3.';
COMMENT ON COLUMN merchant_location.last_verified_at IS 'When Places last confirmed this location is OPERATIONAL. See spec §10.3.';
COMMENT ON COLUMN merchant_brand.logo_url IS 'Brandfetch CDN URL. Hotlinked at render time per Brandfetch ToS — do NOT download.';
COMMENT ON COLUMN merchant_brand.logo_fetched_at IS 'Last successful Brandfetch API call. Must be refreshed at least every 30 days to maintain license.';
