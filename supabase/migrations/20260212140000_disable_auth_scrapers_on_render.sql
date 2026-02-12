-- Disable auth-required scrapers on Render (they fail due to bot detection)
-- These will be run locally from Mac using run-auth-scrapers.ts

-- Add a field to track if source should be scraped remotely vs locally
ALTER TABLE hunter_source ADD COLUMN IF NOT EXISTS scrape_locally_only BOOLEAN DEFAULT false;

-- Mark NRN and BizJournals for local-only scraping
UPDATE hunter_source
SET scrape_locally_only = true,
    last_error = 'Configured for local-only scraping (bot detection on datacenter IPs)'
WHERE slug IN ('nrn', 'bizjournals-atl');

-- Add comment explaining the setup
COMMENT ON COLUMN hunter_source.scrape_locally_only IS 'If true, skip on Render and run from local Mac instead (avoids bot detection)';
