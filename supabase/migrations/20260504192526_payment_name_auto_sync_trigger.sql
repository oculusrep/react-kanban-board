-- Auto-populate payment.payment_name as "Payment {sequence} of {total}" whenever
-- a payment row is inserted, deleted, or its sequence/is_active/deal_id changes.
-- The trigger updates ALL siblings in the affected deal so that names stay
-- consistent when number_of_payments grows or payments are archived.
--
-- Recursion safety: the trigger UPDATEs only the payment_name column, but the
-- trigger fires on UPDATE OF (payment_sequence, is_active, deal_id) — not
-- payment_name — so it does not re-fire from its own writes.

CREATE OR REPLACE FUNCTION public.sync_payment_names()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  v_deal_id uuid;
  v_total integer;
BEGIN
  v_deal_id := COALESCE(NEW.deal_id, OLD.deal_id);
  IF v_deal_id IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO v_total
  FROM payment
  WHERE deal_id = v_deal_id
    AND COALESCE(is_active, true) = true;

  UPDATE payment
  SET payment_name = 'Payment ' || COALESCE(payment_sequence, 1) || ' of ' || v_total
  WHERE deal_id = v_deal_id
    AND payment_name IS DISTINCT FROM
        'Payment ' || COALESCE(payment_sequence, 1) || ' of ' || v_total;

  RETURN NULL;
END;
$function$;

DROP TRIGGER IF EXISTS sync_payment_names_after_change ON public.payment;
CREATE TRIGGER sync_payment_names_after_change
AFTER INSERT OR DELETE OR UPDATE OF payment_sequence, is_active, deal_id
ON public.payment
FOR EACH ROW
EXECUTE FUNCTION public.sync_payment_names();
