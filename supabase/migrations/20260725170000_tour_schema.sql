-- Tour Feature Schema (Phase 1)
-- Created: July 25, 2026
-- Description: Adds tour, tour_stop, and tour_stop_category tables so brokers can stage
--   site submits onto an ordered, categorized tour. Mirrors the assignment->site_submit
--   staging model but uses a join table (tours are many-to-many + ordered + categorized).
--
-- Additive only (new tables). RLS reuses existing portal helper functions:
--   is_internal_user(), can_manage_portal(), portal_user_contact_id()
-- (defined in supabase/migrations_legacy/20260130_client_portal_rls_v3.sql)
-- and the update_updated_at_column() trigger function (from 20260130_client_portal_schema.sql).

-- ============================================================================
-- 1. TOUR_STOP_CATEGORY (lookup, seeded) - mirrors submit_stage pattern
-- ============================================================================

CREATE TABLE IF NOT EXISTS tour_stop_category (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

INSERT INTO tour_stop_category (name, sort_order)
VALUES
  ('Flyby', 10),
  ('Tabletop', 20),
  ('Scheduled Showing', 30),
  ('Drive-by', 40)
ON CONFLICT (name) DO NOTHING;

-- ============================================================================
-- 2. TOUR
-- ============================================================================

CREATE TABLE IF NOT EXISTS tour (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  tour_name TEXT NOT NULL,
  description TEXT,
  tour_date DATE,
  is_archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tour_client_id ON tour(client_id);
CREATE INDEX IF NOT EXISTS idx_tour_client_active ON tour(client_id, is_archived);

-- ============================================================================
-- 3. TOUR_STOP (join: tour <-> site_submit, ordered + categorized)
-- ============================================================================

CREATE TABLE IF NOT EXISTS tour_stop (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES tour(id) ON DELETE CASCADE,
  site_submit_id UUID NOT NULL REFERENCES site_submit(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  category_id UUID REFERENCES tour_stop_category(id) ON DELETE SET NULL,
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (tour_id, site_submit_id)
);

CREATE INDEX IF NOT EXISTS idx_tour_stop_tour ON tour_stop(tour_id, position);
CREATE INDEX IF NOT EXISTS idx_tour_stop_site_submit ON tour_stop(site_submit_id);

-- ============================================================================
-- 4. updated_at TRIGGERS (reuse existing update_updated_at_column())
-- ============================================================================

DROP TRIGGER IF EXISTS update_tour_updated_at ON tour;
CREATE TRIGGER update_tour_updated_at
  BEFORE UPDATE ON tour
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_tour_stop_updated_at ON tour_stop;
CREATE TRIGGER update_tour_stop_updated_at
  BEFORE UPDATE ON tour_stop
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 5. RLS
-- ============================================================================

ALTER TABLE tour ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_stop ENABLE ROW LEVEL SECURITY;
ALTER TABLE tour_stop_category ENABLE ROW LEVEL SECURITY;

-- ---- tour_stop_category: readable by all authenticated ----
CREATE POLICY "tour_category_select"
ON tour_stop_category FOR SELECT
TO authenticated
USING (TRUE);

-- ---- tour: internal users full access ----
CREATE POLICY "tour_internal_all"
ON tour FOR ALL
TO authenticated
USING (public.is_internal_user())
WITH CHECK (public.is_internal_user());

-- ---- tour: portal users read-only, scoped to accessible clients ----
-- Archived tours remain visible so an account can revisit any saved tour.
-- NOTE: use the SECURITY DEFINER helper portal_user_contact_id() rather than joining
-- auth.users directly — the `authenticated` role has no privilege on auth.users, so a
-- direct join throws "permission denied for table users" whenever this policy is
-- evaluated (including the RETURNING read-back after an internal user's INSERT).
CREATE POLICY "tour_portal_select"
ON tour FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM portal_user_client_access puca
    WHERE puca.contact_id = public.portal_user_contact_id()
    AND puca.client_id = tour.client_id
    AND puca.is_active = TRUE
  )
);

-- ---- tour_stop: internal users full access ----
CREATE POLICY "tour_stop_internal_all"
ON tour_stop FOR ALL
TO authenticated
USING (public.is_internal_user())
WITH CHECK (public.is_internal_user());

-- ---- tour_stop: portal users read-only, scoped via parent tour ----
CREATE POLICY "tour_stop_portal_select"
ON tour_stop FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM tour t
    JOIN portal_user_client_access puca ON puca.client_id = t.client_id AND puca.is_active = TRUE
    WHERE t.id = tour_stop.tour_id
    AND puca.contact_id = public.portal_user_contact_id()
  )
);

-- ============================================================================
-- 6. GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON tour TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON tour_stop TO authenticated;
GRANT SELECT ON tour_stop_category TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
