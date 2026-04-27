-- Cron job: drain pending_client_comment_email queue every 5 minutes
-- Invokes the send-portal-comment-alert edge function, which finds rows where
-- last_comment_at < NOW() - 20 minutes, sends a Resend email per row, and
-- deletes the row.

CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule('portal-comment-alert-drain');
EXCEPTION WHEN OTHERS THEN
  -- Job doesn't exist yet — ignore
END;
$$;

SELECT cron.schedule(
  'portal-comment-alert-drain',
  '*/5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/send-portal-comment-alert',
    headers := jsonb_build_object(
      'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key'),
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
  SELECT COUNT(*) INTO job_count
  FROM cron.job
  WHERE jobname = 'portal-comment-alert-drain';

  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Portal Comment Alert Cron Setup Complete';
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Job created: % (every 5 minutes)', job_count;
  RAISE NOTICE '==========================================';
END $$;
