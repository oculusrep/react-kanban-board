-- Setup cron jobs for Friday CFO Email
-- Two jobs to handle EST/EDT transitions (9am EST = 14:00 UTC, 9am EDT = 13:00 UTC)
-- The function itself checks if it's Friday 8-10 AM Eastern and skips if not

-- First, enable the pg_net extension for HTTP calls (pg_cron is already enabled on Supabase)
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any existing jobs for this function (in case of re-run)
-- Using DO block to handle case where jobs don't exist yet
DO $$
BEGIN
  PERFORM cron.unschedule('friday-cfo-email-summer');
EXCEPTION WHEN OTHERS THEN
  -- Job doesn't exist, that's fine
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('friday-cfo-email-winter');
EXCEPTION WHEN OTHERS THEN
  -- Job doesn't exist, that's fine
END;
$$;

-- Get the project URL and service role key from vault
-- Note: On Supabase, we use the edge function invoke URL pattern

-- Schedule for 13:00 UTC on Fridays (covers 9am EDT in summer)
SELECT cron.schedule(
  'friday-cfo-email-summer',
  '0 13 * * 5',
  $$
  SELECT net.http_post(
    url := 'https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/friday-cfo-email',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )
  $$
);

-- Schedule for 14:00 UTC on Fridays (covers 9am EST in winter)
SELECT cron.schedule(
  'friday-cfo-email-winter',
  '0 14 * * 5',
  $$
  SELECT net.http_post(
    url := 'https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/friday-cfo-email',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'),
      'Content-Type', 'application/json'
    ),
    body := '{}'::jsonb
  )
  $$
);

-- Verify the jobs were created
DO $$
DECLARE
  job_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO job_count
  FROM cron.job
  WHERE jobname IN ('friday-cfo-email-summer', 'friday-cfo-email-winter');

  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Friday CFO Email Cron Jobs Setup Complete';
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Jobs created: %', job_count;
  RAISE NOTICE '';
  RAISE NOTICE 'Schedule:';
  RAISE NOTICE '  - friday-cfo-email-summer: 13:00 UTC Fridays (9am EDT)';
  RAISE NOTICE '  - friday-cfo-email-winter: 14:00 UTC Fridays (9am EST)';
  RAISE NOTICE '';
  RAISE NOTICE 'The function checks Eastern Time and only sends once.';
  RAISE NOTICE '==========================================';
END $$;
