-- Record whether a brand's ingest stopped on the per-brand call ceiling.
--
-- Why this is a correctness fix, not a nicety: the Ingestion tab's
-- "skip brands ingested in the last 48 hours" guard reads
-- merchant_brand_region_ingest, and without this column a brand that ran out
-- of call budget at 25 calls with incomplete coverage looks exactly like one
-- that finished cleanly. Re-running to fill the gap would silently skip the
-- very brands that need it.
--
-- Surfaced by the 2026-09-29 Columbia test: Dollar General hit the 25-call
-- ceiling exactly (121 locations found, coverage possibly short), while REI,
-- Chick-fil-A and Piggly Wiggly finished in 1, 5 and 5 calls.
--
-- Skip-recent now never skips a truncated brand.
--
-- Docs: docs/MERCHANTS_COLUMBIA_SC_EXPANSION.md

ALTER TABLE public.merchant_brand_region_ingest
  ADD COLUMN IF NOT EXISTS truncated boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.merchant_brand_region_ingest.truncated IS
  'True if the run stopped on MerchantRegion.maxRequestsPerBrand rather than '
  'exhausting the partition, so coverage for this brand in this region may be '
  'incomplete. Excluded from the admin skip-recent guard.';

-- Backfill the one brand we already know was truncated. Dollar General spent
-- exactly 25 calls (its ceiling) in the Columbia test; everything else in
-- that run finished well under. Georgia rows predate the ceiling entirely
-- and keep the false default.
UPDATE public.merchant_brand_region_ingest r
   SET truncated = true
  FROM public.merchant_brand b
 WHERE b.id = r.brand_id
   AND r.region_id = 'columbia-sc-50mi'
   AND b.normalized_name = 'dollar general';

-- No grant changes: adding a column to an existing table inherits the
-- table-level grants set by 20260928143932.
