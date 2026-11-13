-- Let the admin ingest write its own audit rows.
--
-- 20260930092623 created merchant_location_brand_reassignment for the bulk
-- pass, which ran as postgres via psql, and so granted authenticated SELECT
-- only. The forward fix in upsertMerchantLocation now reclaims mis-filed rows
-- during a normal ingest — which runs in the BROWSER as an authenticated
-- admin. Without an INSERT grant every reclaim would log
-- "reassignment audit insert failed" and the row would move with no audit
-- trail, which is the one outcome the audit table exists to prevent.
--
-- INSERT only: nothing in the app updates or deletes an audit row, and the
-- bulk reversal runs as service_role.
--
-- Docs: docs/MERCHANT_BRAND_REASSIGNMENT_PROPOSAL.md

DROP POLICY IF EXISTS "Admins can insert reassignments"
  ON public.merchant_location_brand_reassignment;
CREATE POLICY "Admins can insert reassignments"
  ON public.merchant_location_brand_reassignment
  FOR INSERT TO authenticated
  WITH CHECK (merchants_is_admin());

GRANT INSERT ON public.merchant_location_brand_reassignment TO authenticated;
