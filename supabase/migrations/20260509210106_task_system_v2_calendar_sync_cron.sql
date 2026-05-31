-- Migration: Task System v2 — Phase 3 calendar sync cron
-- Date: 2026-05-09
-- Spec: docs/TASK_SYSTEM_V2_SPEC.md (§9.3)
-- Plan: docs/TASK_SYSTEM_V2_PHASE_2_PLAN.md (PR 6)
--
-- Schedules gcal-sync to run every 5 minutes via pg_cron + pg_net.
-- Mirrors the friday-cfo-email cron pattern (vault-stored service role key).

CREATE EXTENSION IF NOT EXISTS pg_net;

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
  SELECT COUNT(*) INTO job_count FROM cron.job WHERE jobname = 'gcal-sync-tick';
  RAISE NOTICE 'gcal-sync-tick scheduled: % job(s)', job_count;
END $$;
