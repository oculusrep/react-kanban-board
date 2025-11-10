-- Migration: Add triggers to automatically update audit fields on UPDATE
-- Purpose: Automatically set updated_by_id and updated_at when records are modified
-- This ensures complete audit trail without requiring application code changes

-- =====================================================================
-- Create trigger function to set creator on INSERT
-- =====================================================================

CREATE OR REPLACE FUNCTION set_creator_fields()
RETURNS TRIGGER AS $$
DECLARE
  current_user_id uuid;
BEGIN
  -- Get the user.id for the current authenticated user
  -- The auth.uid() returns auth_user_id, so we look up user.id
  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO current_user_id
    FROM "user"
    WHERE auth_user_id = auth.uid()
    LIMIT 1;

    -- Set created_by_id if we found a matching user and it's not already set
    IF current_user_id IS NOT NULL AND NEW.created_by_id IS NULL THEN
      NEW.created_by_id = current_user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- Create trigger function to update audit fields on UPDATE
-- =====================================================================

CREATE OR REPLACE FUNCTION update_audit_fields()
RETURNS TRIGGER AS $$
DECLARE
  current_user_id uuid;
BEGIN
  -- Set updated_at to current timestamp
  NEW.updated_at = NOW();

  -- Get the user.id for the current authenticated user
  -- The auth.uid() returns auth_user_id, so we look up user.id
  IF auth.uid() IS NOT NULL THEN
    SELECT id INTO current_user_id
    FROM "user"
    WHERE auth_user_id = auth.uid()
    LIMIT 1;

    -- Set updated_by_id if we found a matching user
    IF current_user_id IS NOT NULL THEN
      NEW.updated_by_id = current_user_id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- =====================================================================
-- Create triggers for all tables with audit fields
-- =====================================================================

-- Property
DROP TRIGGER IF EXISTS update_property_audit_fields ON property;
CREATE TRIGGER update_property_audit_fields
  BEFORE UPDATE ON property
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

-- Site submit
DROP TRIGGER IF EXISTS update_site_submit_audit_fields ON site_submit;
CREATE TRIGGER update_site_submit_audit_fields
  BEFORE UPDATE ON site_submit
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

-- Deal
DROP TRIGGER IF EXISTS update_deal_audit_fields ON deal;
CREATE TRIGGER update_deal_audit_fields
  BEFORE UPDATE ON deal
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

-- Client
DROP TRIGGER IF EXISTS update_client_audit_fields ON client;
CREATE TRIGGER update_client_audit_fields
  BEFORE UPDATE ON client
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

-- Contact
DROP TRIGGER IF EXISTS update_contact_audit_fields ON contact;
CREATE TRIGGER update_contact_audit_fields
  BEFORE UPDATE ON contact
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

-- Payment
DROP TRIGGER IF EXISTS update_payment_audit_fields ON payment;
CREATE TRIGGER update_payment_audit_fields
  BEFORE UPDATE ON payment
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

-- Assignment
DROP TRIGGER IF EXISTS update_assignment_audit_fields ON assignment;
CREATE TRIGGER update_assignment_audit_fields
  BEFORE UPDATE ON assignment
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

-- Property contact
DROP TRIGGER IF EXISTS update_property_contact_audit_fields ON property_contact;
CREATE TRIGGER update_property_contact_audit_fields
  BEFORE UPDATE ON property_contact
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

-- Property unit
DROP TRIGGER IF EXISTS update_property_unit_audit_fields ON property_unit;
CREATE TRIGGER update_property_unit_audit_fields
  BEFORE UPDATE ON property_unit
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

-- Critical date
DROP TRIGGER IF EXISTS update_critical_date_audit_fields ON critical_date;
CREATE TRIGGER update_critical_date_audit_fields
  BEFORE UPDATE ON critical_date
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

-- Commission split
DROP TRIGGER IF EXISTS update_commission_split_audit_fields ON commission_split;
CREATE TRIGGER update_commission_split_audit_fields
  BEFORE UPDATE ON commission_split
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

-- Payment split
DROP TRIGGER IF EXISTS update_payment_split_audit_fields ON payment_split;
CREATE TRIGGER update_payment_split_audit_fields
  BEFORE UPDATE ON payment_split
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

-- Deal contact
DROP TRIGGER IF EXISTS update_deal_contact_audit_fields ON deal_contact;
CREATE TRIGGER update_deal_contact_audit_fields
  BEFORE UPDATE ON deal_contact
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

-- Contact client relation
DROP TRIGGER IF EXISTS update_contact_client_relation_audit_fields ON contact_client_relation;
CREATE TRIGGER update_contact_client_relation_audit_fields
  BEFORE UPDATE ON contact_client_relation
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

-- Note
DROP TRIGGER IF EXISTS update_note_audit_fields ON note;
CREATE TRIGGER update_note_audit_fields
  BEFORE UPDATE ON note
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

-- Activity
DROP TRIGGER IF EXISTS update_activity_audit_fields ON activity;
CREATE TRIGGER update_activity_audit_fields
  BEFORE UPDATE ON activity
  FOR EACH ROW
  EXECUTE FUNCTION update_audit_fields();

-- =====================================================================
-- CREATE INSERT TRIGGERS to set created_by_id
-- =====================================================================

-- Property
DROP TRIGGER IF EXISTS set_property_creator ON property;
CREATE TRIGGER set_property_creator
  BEFORE INSERT ON property
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_fields();

-- Site submit
DROP TRIGGER IF EXISTS set_site_submit_creator ON site_submit;
CREATE TRIGGER set_site_submit_creator
  BEFORE INSERT ON site_submit
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_fields();

-- Deal
DROP TRIGGER IF EXISTS set_deal_creator ON deal;
CREATE TRIGGER set_deal_creator
  BEFORE INSERT ON deal
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_fields();

-- Client
DROP TRIGGER IF EXISTS set_client_creator ON client;
CREATE TRIGGER set_client_creator
  BEFORE INSERT ON client
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_fields();

-- Contact
DROP TRIGGER IF EXISTS set_contact_creator ON contact;
CREATE TRIGGER set_contact_creator
  BEFORE INSERT ON contact
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_fields();

-- Payment
DROP TRIGGER IF EXISTS set_payment_creator ON payment;
CREATE TRIGGER set_payment_creator
  BEFORE INSERT ON payment
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_fields();

-- Assignment
DROP TRIGGER IF EXISTS set_assignment_creator ON assignment;
CREATE TRIGGER set_assignment_creator
  BEFORE INSERT ON assignment
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_fields();

-- Property contact
DROP TRIGGER IF EXISTS set_property_contact_creator ON property_contact;
CREATE TRIGGER set_property_contact_creator
  BEFORE INSERT ON property_contact
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_fields();

-- Property unit
DROP TRIGGER IF EXISTS set_property_unit_creator ON property_unit;
CREATE TRIGGER set_property_unit_creator
  BEFORE INSERT ON property_unit
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_fields();

-- Critical date
DROP TRIGGER IF EXISTS set_critical_date_creator ON critical_date;
CREATE TRIGGER set_critical_date_creator
  BEFORE INSERT ON critical_date
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_fields();

-- Commission split
DROP TRIGGER IF EXISTS set_commission_split_creator ON commission_split;
CREATE TRIGGER set_commission_split_creator
  BEFORE INSERT ON commission_split
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_fields();

-- Payment split
DROP TRIGGER IF EXISTS set_payment_split_creator ON payment_split;
CREATE TRIGGER set_payment_split_creator
  BEFORE INSERT ON payment_split
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_fields();

-- Deal contact
DROP TRIGGER IF EXISTS set_deal_contact_creator ON deal_contact;
CREATE TRIGGER set_deal_contact_creator
  BEFORE INSERT ON deal_contact
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_fields();

-- Contact client relation
DROP TRIGGER IF EXISTS set_contact_client_relation_creator ON contact_client_relation;
CREATE TRIGGER set_contact_client_relation_creator
  BEFORE INSERT ON contact_client_relation
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_fields();

-- Note
DROP TRIGGER IF EXISTS set_note_creator ON note;
CREATE TRIGGER set_note_creator
  BEFORE INSERT ON note
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_fields();

-- Activity
DROP TRIGGER IF EXISTS set_activity_creator ON activity;
CREATE TRIGGER set_activity_creator
  BEFORE INSERT ON activity
  FOR EACH ROW
  EXECUTE FUNCTION set_creator_fields();

-- =====================================================================
-- Conditional triggers for tables that may not exist
-- =====================================================================

DO $$
BEGIN
  -- Contact client role
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contact_client_role') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_contact_client_role_audit_fields ON contact_client_role';
    EXECUTE 'CREATE TRIGGER update_contact_client_role_audit_fields
      BEFORE UPDATE ON contact_client_role
      FOR EACH ROW
      EXECUTE FUNCTION update_audit_fields()';
  END IF;

  -- Contact deal role
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'contact_deal_role') THEN
    EXECUTE 'DROP TRIGGER IF EXISTS update_contact_deal_role_audit_fields ON contact_deal_role';
    EXECUTE 'CREATE TRIGGER update_contact_deal_role_audit_fields
      BEFORE UPDATE ON contact_deal_role
      FOR EACH ROW
      EXECUTE FUNCTION update_audit_fields()';
  END IF;
END $$;

-- =====================================================================
-- Verification
-- =====================================================================

-- List all triggers created
SELECT
  trigger_name,
  event_object_table as table_name,
  action_timing,
  event_manipulation
FROM information_schema.triggers
WHERE trigger_name LIKE '%audit_fields%'
ORDER BY event_object_table;

-- Test the trigger (optional - comment out in production)
-- This will show that triggers are working
COMMENT ON FUNCTION update_audit_fields() IS 'Automatically updates updated_by_id and updated_at fields on record modification';
