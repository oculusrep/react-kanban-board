-- places_display_name pre-pass: Phase 1 of the mis-attribution fix.
--
-- These rows are hidden by the render-time name-match filter only because the
-- brand row's name differs from what Google actually calls the stores. Setting
-- the override fixes them WITHOUT rewriting a single merchant_location row,
-- which is why this runs before any brand_id reassignment.
--
-- Measured effect (dry run 2026-09-30, visible rows before -> after):
--   Mavis Discount Tire   0 -> 94    (+94  "Mavis Tires & Brakes")
--   MetroPCS              7 -> 189   (+189 "Metro by T-Mobile", -7 see below)
--   Apple Store          16 -> 16    no change
--   Dunkin' Donuts      267 -> 267   no change
--   Truist Bank         145 -> 145   no change
--   Verizon Wireless    134 -> 134   no change
--
-- The four no-ops were on the July 2026 candidate list, but the "brand minus
-- last word" stem rule that shipped 2026-07-02 already covers them: "Truist
-- Bank" stems to "Truist", "Apple Store" to "Apple". They are recorded here
-- anyway, as approved, because they make the intended name explicit rather
-- than relying on a stem that happens to land correctly — but they change
-- nothing on the map.
--
-- KNOWN COST: MetroPCS loses 7 rows literally signed "Metro Pcs" /
-- "MetroPCS Authorized Dealer", because an override is single-valued and this
-- brand is mid-rebrand. Net +182. Using 'Metro' instead would capture all 196
-- with no loss, at the price of making "metro" a 5-character magnet during
-- brand reassignment (it would claim any "Metro*" row cache-wide). Deferred to
-- Mike as a one-line change.
--
-- Docs: docs/MERCHANT_BRAND_REASSIGNMENT_PROPOSAL.md

UPDATE public.merchant_brand b
   SET places_display_name = v.display,
       updated_at = now()
  FROM (VALUES
    ('MetroPCS',            'Metro by T-Mobile'),
    ('Apple Store',         'Apple'),
    ('Truist Bank',         'Truist'),
    ('Dunkin'' Donuts',     'Dunkin'),
    ('Verizon Wireless',    'Verizon'),
    ('Mavis Discount Tire', 'Mavis')
  ) AS v(name, display)
 WHERE b.name = v.name
   AND b.places_display_name IS DISTINCT FROM v.display;
