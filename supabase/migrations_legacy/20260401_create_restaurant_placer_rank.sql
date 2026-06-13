-- Restaurant Placer Rank Table
-- Stores manually-entered placer rankings for restaurant locations
-- Keeps history of all rank entries; UI shows the most recent

-- ============================================================================
-- TABLE: restaurant_placer_rank
-- ============================================================================

CREATE TABLE IF NOT EXISTS restaurant_placer_rank (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  store_no TEXT NOT NULL REFERENCES restaurant_location(store_no) ON DELETE CASCADE,

  -- Rank data
  rank_position INTEGER NOT NULL,        -- e.g., 45 (numerator)
  rank_total INTEGER NOT NULL,           -- e.g., 300 (denominator)
  rank_percentage DOUBLE PRECISION NOT NULL, -- e.g., 85.5

  -- Date of ranking (date only, no time)
  rank_date DATE NOT NULL DEFAULT CURRENT_DATE,

  -- Optional URL to the Placer.ai page for this restaurant
  placer_url TEXT,

  -- User who entered the rank (captured automatically)
  entered_by UUID NOT NULL REFERENCES auth.users(id),

  -- Audit fields
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================================
-- INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_placer_rank_store_no ON restaurant_placer_rank(store_no);
CREATE INDEX IF NOT EXISTS idx_placer_rank_store_date ON restaurant_placer_rank(store_no, rank_date DESC);
CREATE INDEX IF NOT EXISTS idx_placer_rank_entered_by ON restaurant_placer_rank(entered_by);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================

ALTER TABLE restaurant_placer_rank ENABLE ROW LEVEL SECURITY;

-- All authenticated users can read placer ranks
CREATE POLICY "restaurant_placer_rank_select" ON restaurant_placer_rank
    FOR SELECT TO authenticated
    USING (true);

-- All authenticated users can insert new placer ranks
CREATE POLICY "restaurant_placer_rank_insert" ON restaurant_placer_rank
    FOR INSERT TO authenticated
    WITH CHECK (true);

-- Users can update their own entries
CREATE POLICY "restaurant_placer_rank_update" ON restaurant_placer_rank
    FOR UPDATE TO authenticated
    USING (entered_by = auth.uid());

-- Users can delete their own entries
CREATE POLICY "restaurant_placer_rank_delete" ON restaurant_placer_rank
    FOR DELETE TO authenticated
    USING (entered_by = auth.uid());

-- ============================================================================
-- COMMENTS
-- ============================================================================

COMMENT ON TABLE restaurant_placer_rank IS 'Manually-entered placer rankings for restaurant locations, with full history';
COMMENT ON COLUMN restaurant_placer_rank.rank_position IS 'Numerator of rank (e.g., 45 in "45/300")';
COMMENT ON COLUMN restaurant_placer_rank.rank_total IS 'Denominator of rank (e.g., 300 in "45/300")';
COMMENT ON COLUMN restaurant_placer_rank.rank_percentage IS 'Percentage rank (e.g., 85.5 for 85.5%)';
COMMENT ON COLUMN restaurant_placer_rank.rank_date IS 'Date of the ranking (date only, no time component)';
COMMENT ON COLUMN restaurant_placer_rank.entered_by IS 'UUID of the user who entered this rank';
