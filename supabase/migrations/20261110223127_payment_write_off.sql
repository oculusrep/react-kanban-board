-- Payment write-off (docs/CASH_FLOW_DASHBOARD_AUDIT.md "Payment write-off").
-- Not reusing is_active = false: that means "archived" — hidden from the deal's Payments tab,
-- mass-restored when a deal leaves Lost (usePaymentLifecycle.restoreArchivedPayments) and it renumbers
-- payment names (sync_payment_names). A written-off payment stays active and visible in deal history.
-- Never deletes payments; QBO invoices are voided separately (quickbooks-void-invoice), never deleted.

ALTER TABLE public.payment
  ADD COLUMN write_off_reason     text,
  ADD COLUMN written_off_at       timestamptz,
  ADD COLUMN written_off_by       uuid REFERENCES public."user"(auth_user_id) ON DELETE SET NULL,
  ADD COLUMN qb_invoice_voided_at timestamptz,
  ADD COLUMN qb_invoice_voided_by uuid REFERENCES public."user"(auth_user_id) ON DELETE SET NULL,
  ADD CONSTRAINT payment_write_off_reason_pair
    CHECK ((written_off_at IS NULL) = (write_off_reason IS NULL));

-- Stamp who/when from the reason; keep write-off and received mutually exclusive.
CREATE OR REPLACE FUNCTION public.payment_write_off_guard()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.write_off_reason IS NOT NULL AND btrim(NEW.write_off_reason) = '' THEN
    RAISE EXCEPTION 'A write-off needs a reason';
  END IF;

  IF NEW.write_off_reason IS DISTINCT FROM OLD.write_off_reason THEN
    IF NEW.write_off_reason IS NULL THEN
      NEW.written_off_at := NULL;            -- undo
      NEW.written_off_by := NULL;
    ELSIF OLD.write_off_reason IS NULL THEN
      NEW.written_off_at := now();           -- new write-off
      NEW.written_off_by := auth.uid();
    END IF;                                  -- reason edited: keep original who/when
  END IF;

  IF COALESCE(NEW.payment_received, false) AND NEW.written_off_at IS NOT NULL THEN
    RAISE EXCEPTION 'Payment % is written off; undo the write-off before marking it received', NEW.id;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER payment_write_off_guard
  BEFORE UPDATE ON public.payment
  FOR EACH ROW EXECUTE FUNCTION public.payment_write_off_guard();

-- Trigger function: not callable as an RPC.
REVOKE ALL ON FUNCTION public.payment_write_off_guard() FROM PUBLIC, anon, authenticated;
