-- A cron job that reports "succeeded" while every call it made was rejected.
--
-- net.http_post is fire-and-forget: it queues a request and returns a request_id, so pg_cron
-- records success the moment the row is queued. On 2026-09-27 a deploy silently turned
-- verify_jwt back on for ovis-site-research-worker; every tick 401'd at the gateway for 80
-- minutes and cron.job_run_details showed 'succeeded' for all 80 of them. Same shape as the
-- 2026-09-07 gmail-sync outage, where the cron reported 432 clean runs through an 8-hour stall.
--
-- A green job that did nothing is worse than a red one, so the tick now VERIFIES. Each call
-- checks the response to the PREVIOUS call before making the next one, and a non-2xx or a
-- never-answered request opens an alert row.
--
-- The alert is recorded and the failure is RAISED BY A SECOND JOB, not this one. Raising in the
-- same transaction that writes the alert rolls the alert back — the first cut of this did exactly
-- that, and the record vanished with the error. So cron_http_post_verified only records (the row
-- commits), and cron_http_assert_healthy, on its own schedule, raises while any alert is open.
-- That gives both halves: a durable record, and a red row in cron.job_run_details.

CREATE TABLE IF NOT EXISTS public.cron_http_post (
  job           text PRIMARY KEY,
  request_id    bigint,
  posted_at     timestamptz NOT NULL DEFAULT now(),
  last_ok_at    timestamptz
);
COMMENT ON TABLE public.cron_http_post IS
  'The most recent net.http_post per cron job, so the next tick can check how the last one landed.';

CREATE TABLE IF NOT EXISTS public.cron_http_alert (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job               text NOT NULL,
  fired_at          timestamptz NOT NULL DEFAULT now(),
  status_code       integer,               -- null = no response at all
  detail            text NOT NULL,
  resolved_at       timestamptz,
  notified          boolean NOT NULL DEFAULT false,
  resolved_notified boolean NOT NULL DEFAULT false,
  notify_error      text,
  notify_attempts   integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_cron_http_alert_open ON public.cron_http_alert (fired_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_cron_http_alert_pending_notify ON public.cron_http_alert (fired_at)
  WHERE notified = false OR (resolved_at IS NOT NULL AND resolved_notified = false);
COMMENT ON TABLE public.cron_http_alert IS
  'Open when a cron HTTP call came back non-2xx or never answered. Drained by email-ingestion-alert-dispatch.';

REVOKE ALL ON TABLE public.cron_http_post, public.cron_http_alert FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.cron_http_post, public.cron_http_alert TO service_role;
ALTER TABLE public.cron_http_post ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cron_http_alert ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- cron_http_post_verified: check how the last call landed, then make the next one.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cron_http_post_verified(
  p_job     text,
  p_url     text,
  p_headers jsonb,
  p_body    jsonb,
  p_grace   interval DEFAULT interval '2 minutes')
 RETURNS bigint
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prev     public.cron_http_post%ROWTYPE;
  v_status   integer;
  v_body     text;
  v_detail   text;
  v_open     uuid;
  v_bad      boolean := false;
  v_new_id   bigint;
BEGIN
  SELECT * INTO v_prev FROM public.cron_http_post WHERE job = p_job;

  IF v_prev.request_id IS NOT NULL THEN
    SELECT r.status_code, left(r.content::text, 400) INTO v_status, v_body
      FROM net._http_response r WHERE r.id = v_prev.request_id;

    IF v_status IS NULL THEN
      -- pg_net prunes old responses, so only treat silence as failure inside the grace window.
      IF v_prev.posted_at > now() - p_grace THEN
        NULL; -- too early to judge; the next tick will look again
      ELSIF v_prev.posted_at > now() - interval '30 minutes' THEN
        v_bad := true;
        v_detail := format('%s: no response to request %s posted %s', p_job, v_prev.request_id, v_prev.posted_at);
      END IF;
    ELSIF v_status < 200 OR v_status >= 300 THEN
      v_bad := true;
      v_detail := format('%s: HTTP %s from %s — %s', p_job, v_status, p_url, coalesce(v_body, ''));
    END IF;
  END IF;

  SELECT id INTO v_open FROM public.cron_http_alert
   WHERE job = p_job AND resolved_at IS NULL ORDER BY fired_at DESC LIMIT 1;

  IF v_bad THEN
    -- One open alert per job: a broken tick every minute must not send 60 emails an hour.
    IF v_open IS NULL THEN
      INSERT INTO public.cron_http_alert (job, status_code, detail) VALUES (p_job, v_status, v_detail);
    END IF;
    RAISE WARNING 'CRON HTTP FAILED: %', v_detail;
  ELSIF v_status IS NOT NULL THEN
    UPDATE public.cron_http_post SET last_ok_at = now() WHERE job = p_job;
    IF v_open IS NOT NULL THEN
      UPDATE public.cron_http_alert SET resolved_at = now() WHERE id = v_open;
    END IF;
  END IF;

  SELECT net.http_post(url := p_url, headers := p_headers, body := p_body) INTO v_new_id;
  INSERT INTO public.cron_http_post (job, request_id, posted_at) VALUES (p_job, v_new_id, now())
    ON CONFLICT (job) DO UPDATE SET request_id = EXCLUDED.request_id, posted_at = EXCLUDED.posted_at;

  -- Deliberately no RAISE here: it would roll back the alert row written above.
  RETURN v_new_id;
END;
$function$;

REVOKE ALL ON FUNCTION public.cron_http_post_verified(text, text, jsonb, jsonb, interval) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_http_post_verified(text, text, jsonb, jsonb, interval) TO service_role;

-- ---------------------------------------------------------------------------
-- The alarm: raises while any alert is open, so a job row goes red in job_run_details.
-- Separate job, separate transaction — the alert it complains about is already committed.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cron_http_assert_healthy()
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE v_detail text; v_n integer;
BEGIN
  SELECT count(*), min(detail) INTO v_n, v_detail FROM public.cron_http_alert WHERE resolved_at IS NULL;
  IF v_n > 0 THEN
    RAISE EXCEPTION 'cron HTTP unhealthy: % open alert(s); oldest: %', v_n, left(v_detail, 300);
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.cron_http_assert_healthy() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_http_assert_healthy() TO service_role;

SELECT cron.schedule('cron-http-alarm', '*/5 * * * *', 'SELECT public.cron_http_assert_healthy();');

-- ---------------------------------------------------------------------------
-- Repoint the site-research tick through the verifier.
-- ---------------------------------------------------------------------------
SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'ovis-site-research-tick'),
  command := $cmd$
  SELECT public.cron_http_post_verified(
    'ovis-site-research-tick',
    'https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/ovis-site-research-worker',
    jsonb_build_object(
      'X-Worker-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'site_research_worker_secret'),
      'Content-Type', 'application/json'
    ),
    '{"action":"tick"}'::jsonb
  );
  $cmd$);
