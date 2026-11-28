-- Referral fees now post to QBO as a Check (Purchase, PaymentType=Check) instead of a Bill.
-- See docs/CASH_FLOW_DASHBOARD_AUDIT.md, "v1 revision" item 1.
ALTER TABLE public.qb_commission_entry DROP CONSTRAINT qb_commission_entry_qb_entity_type_check;
ALTER TABLE public.qb_commission_entry ADD CONSTRAINT qb_commission_entry_qb_entity_type_check
  CHECK (qb_entity_type = ANY (ARRAY['Bill'::text, 'JournalEntry'::text, 'Purchase'::text]));
