-- Referral / Broker-of-Record disbursements (Bill + income JE) are tied to a
-- payment, not a payment_split. The referral code reused payment_split_id for
-- the payment id, which violated its FK to payment_split and silently failed —
-- so those QBO entries were never tracked and couldn't be voided.
--
-- Add a proper payment_id column and make payment_split_id nullable so each
-- entry keys off exactly one of them.
alter table qb_commission_entry
  add column if not exists payment_id uuid references payment(id) on delete cascade;

alter table qb_commission_entry
  alter column payment_split_id drop not null;

comment on column qb_commission_entry.payment_id is
  'For referral/BOR disbursements (Bill + income JE), tied to a payment (not a payment_split). Mutually exclusive with payment_split_id.';
