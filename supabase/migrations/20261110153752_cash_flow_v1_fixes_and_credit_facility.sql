-- Cash flow v1 fixes (Mike-approved 2026-11-10) + v1.5 credit facility.
-- See docs/CASH_FLOW_DASHBOARD_AUDIT.md ("v1 fixes, owed-out block" and "v1.5").

-- 1. Exclude-from-calendar flag on OVIS-tracked QBO Bills (paid outside the Bill in QBO).
ALTER TABLE public.qb_commission_entry
  ADD COLUMN exclude_from_calendar boolean NOT NULL DEFAULT false,
  ADD COLUMN exclude_reason text;

UPDATE public.qb_commission_entry
   SET exclude_from_calendar = true,
       exclude_reason = 'Paid by 8/19/2026 bank expense to Bennett Retail Group $6,871.65 (= 8440 + 8443 + 8444)'
 WHERE qb_entity_type = 'Bill' AND qb_entity_id IN ('8440', '8443', '8444');
UPDATE public.qb_commission_entry
   SET exclude_from_calendar = true,
       exclude_reason = 'Paid by 5/4/2026 bank expense 8183 line "SportClips Roswell Payment 1 of 2" $3,889.35'
 WHERE qb_entity_type = 'Bill' AND qb_entity_id = '8158';

-- 2. Planned pay dates for money owed out (null = today).
ALTER TABLE public.payment       ADD COLUMN referral_fee_planned_pay_date date;
ALTER TABLE public.payment_split ADD COLUMN planned_pay_date date;

-- 3. AMEX Business card: fixed $7,000 on the 3rd (not the QBO balance).
UPDATE public.scheduled_payment
   SET amount = 7000, qb_account_id = NULL, day_of_month = 3,
       notes = 'Fixed $7,000 on the 3rd (Mike, 2026-11-10). Recent payments $2.8k–$6.8k.', updated_at = now()
 WHERE name = 'AMEX Business card';

-- 4. Cash cushion.
INSERT INTO public.app_settings (key, value, description)
VALUES ('cash_cushion_usd', '20000'::jsonb, 'Minimum cash to keep in the Operating account (cash flow dashboard)')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now();

-- 5. Credit facilities (v1.5): LOC available to cover dips below the cushion.
CREATE TABLE public.credit_facility (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name           text NOT NULL,
  qb_account_id  text,
  credit_limit   numeric CHECK (credit_limit IS NULL OR credit_limit >= 0),
  available      numeric NOT NULL DEFAULT 0 CHECK (available >= 0),
  apr            numeric,
  active         boolean NOT NULL DEFAULT true,
  notes          text,
  updated_at     timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.credit_facility ENABLE ROW LEVEL SECURITY;
CREATE POLICY credit_facility_admin_all ON public.credit_facility
  FOR ALL TO authenticated
  USING ((SELECT public.is_admin())) WITH CHECK ((SELECT public.is_admin()));

INSERT INTO public.credit_facility (name, available, notes)
VALUES ('AMEX Line of Credit', 24500, 'Seeded 2026-11-10; limit and APR to be filled in.');

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON public.credit_facility FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_facility TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.credit_facility TO service_role;
