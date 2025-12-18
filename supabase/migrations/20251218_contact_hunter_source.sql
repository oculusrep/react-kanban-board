-- Migration: Add Hunter source type support to contacts
-- Description: Adds hunter_lead_id FK for tracking Hunter leads converted to contacts
-- Date: 2025-12-18

-- Add hunter_lead_id column to contact table for ROI tracking
-- This links a contact back to the Hunter lead that originated it
ALTER TABLE contact
ADD COLUMN IF NOT EXISTS hunter_lead_id UUID REFERENCES hunter_lead(id);

-- Create index for efficient lookups
CREATE INDEX IF NOT EXISTS idx_contact_hunter_lead ON contact(hunter_lead_id);

-- Add comment explaining the column
COMMENT ON COLUMN contact.hunter_lead_id IS 'Reference to hunter_lead if this contact was converted from a Hunter prospecting lead. Used for ROI tracking.';

-- Note: source_type is already a TEXT column without constraints,
-- so no migration needed to allow 'Hunter' as a value.
-- The application will handle the new 'Hunter' source type.
