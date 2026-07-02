-- Layer 3 escape hatch: allow admins to upload a per-brand custom logo when
-- Brandfetch can't produce something usable. When set, custom_logo_url takes
-- precedence over logo_url at render time (see MerchantLayer). Brandfetch's
-- ToS forbids caching *their* assets, but a logo we host ourselves is not
-- covered by that restriction — we own the asset.
--
-- See docs/MERCHANTS_ADMIN_ROADMAP.md §6 Layer 3.

ALTER TABLE merchant_brand
  ADD COLUMN IF NOT EXISTS custom_logo_url          text,
  ADD COLUMN IF NOT EXISTS custom_logo_uploaded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS custom_logo_uploaded_by  uuid REFERENCES "user"(id) ON DELETE SET NULL;

COMMENT ON COLUMN merchant_brand.custom_logo_url IS
  'Admin-uploaded logo (Supabase Storage public URL). Overrides logo_url in pin rendering when set.';
COMMENT ON COLUMN merchant_brand.custom_logo_uploaded_at IS
  'When the custom logo was last uploaded/replaced.';
COMMENT ON COLUMN merchant_brand.custom_logo_uploaded_by IS
  'user.id of the admin who uploaded it. NULL after that user is deleted.';
