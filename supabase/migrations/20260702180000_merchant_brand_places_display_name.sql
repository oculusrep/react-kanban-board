-- Places Text Search returns whatever Google thinks is relevant to the query,
-- which for many brand names includes a lot of unrelated businesses. The map
-- renderer filters locations at display time so the pin's name has to look
-- like the brand name.
--
-- Trouble: Google Places' display name for many brands differs from what OVIS
-- stores as the brand name. E.g. "Truist Bank" -> "Truist", "Dunkin' Donuts"
-- -> "Dunkin'", "Apple Store" -> "Apple {Mall}", "Verizon Wireless" -> "Verizon".
-- A blanket brand-name-contains check would reject legit stores for those.
--
-- `places_display_name` is the shorter/actual name Places uses. When set, the
-- render filter and the ingest guard match against this instead of brand.name.
-- Admins curate it per-brand as they notice false negatives.
--
-- Related: docs/MERCHANTS_ADMIN_ROADMAP.md, docs/MERCHANTS_NEXT_SESSION.md.

ALTER TABLE merchant_brand
  ADD COLUMN IF NOT EXISTS places_display_name text;

COMMENT ON COLUMN merchant_brand.places_display_name IS
  'Override of brand.name used for the ingest-time name check and render-time filter. Set when Google Places'' actual display name differs from OVIS''s brand.name (e.g., "Truist Bank" vs "Truist"). NULL = fall back to brand.name.';
