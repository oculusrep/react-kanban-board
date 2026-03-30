-- Create saved_search table for Advanced Property Search feature
-- Stores user-defined search configurations with filter groups, columns, and sort settings

CREATE TABLE saved_search (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  description TEXT,

  -- Owner and visibility
  created_by_id UUID REFERENCES "user"(id) NOT NULL,
  is_public BOOLEAN DEFAULT false,

  -- Search configuration (stored as JSONB)
  filter_groups JSONB NOT NULL,  -- Array of filter groups with conditions
  column_config JSONB,           -- Selected columns and order
  sort_config JSONB,             -- { field: string, direction: 'asc' | 'desc' }

  -- Metadata
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE saved_search ENABLE ROW LEVEL SECURITY;

-- Users can see their own searches and public searches
CREATE POLICY "View own or public searches"
  ON saved_search FOR SELECT
  USING (created_by_id = auth.uid() OR is_public = true);

-- Users can insert their own searches
CREATE POLICY "Insert own searches"
  ON saved_search FOR INSERT
  WITH CHECK (created_by_id = auth.uid());

-- Users can update their own searches
CREATE POLICY "Update own searches"
  ON saved_search FOR UPDATE
  USING (created_by_id = auth.uid());

-- Users can delete their own searches
CREATE POLICY "Delete own searches"
  ON saved_search FOR DELETE
  USING (created_by_id = auth.uid());

-- Indexes for performance
CREATE INDEX idx_saved_search_created_by ON saved_search(created_by_id);
CREATE INDEX idx_saved_search_public ON saved_search(is_public) WHERE is_public = true;

-- Add comment for documentation
COMMENT ON TABLE saved_search IS 'Stores saved search configurations for Advanced Property Search feature';
COMMENT ON COLUMN saved_search.filter_groups IS 'JSONB array of filter groups. Groups are OR''d together, conditions within groups are AND''d';
COMMENT ON COLUMN saved_search.column_config IS 'JSONB array of column keys to display in results';
COMMENT ON COLUMN saved_search.sort_config IS 'JSONB object with field and direction for sorting';
