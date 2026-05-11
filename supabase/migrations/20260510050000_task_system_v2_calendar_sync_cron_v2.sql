-- Task System v2 — Phase 3 calendar sync cron, v2.
-- Replaces the original cron migration which depended on a vault-stored
-- service_role_key secret that was never populated (so every tick 401-ed
-- at the edge function gateway). The function is now deployed with
-- verify_jwt=false and does its own auth check: cron passes
-- X-Cron-Secret matching the CRON_SECRET env var; the in-app Sync Now
-- button passes the user's JWT.

DO $$
BEGIN
  PERFORM cron.unschedule('gcal-sync-tick');
EXCEPTION WHEN OTHERS THEN
  -- Job doesn't exist yet; ignore.
END;
$$;

SELECT cron.schedule(
  'gcal-sync-tick',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/gcal-sync',
    headers := jsonb_build_object(
      'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'gcal_cron_secret'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )
  $$
);

DO $$
DECLARE
  job_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO job_count FROM cron.job WHERE jobname = 'gcal-sync-tick';
  RAISE NOTICE 'gcal-sync-tick (v2) scheduled: % job(s)', job_count;
END $$;
