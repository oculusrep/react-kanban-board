-- BOR: vendor is optional on bill mappings.
--
-- The disbursement flow auto-creates a QBO vendor from the broker/referral-partner
-- name at first payout (findOrCreateVendor), so a vendor is no longer required when
-- the mapping is created. Removes the CHECK that rejected bill mappings with a null
-- vendor (which caused a 400 on save after the mapping UI made the vendor optional).
--
-- See docs/BOR_DEAL_FEATURE_SPEC.md
alter table qb_commission_mapping drop constraint if exists vendor_for_bill;
