-- Migration: Create Contact Tags System
-- Description: Adds ability to tag contacts for campaigns and marketing purposes
-- Example tags: "Nurture Campaign", "Holiday Mailer", "VIP"

-- =====================================================
-- STEP 1: Create contact_tag_type lookup table
-- =====================================================

CREATE TABLE IF NOT EXISTS contact_tag_type (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tag_name TEXT NOT NULL UNIQUE,
  description TEXT,
  color VARCHAR(7) DEFAULT '#3b82f6',  -- Hex color for UI chips (default blue)
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS policies for contact_tag_type
ALTER TABLE contact_tag_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all authenticated users to read contact_tag_type"
  ON contact_tag_type
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow all authenticated users to insert contact_tag_type"
  ON contact_tag_type
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update contact_tag_type"
  ON contact_tag_type
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow all authenticated users to delete contact_tag_type"
  ON contact_tag_type
  FOR DELETE
  TO authenticated
  USING (true);

-- =====================================================
-- STEP 2: Insert predefined tag types
-- =====================================================

INSERT INTO contact_tag_type (tag_name, description, color, sort_order) VALUES
  ('Nurture Campaign', 'Long-term relationship building - periodic check-ins', '#8b5cf6', 1)
ON CONFLICT (tag_name) DO NOTHING;

-- =====================================================
-- STEP 3: Create contact_tag junction table
-- =====================================================

CREATE TABLE IF NOT EXISTS contact_tag (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  tag_id UUID NOT NULL REFERENCES contact_tag_type(id) ON DELETE RESTRICT,
  notes TEXT,
  created_by_id UUID REFERENCES "user"(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Ensure a contact can only have each tag once
  UNIQUE (contact_id, tag_id)
);

-- Add indexes for performance
CREATE INDEX idx_contact_tag_contact_id ON contact_tag(contact_id);
CREATE INDEX idx_contact_tag_tag_id ON contact_tag(tag_id);

-- Add RLS policies for contact_tag
ALTER TABLE contact_tag ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all authenticated users to read contact_tag"
  ON contact_tag
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow all authenticated users to insert contact_tag"
  ON contact_tag
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update contact_tag"
  ON contact_tag
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow all authenticated users to delete contact_tag"
  ON contact_tag
  FOR DELETE
  TO authenticated
  USING (true);

-- =====================================================
-- STEP 4: Create helpful view for querying tags
-- =====================================================

CREATE OR REPLACE VIEW v_contact_tags AS
SELECT
  ct.id,
  ct.contact_id,
  c.first_name || ' ' || c.last_name AS contact_name,
  c.email AS contact_email,
  c.company AS contact_company,
  ct.tag_id,
  ctt.tag_name,
  ctt.description AS tag_description,
  ctt.color AS tag_color,
  ct.notes,
  ct.created_at,
  ct.created_by_id
FROM contact_tag ct
JOIN contact c ON ct.contact_id = c.id
JOIN contact_tag_type ctt ON ct.tag_id = ctt.id
WHERE ctt.is_active = true;

-- Grant access to the view
GRANT SELECT ON v_contact_tags TO authenticated;

-- =====================================================
-- STEP 5: Add updated_at trigger for contact_tag_type
-- =====================================================

CREATE OR REPLACE FUNCTION update_contact_tag_type_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_contact_tag_type_updated_at
  BEFORE UPDATE ON contact_tag_type
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_tag_type_updated_at();

-- =====================================================
-- STEP 6: Add comments for documentation
-- =====================================================

COMMENT ON TABLE contact_tag_type IS 'Lookup table for contact tag types (campaigns, marketing lists)';
COMMENT ON TABLE contact_tag IS 'Junction table linking contacts to tags for campaign/marketing assignment';
COMMENT ON VIEW v_contact_tags IS 'Human-readable view of contact-tag relationships with names and colors';
COMMENT ON COLUMN contact_tag_type.color IS 'Hex color code for displaying tag chips in UI';
