-- Schedule daily refresh of merchant brand Brandfetch licenses.
--
-- Brandfetch's Logo API ToS expires a brand's license after 30 days with no
-- API call. The merchant-logo-refresh Edge Function walks merchant_brand rows
-- with logo_fetched_at older than 25 days, hits the Brandfetch Search API
-- (which renews the license), and bumps logo_fetched_at on success.
--
-- See:
--   - supabase/functions/merchant-logo-refresh/index.ts (the function)
--   - docs/MERCHANTS_LAYER_SPEC.md §5.2 (the ToS context)
--
-- Daily at 08:00 UTC = 3am EST / 4am EDT (quiet hours). One invocation
-- processes up to 150 brands. With 401 total, the first 3 days backfill
-- everything; steady state thereafter is ~14 brands/day.
--
-- Auth pattern: uses the legacy anon JWT inlined, matching the working
-- email-triage-job cron (NOT the friday-cfo-email pattern, which references a
-- non-existent vault.secrets row and therefore silently fails every Friday).
-- The function does its DB work via SUPABASE_SERVICE_ROLE_KEY in its own env;
-- the JWT here only authorizes the Edge Function invocation itself.

CREATE EXTENSION IF NOT EXISTS pg_net;

-- Unschedule any previous version of this job.
DO $$
BEGIN
  PERFORM cron.unschedule('merchant-logo-refresh-daily');
EXCEPTION WHEN OTHERS THEN
  -- Job didn't exist, fine.
END;
$$;

SELECT cron.schedule(
  'merchant-logo-refresh-daily',
  '0 8 * * *',  -- 08:00 UTC daily
  $$
  SELECT net.http_post(
    url := 'https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/merchant-logo-refresh',
    headers := jsonb_build_object(
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJxYnZjdndiemlpbG55Y3F0bW5jIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTAyMzk5ODIsImV4cCI6MjA2NTgxNTk4Mn0.819LDXCnlu2dgCPw91oMbZIojeFom-UxqJn2hA5yjBM',
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
  SELECT COUNT(*) INTO job_count FROM cron.job WHERE jobname = 'merchant-logo-refresh-daily';
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Merchant Logo Refresh Cron Setup';
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Jobs created: %', job_count;
  RAISE NOTICE 'Schedule: daily at 08:00 UTC (3am EST / 4am EDT)';
  RAISE NOTICE '';
  RAISE NOTICE 'BEFORE FIRST RUN: ensure the BRANDFETCH_CLIENT_ID Edge Function';
  RAISE NOTICE 'secret is set, e.g.:';
  RAISE NOTICE '  supabase secrets set BRANDFETCH_CLIENT_ID=<value>';
  RAISE NOTICE '==========================================';
END $$;
