-- cron_http_post_verified() posted with pg_net's DEFAULT 5-second timeout, so a
-- long function never produced a response row and the wrapper reported
-- "no response to request <id>" — one false alert per tick for email-triage-job
-- (a pass runs 25–35s, up to its own 110s deadline) and gmail-sync-job (~20s).
-- The request itself completes; only our record of it was missing.
--
-- Adds p_timeout_ms, passed to net.http_post. The old 5-argument function is
-- dropped rather than left alongside: a 4-argument call site would match both and
-- fail as ambiguous. Body is otherwise the live definition, unchanged.

drop function if exists public.cron_http_post_verified(text, text, jsonb, jsonb, interval);

create function public.cron_http_post_verified(
  p_job        text,
  p_url        text,
  p_headers    jsonb,
  p_body       jsonb,
  p_grace      interval default '00:02:00'::interval,
  p_timeout_ms integer  default 5000
) returns bigint
language plpgsql
security definer
set search_path to 'public'
as $function$
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

  SELECT net.http_post(url := p_url, headers := p_headers, body := p_body,
                       timeout_milliseconds := p_timeout_ms) INTO v_new_id;
  INSERT INTO public.cron_http_post (job, request_id, posted_at) VALUES (p_job, v_new_id, now())
    ON CONFLICT (job) DO UPDATE SET request_id = EXCLUDED.request_id, posted_at = EXCLUDED.posted_at;

  -- Deliberately no RAISE here: it would roll back the alert row written above.
  RETURN v_new_id;
END;
$function$;

-- Grants: same as the function it replaces (postgres owns it, service_role may call).
revoke all on function public.cron_http_post_verified(text, text, jsonb, jsonb, interval, integer) from public, anon, authenticated;
grant execute on function public.cron_http_post_verified(text, text, jsonb, jsonb, interval, integer) to service_role;

-- The two slow jobs get a real timeout and a grace window wider than their runtime.
-- Written out in full rather than patched, so the command is exactly what is read back.
do $$
declare
  v_publishable constant text := 'sb_publishable_8skUFrwUwkC0vkiOVjnCWA_2QK5qvxU';
  v_base        constant text := 'https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/';
  v_jobid       bigint;
  r             record;
begin
  for r in
    select * from (values
      ('gmail-sync-job',   'gmail-sync',   150000, '00:04:00'),
      ('email-triage-job', 'email-triage', 150000, '00:04:00')
    ) as t(jobname, fn, timeout_ms, grace)
  loop
    select jobid into v_jobid from cron.job where jobname = r.jobname;
    if v_jobid is null then
      raise exception 'cron job %s not found', r.jobname;
    end if;

    perform cron.alter_job(
      v_jobid,
      command := format(
        $cmd$
    select public.cron_http_post_verified(
      %L,
      %L,
      jsonb_build_object(
        'Authorization', 'Bearer ' || %L,
        'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ovis_cron_secret'),
        'Content-Type', 'application/json'
      ),
      '{}'::jsonb,
      %L::interval,
      %s
    );
        $cmd$, r.jobname, v_base || r.fn, v_publishable, r.grace, r.timeout_ms)
    );
  end loop;
end
$$;

-- Clear the false alert this bug produced; a real failure reopens one next tick.
update public.cron_http_alert
   set resolved_at = now()
 where resolved_at is null
   and detail like '%no response to request%';
