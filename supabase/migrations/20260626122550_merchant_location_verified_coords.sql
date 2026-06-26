-- Let admins verify (override) Google Places coordinates for merchant_location
-- rows when the Places pin is slightly off the real storefront.
--
-- Pattern mirrors restaurant_location's verified_latitude/longitude columns.
-- At render time, MerchantLayer prefers verified_* when present and falls
-- back to the Places-sourced latitude/longitude. See:
--   memory/feedback_coordinate_resolution.md ("verified lat/lng always beats
--   unverified, regardless of which table")
--
-- IMPORTANT: when closure-detection / re-ingestion is eventually built
-- (docs/MERCHANTS_CLOSURE_DETECTION_DEFERRED.md), it MUST NOT overwrite
-- these columns. The re-ingest should only touch the unverified
-- latitude/longitude that came from Google Places.

ALTER TABLE merchant_location
  ADD COLUMN verified_latitude  NUMERIC(10, 7),
  ADD COLUMN verified_longitude NUMERIC(10, 7),
  ADD COLUMN verified_at        TIMESTAMPTZ,
  ADD COLUMN verified_by        UUID REFERENCES "user"(id);

CREATE INDEX idx_merchant_location_verified
  ON merchant_location (verified_latitude, verified_longitude)
  WHERE verified_latitude IS NOT NULL;

COMMENT ON COLUMN merchant_location.verified_latitude  IS 'Admin override of Places latitude; takes precedence at render time';
COMMENT ON COLUMN merchant_location.verified_longitude IS 'Admin override of Places longitude; takes precedence at render time';
COMMENT ON COLUMN merchant_location.verified_at        IS 'When verified_latitude/longitude were set';
COMMENT ON COLUMN merchant_location.verified_by        IS 'User who set the verified location';
