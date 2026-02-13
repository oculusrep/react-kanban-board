-- ZoomInfo Contact Enrichment Support
-- Migration: 20260213100000_zoominfo_contact_enrichment.sql
-- Adds columns to track ZoomInfo enrichment data on contacts

-- ============================================================================
-- Add ZoomInfo columns to contact table
-- ============================================================================

-- ZoomInfo Person ID for future lookups and deduplication
ALTER TABLE contact ADD COLUMN IF NOT EXISTS zoominfo_person_id TEXT;

-- ZoomInfo profile URL for quick access
ALTER TABLE contact ADD COLUMN IF NOT EXISTS zoominfo_profile_url TEXT;

-- Track when contact was last enriched from ZoomInfo
ALTER TABLE contact ADD COLUMN IF NOT EXISTS zoominfo_last_enriched_at TIMESTAMPTZ;

-- Store raw ZoomInfo response for reference/debugging (optional - stores last enrichment payload)
ALTER TABLE contact ADD COLUMN IF NOT EXISTS zoominfo_data JSONB;

-- Create index for ZoomInfo person ID lookups
CREATE INDEX IF NOT EXISTS idx_contact_zoominfo_person_id ON contact(zoominfo_person_id);

-- Comments for documentation
COMMENT ON COLUMN contact.zoominfo_person_id IS 'ZoomInfo unique person identifier for this contact';
COMMENT ON COLUMN contact.zoominfo_profile_url IS 'Direct link to contact profile in ZoomInfo';
COMMENT ON COLUMN contact.zoominfo_last_enriched_at IS 'Timestamp of last successful ZoomInfo enrichment';
COMMENT ON COLUMN contact.zoominfo_data IS 'Raw ZoomInfo API response data from last enrichment';
