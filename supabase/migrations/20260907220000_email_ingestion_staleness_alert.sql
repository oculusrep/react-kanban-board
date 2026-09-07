-- ============================================================================
-- Email ingestion staleness alert.
--
-- WHY THIS EXISTS. On 2026-09-07 gmail-sync delivered no mail for ~8 hours on a
-- business day (last email 13:04 UTC / 09:04 ET; recovered only when the
-- function was redeployed at 21:32 UTC / 17:32 ET). Nothing noticed. It
-- surfaced by accident while verifying an unrelated filter.
--
-- EVERY EXISTING SIGNAL WAS GREEN THROUGHOUT:
--   * cron.job_run_details  432 runs, ALL 'succeeded' -- but net.http_post
--     returns "1 row" when the request is QUEUED, not when the function works.
--   * net._http_response    every retained response in the window was HTTP 200
--     -- gmail-sync returned success while delivering nothing.
-- A check that cannot fail is not a check. The only trustworthy signal is the
-- DATA: mail either arrived or it did not.
--
-- THRESHOLD, sized from 30 days of this table's own history:
--   weekdays  ~120-155 emails/day over ~10 business hours = one every ~5 min.
--             A 60-minute weekday gap is far outside normal.
--   weekends  4-9 emails/day. A 60-minute gap is unremarkable, so the check
--             does not run -- an alert that cries wolf every Saturday is an
--             alert that gets muted, and then it catches nothing.
-- Business hours are EASTERN, per OVIS convention: local time, never UTC.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.email_ingestion_staleness()
RETURNS TABLE (
  is_stale          boolean,
  gap_minutes       numeric,
  last_received_at  timestamptz,
  in_business_hours boolean,
  detail            text
)
LANGUAGE sql
STABLE
AS $$
  WITH s AS (
    SELECT
      (SELECT max(received_at) FROM emails) AS last_rx,
      (now() AT TIME ZONE 'America/New_York')::time      AS et_time,
      extract(isodow FROM (now() AT TIME ZONE 'America/New_York')) AS et_dow
  ), c AS (
    SELECT
      last_rx,
      round(extract(epoch FROM (now() - last_rx)) / 60.0, 1) AS gap_min,
      -- Mon-Fri 08:00-18:00 ET. Weekend volume is 4-9/day, where a gap means
      -- nothing; running the check then would only train people to ignore it.
      (et_dow <= 5 AND et_time >= time '08:00' AND et_time < time '18:00') AS in_hours
    FROM s
  )
  SELECT
    (in_hours AND gap_min > 60)                      AS is_stale,
    gap_min,
    last_rx,
    in_hours,
    CASE
      WHEN NOT in_hours THEN
        'outside Mon-Fri 08:00-18:00 ET - not evaluated'
      WHEN gap_min > 60 THEN
        'NO EMAIL INGESTED FOR ' || gap_min || ' MINUTES during business hours. '
        || 'Expected roughly one every 5 minutes. gmail-sync can return HTTP 200 '
        || 'while delivering nothing, so check the function logs, not the cron status.'
      ELSE
        'ok - last email ' || gap_min || ' minutes ago'
    END                                              AS detail
  FROM c;
$$;

COMMENT ON FUNCTION public.email_ingestion_staleness() IS
  'Data-driven liveness check for gmail-sync. Cron status and HTTP 200 both stayed green through the 2026-09-07 8-hour stall; only the absence of rows revealed it.';

GRANT EXECUTE ON FUNCTION public.email_ingestion_staleness() TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Alert history: one row per firing, so a stall is visible after the fact and
-- repeat firings can be throttled.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.email_ingestion_alert (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fired_at      timestamptz NOT NULL DEFAULT now(),
  gap_minutes   numeric     NOT NULL,
  last_received_at timestamptz,
  detail        text        NOT NULL,
  resolved_at   timestamptz,
  notified      boolean     NOT NULL DEFAULT false
);

CREATE INDEX IF NOT EXISTS idx_email_ingestion_alert_open
  ON public.email_ingestion_alert (fired_at DESC) WHERE resolved_at IS NULL;

ALTER TABLE public.email_ingestion_alert ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "email_ingestion_alert_internal_all" ON public.email_ingestion_alert;
CREATE POLICY "email_ingestion_alert_internal_all" ON public.email_ingestion_alert
  FOR ALL TO authenticated USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());
GRANT SELECT, INSERT, UPDATE ON public.email_ingestion_alert TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- The check itself. Opens an alert when stale, resolves it when mail resumes.
-- Throttled to one open alert at a time: a stall lasting hours must not write
-- one row every 15 minutes.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.check_email_ingestion_staleness()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE s RECORD; v_open uuid;
BEGIN
  SELECT * INTO s FROM public.email_ingestion_staleness();

  SELECT id INTO v_open FROM public.email_ingestion_alert
   WHERE resolved_at IS NULL ORDER BY fired_at DESC LIMIT 1;

  IF s.is_stale AND v_open IS NULL THEN
    INSERT INTO public.email_ingestion_alert (gap_minutes, last_received_at, detail)
    VALUES (s.gap_minutes, s.last_received_at, s.detail);
    RAISE WARNING 'EMAIL INGESTION STALLED: %', s.detail;

  ELSIF NOT s.is_stale AND v_open IS NOT NULL AND s.gap_minutes <= 60 THEN
    -- Resolve only on real recovery (mail flowing again), NOT merely because
    -- the clock left business hours -- otherwise an overnight stall closes
    -- itself at 18:00 and nobody ever sees it.
    UPDATE public.email_ingestion_alert
       SET resolved_at = now()
     WHERE id = v_open;
  END IF;
END;
$$;

COMMENT ON FUNCTION public.check_email_ingestion_staleness() IS
  'Cron entry point. Opens one alert per stall, resolves it only when mail actually resumes.';

-- ---------------------------------------------------------------------------
-- Schedule: every 15 minutes. The threshold is 60 minutes, so this detects a
-- stall within 60-75 minutes of its start.
-- ---------------------------------------------------------------------------
SELECT cron.unschedule('email-ingestion-staleness-check')
 WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'email-ingestion-staleness-check');

SELECT cron.schedule(
  'email-ingestion-staleness-check',
  '*/15 * * * *',
  $cron$ SELECT public.check_email_ingestion_staleness(); $cron$
);

-- ============================================================================
-- ROLLBACK:
--   SELECT cron.unschedule('email-ingestion-staleness-check');
--   DROP FUNCTION IF EXISTS public.check_email_ingestion_staleness();
--   DROP FUNCTION IF EXISTS public.email_ingestion_staleness();
--   DROP TABLE IF EXISTS public.email_ingestion_alert;
-- ============================================================================

-- ============================================================================
-- APPLIED TO PRODUCTION 2026-09-07. Companion pieces applied alongside:
--   migration email_ingestion_alert_resolved_notified
--     -> resolved_notified / notify_error / notify_attempts columns
--   edge function email-ingestion-alert-dispatch  (Resend delivery)
--   cron job 16 'email-ingestion-alert-dispatch'  '5-59/15 * * * *'
--        (offset 5 min from the *//*15 detector so a stall is detected, then sent)
--
-- DELIVERY IS RESEND, deliberately: the alert reports that OVIS has stopped
-- pulling FROM Gmail, so any channel downstream of that pull is invisible during
-- exactly the failure it reports. merchant_closure_alert was considered and
-- REJECTED -- it has no dispatcher at all, only an admin tab, i.e. the "row in a
-- table nobody looks at" case. Resend is outbound-only, already proven on the
-- critical-date path, and needs no new vendor.
--
-- VERIFIED END-TO-END, not by inspection (2026-09-07):
--   synthetic open row  -> stall email sent, Resend id ca748383-7d6d-4ec0-87f1-a8d55e4b8be5
--   second invocation   -> considered 0, nothing re-sent (one email per stall)
--   row marked resolved -> all-clear sent,  Resend id 174b4252-4836-4a59-a46e-380760a2402d
--   fourth invocation   -> considered 0, quiet again
-- NOT force-tested: the Resend-failure branch. It is written to leave `notified`
-- false and record notify_error so the next run retries, and it requires a
-- message id in the RESPONSE BODY rather than trusting the status code -- but no
-- real failure was induced, so that path is verified by construction only.
-- ============================================================================
