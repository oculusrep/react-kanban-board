-- Every pg_cron job that posts to an edge function with the project's LEGACY anon
-- JWT started failing at the gateway. Last good email ingest: 2026-11-02 19:05 ET;
-- the next three days produced one 401 per tick:
--   401 {"message":"Legacy API keys are disabled", ... disabled on 2025-10-23 ...}
-- A disabled legacy key is rejected by the gateway BEFORE the function runs, and
-- that is true even for a verify_jwt = false function (measured 2026-11-05) — so
-- sending the legacy key is strictly worse than sending no Authorization header at
-- all, which is why the label-* jobs kept working and these five did not.
--
-- Five jobs carried it: gmail-sync-job and merchant-logo-refresh-daily inline,
-- email-triage-job and portal-comment-alert-drain via vault 'gateway_anon_jwt',
-- email-ingestion-alert-dispatch inline. The last one is why nobody was told:
-- check_email_ingestion_staleness() opened an alert at 2026-11-03 08:00 ET
-- (779 minutes with no mail) and the dispatcher that would have emailed it was
-- itself 401ing, so the row sat with notified = false, notify_attempts = 0.
--
-- Two changes here:
--
-- 1. Authenticate with the PUBLISHABLE key instead. It is public by design — the
--    same value ships in the browser bundle as VITE_SUPABASE_PUBLISHABLE_KEY — so
--    it is written literally rather than put in the vault. X-Cron-Secret is what
--    actually authorizes the caller (supabase/functions/_shared/caller-auth.ts);
--    the bearer only gets past the gateway. The secret is now sent on all five,
--    including the two functions that do not check it yet (see the note below).
--
-- 2. Post through public.cron_http_post_verified(), which reads the PREVIOUS tick's
--    status out of net._http_response and opens a cron_http_alert row on any
--    non-2xx. cron-http-alarm (job 25) then fails loudly every 5 minutes while an
--    alert is open. Plain net.http_post() is why this ran blind for three days:
--    cron.job_run_details recorded 864 "succeeded" runs, because *dispatching* the
--    request succeeded every time.
--
-- STILL OPEN, deliberately not fixed here (needs a function deploy from main):
-- gmail-sync, merchant-logo-refresh and email-ingestion-alert-dispatch call no
-- authorizeCaller at all — verified 2026-11-05 by invoking gmail-sync with nothing
-- but the publishable key, which synced both mailboxes and triggered triage. They
-- need { allowService: true, allowInternalUser: false } like send-portal-comment-alert.
--
-- The stale vault secret 'gateway_anon_jwt' is left in place, now unused.

do $$
declare
  v_publishable constant text := 'sb_publishable_8skUFrwUwkC0vkiOVjnCWA_2QK5qvxU';
  v_base        constant text := 'https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/';
  r             record;
  v_jobid       bigint;
begin
  for r in
    select * from (values
      ('gmail-sync-job',                 'gmail-sync'),
      ('email-triage-job',               'email-triage'),
      ('portal-comment-alert-drain',     'send-portal-comment-alert'),
      ('merchant-logo-refresh-daily',    'merchant-logo-refresh'),
      ('email-ingestion-alert-dispatch', 'email-ingestion-alert-dispatch')
    ) as t(jobname, fn)
  loop
    select jobid into v_jobid from cron.job where jobname = r.jobname;
    if v_jobid is null then
      raise exception 'cron job % not found', r.jobname;
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
      '{}'::jsonb
    );
        $cmd$, r.jobname, v_base || r.fn, v_publishable)
    );
  end loop;
end
$$;
