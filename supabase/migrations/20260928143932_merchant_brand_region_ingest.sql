-- Per-region merchant ingest tracking.
--
-- Why: merchant_brand.last_ingested_at is region-blind. It was fine while
-- Georgia was the only market, but the admin Ingestion tab uses it for its
-- "skip brands ingested in the last 48 hours" guard — so the moment a second
-- region exists, running Columbia stamps all 401 brands and the next Georgia
-- run silently skips every one of them (and vice versa).
--
-- This table holds the per-region truth. merchant_brand.last_ingested_at is
-- still bumped by ingestion and still read by the Brands tab as a plain
-- "last touched by any ingest" timestamp.
--
-- region_id is a stable text key from src/services/merchantRegions.ts
-- (MERCHANT_REGIONS[].id) — 'georgia', 'columbia-sc-50mi'. It is deliberately
-- not an FK: the region registry is code, not data, so that a new market is a
-- config entry rather than a migration.
--
-- Docs: docs/MERCHANTS_COLUMBIA_SC_EXPANSION.md

CREATE TABLE IF NOT EXISTS public.merchant_brand_region_ingest (
  brand_id          uuid        NOT NULL REFERENCES public.merchant_brand(id) ON DELETE CASCADE,
  region_id         text        NOT NULL,
  last_ingested_at  timestamptz NOT NULL DEFAULT now(),
  -- Post-filter count (region.accept + name-match + ancillary), i.e. rows
  -- actually upserted, not raw Places hits. Gives per-region coverage
  -- reporting the feature has never had.
  locations_found   integer     NOT NULL DEFAULT 0,
  PRIMARY KEY (brand_id, region_id)
);

-- Supports the Ingestion tab's "what's stale in this region?" read.
CREATE INDEX IF NOT EXISTS idx_merchant_brand_region_ingest_region
  ON public.merchant_brand_region_ingest (region_id, last_ingested_at);

-- Backfill Georgia from the existing brand-level column, so the skip-recent
-- guard and the stale count don't reset to zero on deploy. Every
-- merchant_location row predating this migration is a Georgia row.
INSERT INTO public.merchant_brand_region_ingest
  (brand_id, region_id, last_ingested_at, locations_found)
SELECT
  b.id,
  'georgia',
  b.last_ingested_at,
  COALESCE(lc.n, 0)
FROM public.merchant_brand b
LEFT JOIN (
  SELECT brand_id, COUNT(*) AS n
  FROM public.merchant_location
  GROUP BY brand_id
) lc ON lc.brand_id = b.id
WHERE b.last_ingested_at IS NOT NULL
ON CONFLICT (brand_id, region_id) DO NOTHING;

-- ---------------------------------------------------------------------------
-- RLS — mirrors merchant_brand: every authenticated user reads, admins write.
-- ---------------------------------------------------------------------------

ALTER TABLE public.merchant_brand_region_ingest ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "All authenticated users can read region ingest"
  ON public.merchant_brand_region_ingest;
CREATE POLICY "All authenticated users can read region ingest"
  ON public.merchant_brand_region_ingest
  FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "Admins can insert region ingest"
  ON public.merchant_brand_region_ingest;
CREATE POLICY "Admins can insert region ingest"
  ON public.merchant_brand_region_ingest
  FOR INSERT TO authenticated
  WITH CHECK (merchants_is_admin());

DROP POLICY IF EXISTS "Admins can update region ingest"
  ON public.merchant_brand_region_ingest;
CREATE POLICY "Admins can update region ingest"
  ON public.merchant_brand_region_ingest
  FOR UPDATE TO authenticated
  USING (merchants_is_admin())
  WITH CHECK (merchants_is_admin());

-- ---------------------------------------------------------------------------
-- Grants. Required on every new public relation — the permissive defaults go
-- away 2026-10-30 and the table would become unreachable. See CLAUDE.md.
--
-- No DELETE: nothing in the app deletes these rows, and withholding the verb
-- means a permissive policy added later can't silently unlock it.
-- ---------------------------------------------------------------------------

REVOKE ALL ON public.merchant_brand_region_ingest FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.merchant_brand_region_ingest TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.merchant_brand_region_ingest TO service_role;
