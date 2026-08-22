-- Broker of Record (BOR) deal support
-- See docs/BOR_DEAL_FEATURE_SPEC.md
--
-- 1) New transaction type "BOR Referral Fee" (fixed id so the frontend can
--    reference it as a constant — see src/lib/bor.ts).
-- 2) bor_fee_usd column on deal (flat BOR Fee / total; drives the Kanban card)
--    and on payment (per-installment BOR Fee, manually entered).
--
-- Idempotent: safe to re-run.

-- 1) Transaction type ---------------------------------------------------------
insert into transaction_type (id, label, description, active, sort_order)
values (
  '71c1b4eb-d468-44b6-a52a-f5f9b1bbf7da',
  'BOR Referral Fee',
  'Broker of Record pass-through: Oculus invoices/collects the full commission, keeps a flat BOR Fee, and remits the remainder to the referring broker. The BOR Fee is the only Oculus income; excluded from GCI/sales metrics.',
  true,
  5
)
on conflict (id) do nothing;

-- 2) bor_fee_usd columns ------------------------------------------------------
alter table deal    add column if not exists bor_fee_usd numeric;
alter table payment add column if not exists bor_fee_usd numeric;

comment on column deal.bor_fee_usd is
  'Broker-of-Record deals only: flat fee (USD) Oculus keeps as compensation. Total/default; the value shown on the Kanban card. Per-installment amounts live on payment.bor_fee_usd. See docs/BOR_DEAL_FEATURE_SPEC.md.';
comment on column payment.bor_fee_usd is
  'Broker-of-Record deals only: BOR Fee (USD) taken from this installment (manually entered). Pass-through to the referring broker = payment_amount - bor_fee_usd. See docs/BOR_DEAL_FEATURE_SPEC.md.';
