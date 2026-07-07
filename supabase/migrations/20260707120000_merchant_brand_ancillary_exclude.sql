-- Google Places returns separate entries for sub-services of the same
-- storefront: a Kroger store typically has ~8 entries (Kroger, Kroger
-- Pharmacy, Kroger Bakery, Kroger Deli, Kroger Fuel Center, Kroger Floral,
-- Kroger Money Services, Kroger Clicklist Pickup). Wells Fargo has 3 (Bank,
-- ATM, Advisors). Lowe's has Home Improvement + Garden Center + Pro Desk +
-- Tool Rental. All get ingested as separate merchant_location rows,
-- cluttering the map with dupe pins.
--
-- The render + ingest filters keep only "primary" storefront rows by
-- rejecting names that contain known "ancillary service" tokens. Baseline
-- token list is hardcoded (see MerchantLayer). This column lets an admin add
-- brand-specific tokens on top of that baseline for edge cases the default
-- list misses.
--
-- Additive semantics: a location is filtered if its name matches ANY token
-- in (default_list ∪ places_name_exclude). To let a token through for a
-- specific brand where the default overreaches, use places_display_name to
-- pin the expected name shape instead.

ALTER TABLE merchant_brand
  ADD COLUMN IF NOT EXISTS places_name_exclude text;

COMMENT ON COLUMN merchant_brand.places_name_exclude IS
  'Comma-separated tokens to exclude from ingest/render on top of the default ancillary list. Case-insensitive whole-word match against the Places display name.';
