-- Cash flow v1.6 (docs/CASH_FLOW_DASHBOARD_AUDIT.md "v1.6"): every-N-weeks schedules, LOC payoff link,
-- Arty advance link, tax reserve setting. No new relations → no new grants needed.

ALTER TABLE public.scheduled_payment
  ADD COLUMN every_n_weeks integer CHECK (every_n_weeks IS NULL OR every_n_weeks BETWEEN 1 AND 52),
  ADD COLUMN end_date date,
  -- Payment stops once this QBO liability account's balance is paid off (last payment = remainder).
  ADD COLUMN payoff_qb_account_id text,
  -- Draws that are advances against this broker's future commission splits.
  ADD COLUMN advance_broker_id uuid REFERENCES public.broker(id),
  ADD CONSTRAINT scheduled_payment_weeks_need_anchor
    CHECK (every_n_weeks IS NULL OR (scheduled_date IS NOT NULL AND day_of_month IS NULL));

-- LOC: link facility + loan payment to the QBO liability account.
UPDATE public.credit_facility SET qb_account_id = '1150040002', updated_at = now()
 WHERE name = 'AMEX Line of Credit';
UPDATE public.scheduled_payment SET payoff_qb_account_id = '1150040002', updated_at = now()
 WHERE name = 'AMEX Line of Credit loan';

-- Arty draws are advances against his splits.
UPDATE public.scheduled_payment SET advance_broker_id = '1d049634-32fe-4834-8ca1-33f1cff0055a', updated_at = now()
 WHERE name IN ('Arty draw (mid-month)', 'Arty draw (month-end)');

-- Noree: three one-off rows → every 2 weeks from 11/20, no end.
DELETE FROM public.scheduled_payment WHERE name = 'Virtual assistant (Noree Corias)';
INSERT INTO public.scheduled_payment (name, kind, scheduled_date, every_n_weeks, amount, qb_payee_names, notes)
VALUES ('Virtual assistant (Noree Corias)', 'bill', '2026-11-20', 2, 495, ARRAY['Noree Gel M. Corias'], 'Every 2 weeks from 11/20');

-- Tax reserve placeholder.
INSERT INTO public.app_settings (key, value, description)
VALUES ('tax_reserve_pct', '0.25'::jsonb, 'Placeholder tax reserve rate on owner pay + business net income (confirm with CPA)')
ON CONFLICT (key) DO NOTHING;
