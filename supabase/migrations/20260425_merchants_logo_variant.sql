-- Migration: Merchants map layer — logo_variant column on merchant_brand
-- Authored: 2026-04-23 (filename date sequences after earlier merchant migrations)
-- Spec: docs/MERCHANTS_ADMIN_ROADMAP.md §6 (Layer 2 — Brandfetch asset-variant selection)
-- Depends on: 20260422_merchants_map_layer_tables.sql
--
-- Adds a per-brand override for which Brandfetch asset variant to use.
-- Default 'auto' keeps current behavior (Brandfetch picks the best asset).
-- Admins can override to 'icon', 'logo', or 'symbol' when the default is
-- unreadable at pin size (spec §8).


ALTER TABLE merchant_brand
  ADD COLUMN IF NOT EXISTS logo_variant TEXT NOT NULL DEFAULT 'auto'
  CHECK (logo_variant IN ('auto', 'icon', 'logo', 'symbol'));

COMMENT ON COLUMN merchant_brand.logo_variant IS
  'Which Brandfetch asset variant to use when building logo_url. ''auto'' = Brandfetch picks. Override to ''icon'' or ''symbol'' for wordmark brands that are unreadable at pin size.';
