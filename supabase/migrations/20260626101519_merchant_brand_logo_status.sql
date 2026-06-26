-- Track whether Brandfetch actually serves a logo for each merchant_brand.
--
-- Until now the admin could only see "logo_url is NULL" as a "missing logo"
-- signal. But many brands have a logo_url set (resolved at ingestion time)
-- yet Brandfetch's CDN returns 404 / placeholder when actually requested.
-- These are invisible to filters but show up as broken pins on the map.
--
-- New columns are populated by the merchant-logo-refresh Edge Function:
--   - On each refresh, after the license-renewal Search API call, the function
--     HEAD's the CDN URL and records whether a real logo came back.
--   - Status flips drive admin UI badges and the "Missing logo" filter.
--
-- See: supabase/functions/merchant-logo-refresh/index.ts

ALTER TABLE merchant_brand
  ADD COLUMN brandfetch_logo_status TEXT NOT NULL DEFAULT 'unknown'
    CHECK (brandfetch_logo_status IN ('unknown', 'ok', 'miss')),
  ADD COLUMN brandfetch_checked_at TIMESTAMPTZ;

-- Help the admin UI's "Missing logo" filter, which queries either
-- logo_url IS NULL OR brandfetch_logo_status = 'miss'. Partial index keeps
-- it small.
CREATE INDEX idx_merchant_brand_logo_miss
  ON merchant_brand (brandfetch_logo_status)
  WHERE brandfetch_logo_status = 'miss';

COMMENT ON COLUMN merchant_brand.brandfetch_logo_status IS
  'unknown=not yet checked, ok=Brandfetch served a real logo, miss=Brandfetch returned 404 / placeholder';
COMMENT ON COLUMN merchant_brand.brandfetch_checked_at IS
  'When the merchant-logo-refresh function last verified the CDN URL';
