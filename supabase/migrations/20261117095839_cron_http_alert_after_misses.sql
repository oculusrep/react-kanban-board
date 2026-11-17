-- Cron HTTP monitor: per-job "alert after N consecutive misses".
--
-- portal-comment-alert-drain (every 5 min) gets one dropped response roughly once a day,
-- always on the top-of-hour post, and recovers on the next tick. The pending queue row
-- survives a missed call, so a single miss only delays an alert 5 minutes. Those
-- open/resolve emails were noise.
--
-- cron_http_post.alert_after (default 1 = unchanged behaviour for every other job)
-- cron_http_post.consecutive_failures, reset on any 2xx.
-- Function body rebuilt from the live pg_get_functiondef (2026-11-17), not from older files.

ALTER TABLE public.cron_http_post
  ADD COLUMN IF NOT EXISTS alert_after integer NOT NULL DEFAULT 1 CHECK (alert_after >= 1),
  ADD COLUMN IF NOT EXISTS consecutive_failures integer NOT NULL DEFAULT 0;

UPDATE public.cron_http_post SET alert_after = 2 WHERE job = 'portal-comment-alert-drain';

CREATE OR REPLACE FUNCTION public.cron_http_post_verified(p_job text, p_url text, p_headers jsonb, p_body jsonb, p_grace interval DEFAULT '00:02:00'::interval, p_timeout_ms integer DEFAULT 5000)
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
  v_fails    integer;
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
    UPDATE public.cron_http_post SET consecutive_failures = consecutive_failures + 1
     WHERE job = p_job RETURNING consecutive_failures INTO v_fails;
    -- Only alert once the job has missed alert_after times in a row.
    -- One open alert per job: a broken tick every minute must not send 60 emails an hour.
    IF v_open IS NULL AND v_fails >= coalesce(v_prev.alert_after, 1) THEN
      INSERT INTO public.cron_http_alert (job, status_code, detail)
      VALUES (p_job, v_status,
              CASE WHEN v_fails > 1 THEN v_detail || format(' (%s consecutive misses)', v_fails) ELSE v_detail END);
    END IF;
    RAISE WARNING 'CRON HTTP FAILED: %', v_detail;
  ELSIF v_status IS NOT NULL THEN
    UPDATE public.cron_http_post SET last_ok_at = now(), consecutive_failures = 0 WHERE job = p_job;
    IF v_open IS NOT NULL THEN
      UPDATE public.cron_http_alert SET resolved_at = now() WHERE id = v_open;
    END IF;
  END IF;

  SELECT net.http_post(url := p_url, headers := p_headers, body := p_body,
                       timeout_milliseconds := p_timeout_ms) INTO v_new_id;
  INSERT INTO public.cron_http_post (job, request_id, posted_at) VALUES (p_job, v_new_id, now())
    ON CONFLICT (job) DO UPDATE SET request_id = EXCLUDED.request_id, posted_at = EXCLUDED.posted_at;

  -- Deliberately no RAISE here: it would roll back the alert row written above.
  RETURN v_new_id;
END;
$function$;

-- Grants: unchanged function, restate them (service_role only; cron runs as postgres).
REVOKE ALL ON FUNCTION public.cron_http_post_verified(text, text, jsonb, jsonb, interval, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cron_http_post_verified(text, text, jsonb, jsonb, interval, integer) TO service_role;
