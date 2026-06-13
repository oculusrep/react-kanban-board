-- Migration: Create prospecting_target table
-- Description: Table for tracking prospecting targets (companies to research and call)
-- Supports collaboration workflow: User adds targets, VA researches, User calls

-- Create prospecting target status type for validation
DO $$ BEGIN
  CREATE TYPE prospecting_target_status AS ENUM (
    'needs_research',  -- Newly added, needs VA to research
    'researching',     -- VA is actively working on it
    'ready',           -- Research complete, ready to call
    'calling',         -- Actively being worked by sales
    'converted',       -- Became a real contact/opportunity
    'disqualified'     -- Not a fit, removed from pipeline
  );
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- Create the prospecting_target table
CREATE TABLE IF NOT EXISTS prospecting_target (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Core fields
  company_name TEXT NOT NULL,
  website TEXT,
  notes TEXT,                           -- Initial notes when adding target
  source TEXT,                          -- Where you found them (trade show, LinkedIn, referral, etc.)

  -- Status and workflow
  status TEXT DEFAULT 'needs_research' CHECK (status IN ('needs_research', 'researching', 'ready', 'calling', 'converted', 'disqualified')),
  priority INTEGER DEFAULT 3 CHECK (priority >= 1 AND priority <= 5),  -- 1=hot, 5=low
  target_date DATE,                     -- When to work on this target

  -- Assignment
  assigned_to UUID REFERENCES "user"(id),
  owner_id UUID REFERENCES "user"(id),  -- Who added/owns this target

  -- Research fields (populated by VA)
  research_notes TEXT,
  contacts_found INTEGER DEFAULT 0,
  researched_at TIMESTAMPTZ,
  researched_by UUID REFERENCES "user"(id),

  -- Link to converted contact/client (when status = 'converted')
  converted_contact_id UUID REFERENCES contact(id),
  converted_client_id UUID REFERENCES client(id),
  converted_at TIMESTAMPTZ,

  -- Audit fields
  created_by_id UUID REFERENCES "user"(id),
  updated_by_id UUID REFERENCES "user"(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for common queries
CREATE INDEX idx_prospecting_target_status ON prospecting_target(status);
CREATE INDEX idx_prospecting_target_owner_id ON prospecting_target(owner_id);
CREATE INDEX idx_prospecting_target_assigned_to ON prospecting_target(assigned_to);
CREATE INDEX idx_prospecting_target_target_date ON prospecting_target(target_date);
CREATE INDEX idx_prospecting_target_priority ON prospecting_target(priority);
CREATE INDEX idx_prospecting_target_created_at ON prospecting_target(created_at);

-- Enable Row Level Security
ALTER TABLE prospecting_target ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Allow all authenticated users to read prospecting_target"
  ON prospecting_target
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow all authenticated users to insert prospecting_target"
  ON prospecting_target
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update prospecting_target"
  ON prospecting_target
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow all authenticated users to delete prospecting_target"
  ON prospecting_target
  FOR DELETE
  TO authenticated
  USING (true);

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION update_prospecting_target_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_prospecting_target_updated_at
  BEFORE UPDATE ON prospecting_target
  FOR EACH ROW
  EXECUTE FUNCTION update_prospecting_target_updated_at();

-- Create a view for easier querying with user names
CREATE OR REPLACE VIEW v_prospecting_target AS
SELECT
  pt.id,
  pt.company_name,
  pt.website,
  pt.notes,
  pt.source,
  pt.status,
  pt.priority,
  pt.target_date,
  pt.assigned_to,
  assigned_user.first_name || ' ' || assigned_user.last_name AS assigned_to_name,
  pt.owner_id,
  owner_user.first_name || ' ' || owner_user.last_name AS owner_name,
  pt.research_notes,
  pt.contacts_found,
  pt.researched_at,
  pt.researched_by,
  researcher.first_name || ' ' || researcher.last_name AS researched_by_name,
  pt.converted_contact_id,
  pt.converted_client_id,
  pt.converted_at,
  pt.created_at,
  pt.updated_at
FROM prospecting_target pt
LEFT JOIN "user" assigned_user ON pt.assigned_to = assigned_user.id
LEFT JOIN "user" owner_user ON pt.owner_id = owner_user.id
LEFT JOIN "user" researcher ON pt.researched_by = researcher.id;

-- Grant access to authenticated users
GRANT SELECT ON v_prospecting_target TO authenticated;

-- Add comment for documentation
COMMENT ON TABLE prospecting_target IS 'Tracks prospecting targets (companies) through the research and calling workflow. Supports collaboration between sales reps and VAs.';
COMMENT ON COLUMN prospecting_target.status IS 'Workflow status: needs_research -> researching -> ready -> calling -> converted/disqualified';
COMMENT ON COLUMN prospecting_target.priority IS 'Priority level 1-5, where 1 is highest priority (hot lead)';
COMMENT ON COLUMN prospecting_target.source IS 'Where the target was found: trade show, LinkedIn, referral, cold list, etc.';
