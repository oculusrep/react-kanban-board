-- property-email-filter-tick. APPLY LAST: only after label-inbox (with the
-- property_filter-aware decide()) and property-email-filter are both deployed.
-- If the filter runs before label-inbox knows about it, label-inbox puts
-- OVIS/Property back within 5 minutes (spec 1.9.1, deploy order).
--
-- 1-59/5: two minutes after label-inbox-tick (4-59/5 is three behind triage).
-- Same call shape as email-triage-job's live command (grace 4 min, 150s timeout).
--
-- Rollback step 1: select cron.alter_job(jobid, active := false) for this job.

DO $$
DECLARE
  v_publishable constant text := 'sb_publishable_8skUFrwUwkC0vkiOVjnCWA_2QK5qvxU';
  v_url         constant text := 'https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/property-email-filter';
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'property-email-filter-tick') THEN
    PERFORM cron.unschedule('property-email-filter-tick');
  END IF;
  PERFORM cron.schedule(
    'property-email-filter-tick',
    '1-59/5 * * * *',
    format($cmd$
    select public.cron_http_post_verified(
      'property-email-filter-tick',
      %L,
      jsonb_build_object(
        'Authorization', 'Bearer ' || %L,
        'X-Cron-Secret', (select decrypted_secret from vault.decrypted_secrets where name = 'ovis_cron_secret'),
        'Content-Type', 'application/json'
      ),
      '{}'::jsonb,
      '00:04:00'::interval,
      150000
    );
    $cmd$, v_url, v_publishable)
  );
END
$$;
