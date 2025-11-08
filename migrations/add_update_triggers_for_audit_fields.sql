-- Migration: Add triggers to automatically update audit fields on UPDATE
-- Purpose: Automatically set updated_by_id and updated_at when records are modified
-- This ensures complete audit trail without requiring application code changes

-- =====================================================================
-- Create trigger function to update audit fields
-- =====================================================================

CREATE OR REPLACE FUNCTION update_audit_fields()
RETURNS TRIGGER AS $$
BEGIN
  -- Set updated_at to current timestamp
  NEW.updated_at = NOW();

  -- Set updated_by_id to current authenticated user
  -- Only update if the column exists and we have an authenticated user
  IF TG_OP = 'UPDATE' AND auth.uid() IS NOT NULL THEN
    NEW.updated_by_id = auth.uid();
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
