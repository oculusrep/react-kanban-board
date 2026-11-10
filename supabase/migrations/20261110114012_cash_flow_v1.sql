-- Cash flow dashboard v1 (docs/CASH_FLOW_DASHBOARD_AUDIT.md, "v1 revision").
--  * qb_balance_snapshot: Bank + Credit Card balances from QBO, one row per account per fetch.
--  * scheduled_payment: recurring/dated outflows for the 45-day cash calendar (incl. owner draws).
--  * qb_commission_entry: last-known QBO open balance for OVIS-created Bills.

CREATE TABLE public.qb_balance_snapshot (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qb_account_id        text NOT NULL,
  name                 text NOT NULL,
  fully_qualified_name text,
  account_type         text NOT NULL,          -- 'Bank' | 'Credit Card'
  account_sub_type     text,
  current_balance      numeric NOT NULL,
  fetched_at           timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX qb_balance_snapshot_account_fetched_idx
  ON public.qb_balance_snapshot (qb_account_id, fetched_at DESC);

ALTER TABLE public.qb_balance_snapshot ENABLE ROW LEVEL SECURITY;
CREATE POLICY qb_balance_snapshot_admin_read ON public.qb_balance_snapshot
  FOR SELECT TO authenticated USING ((SELECT public.is_admin()));

CREATE TABLE public.scheduled_payment (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  kind            text NOT NULL DEFAULT 'bill' CHECK (kind IN ('bill', 'draw')),
  day_of_month    integer CHECK (day_of_month BETWEEN 1 AND 31),
  scheduled_date  date,
  amount          numeric CHECK (amount IS NULL OR amount >= 0),
  qb_account_id   text,                       -- "use QBO account balance" (latest snapshot)
  active          boolean NOT NULL DEFAULT true,
  notes           text,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by_id   uuid DEFAULT auth.uid(),
  CONSTRAINT scheduled_payment_one_when CHECK ((day_of_month IS NULL) <> (scheduled_date IS NULL))
);

ALTER TABLE public.scheduled_payment ENABLE ROW LEVEL SECURITY;
CREATE POLICY scheduled_payment_admin_all ON public.scheduled_payment
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin()))
  WITH CHECK ((SELECT public.is_admin()));

-- Seed: AMEX on the 12th. No amount and no account yet: the first balance refresh links it
-- to the QBO Credit Card account named like AMEX / American Express. If none exists, Mike
-- enters a manual amount on the page.
INSERT INTO public.scheduled_payment (name, kind, day_of_month, notes, created_by_id)
VALUES ('AMEX', 'bill', 12, 'Seeded: uses the QBO AMEX balance once linked', NULL);

ALTER TABLE public.qb_commission_entry
  ADD COLUMN qb_open_balance       numeric,
  ADD COLUMN qb_balance_checked_at timestamptz;

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON public.qb_balance_snapshot FROM anon, authenticated;
GRANT SELECT ON public.qb_balance_snapshot TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.qb_balance_snapshot TO service_role;

REVOKE ALL ON public.scheduled_payment FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_payment TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.scheduled_payment TO service_role;
