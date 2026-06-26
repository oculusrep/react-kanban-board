-- Stop the friday-cfo-email cron jobs.
--
-- The jobs were scheduled by 20260302100000_friday_cfo_email_cron.sql but have
-- been silently failing every Friday because the migration references
-- vault.decrypted_secrets WHERE name = 'service_role_key', which doesn't exist
-- in this project's vault. Every invocation returns HTTP 500.
--
-- Mike will rework the friday-cfo-email feature later; until then we want it
-- off so the cron logs are clean. The Edge Function code is left in place at
-- supabase/functions/friday-cfo-email/ for the rework.

DO $$
BEGIN
  PERFORM cron.unschedule('friday-cfo-email-summer');
EXCEPTION WHEN OTHERS THEN
  -- Job not present, fine.
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('friday-cfo-email-winter');
EXCEPTION WHEN OTHERS THEN
  -- Job not present, fine.
END;
$$;
