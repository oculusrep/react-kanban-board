-- Tour Scheduling (Phase 2.5)
-- Created: July 26, 2026
-- Description: Multi-day tours with per-day start/end times, per-stop duration, and a
--   category-driven default duration (Flyby = 0 min, others = 5 min). Feeds the Phase 3
--   route optimizer with time windows + service times.
--
-- Additive only. RLS reuses portal_user_contact_id() (never join auth.users directly —
-- authenticated role can't read it; see docs / tour_schema migration note).

-- ============================================================================
-- 1. TOUR_DAY — a day within a tour, with a time window
-- ============================================================================

CREATE TABLE IF NOT EXISTS tour_day (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tour_id UUID NOT NULL REFERENCES tour(id) ON DELETE CASCADE,
  day_number INTEGER NOT NULL,     -- 1, 2, 3 … order of days within the tour
  day_date DATE,                   -- optional concrete date
  start_time TIME,                 -- e.g. 09:00
  end_time TIME,                   -- e.g. 17:00
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (tour_id, day_number)
);

CREATE INDEX IF NOT EXISTS idx_tour_day_tour ON tour_day(tour_id, day_number);

DROP TRIGGER IF EXISTS update_tour_day_updated_at ON tour_day;
CREATE TRIGGER update_tour_day_updated_at
  BEFORE UPDATE ON tour_day
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 2. TOUR_STOP — assign to a day, per-stop duration override
-- ============================================================================
-- position is now the order WITHIN a day (null day = "Unscheduled" bucket).
-- stop_duration_minutes NULL => fall back to the category's default.

ALTER TABLE tour_stop
  ADD COLUMN IF NOT EXISTS tour_day_id UUID REFERENCES tour_day(id) ON DELETE SET NULL;

ALTER TABLE tour_stop
  ADD COLUMN IF NOT EXISTS stop_duration_minutes INTEGER;

CREATE INDEX IF NOT EXISTS idx_tour_stop_day ON tour_stop(tour_day_id, position);

-- ============================================================================
-- 3. TOUR_STOP_CATEGORY — default duration per category
-- ============================================================================

ALTER TABLE tour_stop_category
  ADD COLUMN IF NOT EXISTS default_stop_duration_minutes INTEGER NOT NULL DEFAULT 5;

UPDATE tour_stop_category SET default_stop_duration_minutes = 0 WHERE name = 'Flyby';
UPDATE tour_stop_category SET default_stop_duration_minutes = 5 WHERE name IN ('Scheduled Stop', 'Tabletop');

-- ============================================================================
-- 4. RLS for tour_day (mirror tour_stop)
-- ============================================================================

ALTER TABLE tour_day ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tour_day_internal_all"
ON tour_day FOR ALL TO authenticated
USING (public.is_internal_user())
WITH CHECK (public.is_internal_user());

CREATE POLICY "tour_day_portal_select"
ON tour_day FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1
    FROM tour t
    JOIN portal_user_client_access puca
      ON puca.client_id = t.client_id AND puca.is_active = TRUE
    WHERE t.id = tour_day.tour_id
      AND puca.contact_id = public.portal_user_contact_id()
  )
);

GRANT SELECT, INSERT, UPDATE, DELETE ON tour_day TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
