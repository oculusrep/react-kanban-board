-- Migration: Create Deal-Level Contact Roles System
-- Description: Adds ability to assign contact roles at the deal level (separate from client-level roles)
-- This enables deal-specific contact assignments with roles like "Critical Dates Reminders"

-- =====================================================
-- STEP 1: Create contact_deal_role_type lookup table
-- =====================================================

CREATE TABLE IF NOT EXISTS contact_deal_role_type (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  role_name TEXT NOT NULL UNIQUE,
  description TEXT,
  is_active BOOLEAN DEFAULT true,
  sort_order INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add RLS policies for contact_deal_role_type
ALTER TABLE contact_deal_role_type ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all authenticated users to read contact_deal_role_type"
  ON contact_deal_role_type
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow all authenticated users to insert contact_deal_role_type"
  ON contact_deal_role_type
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update contact_deal_role_type"
  ON contact_deal_role_type
  FOR UPDATE
  TO authenticated
  USING (true);

-- =====================================================
-- STEP 2: Insert predefined deal-level role types
-- =====================================================

INSERT INTO contact_deal_role_type (role_name, description, sort_order) VALUES
  ('Franchisee', 'Franchise owner or operator', 1),
  ('Franchisor', 'Franchise company representative', 2),
  ('Real Estate Lead', 'Primary real estate contact', 3),
  ('Attorney', 'Legal counsel and contract review', 4),
  ('Lender', 'Financing and lending contact', 5),
  ('Contractor', 'Construction and build-out contractor', 6),
  ('Engineer', 'Engineering and technical contact', 7),
  ('Landlord', 'Property owner or landlord', 8),
  ('Landlord Rep', 'Representative of the landlord', 9),
  ('Owner', 'Business or property owner', 10),
  ('Seller', 'Selling party in the transaction', 11),
  ('Buyer', 'Buying party in the transaction', 12),
  ('Critical Dates Reminders', 'Receives critical date reminder emails', 13),
  ('Architect', 'Architectural design and planning', 14)
ON CONFLICT (role_name) DO NOTHING;

-- =====================================================
-- STEP 3: Create contact_deal_role junction table
-- =====================================================

CREATE TABLE IF NOT EXISTS contact_deal_role (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id UUID NOT NULL REFERENCES contact(id) ON DELETE CASCADE,
  deal_id UUID NOT NULL REFERENCES deal(id) ON DELETE CASCADE,
  role_id UUID NOT NULL REFERENCES contact_deal_role_type(id) ON DELETE RESTRICT,
  is_active BOOLEAN DEFAULT true,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by_id UUID REFERENCES "user"(id),
  updated_by_id UUID REFERENCES "user"(id),

  -- Ensure a contact can only have each role once per deal
  UNIQUE (contact_id, deal_id, role_id)
);

-- Add indexes for performance
CREATE INDEX idx_contact_deal_role_contact_id ON contact_deal_role(contact_id);
CREATE INDEX idx_contact_deal_role_deal_id ON contact_deal_role(deal_id);
CREATE INDEX idx_contact_deal_role_role_id ON contact_deal_role(role_id);
CREATE INDEX idx_contact_deal_role_is_active ON contact_deal_role(is_active);

-- Add RLS policies for contact_deal_role
ALTER TABLE contact_deal_role ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all authenticated users to read contact_deal_role"
  ON contact_deal_role
  FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Allow all authenticated users to insert contact_deal_role"
  ON contact_deal_role
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "Allow all authenticated users to update contact_deal_role"
  ON contact_deal_role
  FOR UPDATE
  TO authenticated
  USING (true);

CREATE POLICY "Allow all authenticated users to delete contact_deal_role"
  ON contact_deal_role
  FOR DELETE
  TO authenticated
  USING (true);

-- =====================================================
-- STEP 4: Create helpful view for querying roles
-- =====================================================

CREATE OR REPLACE VIEW v_contact_deal_roles AS
SELECT
  cdr.id,
  cdr.contact_id,
  c.first_name || ' ' || c.last_name AS contact_name,
  c.email AS contact_email,
  cdr.deal_id,
  d.deal_name,
  cdr.role_id,
  cdrt.role_name,
  cdrt.description AS role_description,
  cdr.is_active,
  cdr.notes,
  cdr.created_at,
  cdr.updated_at
FROM contact_deal_role cdr
JOIN contact c ON cdr.contact_id = c.id
JOIN deal d ON cdr.deal_id = d.id
JOIN contact_deal_role_type cdrt ON cdr.role_id = cdrt.id;

-- Grant access to the view
GRANT SELECT ON v_contact_deal_roles TO authenticated;

-- =====================================================
-- STEP 5: Mark "Critical Dates Reminders" as inactive at client level
-- =====================================================

-- This prevents new assignments of "Critical Dates Reminders" at the client level
-- while preserving existing data for historical purposes
UPDATE contact_client_role_type
SET
  is_active = false,
  updated_at = NOW()
WHERE role_name = 'Critical Dates Reminders';

-- =====================================================
-- STEP 6: Add updated_at trigger for contact_deal_role
-- =====================================================

CREATE OR REPLACE FUNCTION update_contact_deal_role_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_update_contact_deal_role_updated_at
  BEFORE UPDATE ON contact_deal_role
  FOR EACH ROW
  EXECUTE FUNCTION update_contact_deal_role_updated_at();

-- =====================================================
-- STEP 7: Add comments for documentation
-- =====================================================

COMMENT ON TABLE contact_deal_role_type IS 'Lookup table for contact role types at the deal level';
COMMENT ON TABLE contact_deal_role IS 'Junction table linking contacts to deals with specific roles (many-to-many relationship)';
COMMENT ON VIEW v_contact_deal_roles IS 'Human-readable view of contact-deal-role relationships with names and descriptions';
