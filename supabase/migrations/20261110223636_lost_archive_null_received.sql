-- HELD — not applied. Awaiting Mike's go-ahead (changes 23 live payments).
-- Bug: auto_archive_lost_deal_payments() archives `payment_received = false`, which never matches NULL.
-- On 2026-11-10, 23 active unpaid payments ($465,376) on Lost deals all have payment_received NULL,
-- so they were never archived. Forecast code also filters Lost deals by stage, so they don't reach the
-- cash calendar / projections today — this makes the database agree.
-- Rebuilt from the LIVE definition (pg_get_functiondef, 2026-11-10); only the WHERE clause changes.

CREATE OR REPLACE FUNCTION public.auto_archive_lost_deal_payments()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_lost_stage_id UUID;
BEGIN
  -- Get the Lost stage ID
  SELECT id INTO v_lost_stage_id
  FROM deal_stage
  WHERE label = 'Lost';

  -- Only proceed if stage_id changed and new stage is Lost
  IF (NEW.stage_id IS DISTINCT FROM OLD.stage_id) AND (NEW.stage_id = v_lost_stage_id) THEN

    -- Archive all unpaid, active payments for this deal (NULL payment_received counts as unpaid)
    UPDATE payment
    SET is_active = false,
        deleted_at = NOW()
    WHERE deal_id = NEW.id
      AND COALESCE(payment_received, false) = false
      AND is_active = true;

    RAISE NOTICE 'Archived unpaid payments for deal % moving to Lost stage', NEW.deal_name;
  END IF;

  RETURN NEW;
END;
$function$;

-- Backfill: archive unpaid active payments already sitting on Lost deals.
UPDATE public.payment p
   SET is_active = false, deleted_at = now()
  FROM public.deal d
  JOIN public.deal_stage s ON s.id = d.stage_id
 WHERE p.deal_id = d.id
   AND s.label = 'Lost'
   AND p.is_active = true
   AND COALESCE(p.payment_received, false) = false;
