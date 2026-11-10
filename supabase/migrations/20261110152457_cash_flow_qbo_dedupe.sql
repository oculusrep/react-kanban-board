-- Cash flow: dedupe scheduled payments against transactions already entered in QBO.
-- See docs/CASH_FLOW_DASHBOARD_AUDIT.md ("Scheduled-payment dedupe").
--  * qb_bank_transaction: bank-account register lines (incl. future-dated) captured with each
--    balance snapshot; same fetched_at as the qb_balance_snapshot batch.
--  * scheduled_payment.qb_payee_names: QBO payee names an occurrence may match.

CREATE TABLE public.qb_bank_transaction (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qb_account_id  text NOT NULL,
  txn_date       date NOT NULL,
  txn_type       text,
  qb_txn_id      text,
  payee          text,
  memo           text,
  amount         numeric NOT NULL,              -- signed: − money out of the bank, + money in
  fetched_at     timestamptz NOT NULL
);
CREATE INDEX qb_bank_transaction_fetched_idx ON public.qb_bank_transaction (fetched_at DESC, txn_date);

ALTER TABLE public.qb_bank_transaction ENABLE ROW LEVEL SECURITY;
CREATE POLICY qb_bank_transaction_admin_read ON public.qb_bank_transaction
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

ALTER TABLE public.scheduled_payment ADD COLUMN qb_payee_names text[];

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON public.qb_bank_transaction FROM anon, authenticated;
GRANT SELECT ON public.qb_bank_transaction TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qb_bank_transaction TO service_role;
