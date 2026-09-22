-- pg_cron -> edge function authentication, for the functions that now run a
-- service-only caller check (see _shared/caller-auth.ts).
--
-- BEFORE: email-triage-job sent only a hardcoded legacy anon JWT; the
-- portal-comment-alert-drain sent 'Bearer ' || <vault 'service_role_key'>, but
-- that vault secret has never existed, so it sent `Bearer null` and only worked
-- because the function had verify_jwt = false (i.e. was open to the internet).
--
-- AFTER, both jobs send two headers:
--   Authorization: Bearer <gateway_anon_jwt>  — only to get past the platform's
--                   verify_jwt gate. It is the public anon JWT, not a secret and
--                   not what authorizes the call.
--   X-Cron-Secret: <ovis_cron_secret>         — what caller-auth.ts actually
--                   checks. The same shared-secret pattern gcal-sync,
--                   ovis-sweep-tick and the site-research worker already use,
--                   which also keeps the service-role key out of vault.
--
-- ovis_cron_secret is created OUT OF BAND (its value must never be in git) and
-- must equal the OVIS_CRON_SECRET function secret. This migration refuses to run
-- without it rather than quietly scheduling calls that would all be rejected.
--
-- These two jobs were created directly in the database and were never in a
-- migration; this is the first time their definitions are in version control.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'ovis_cron_secret') THEN
    RAISE EXCEPTION 'vault secret ovis_cron_secret is missing: create it (same value as the OVIS_CRON_SECRET function secret) before applying this migration';
  END IF;
END $$;

-- The public anon JWT, lifted from the existing job's header so the value never
-- appears in this file. Only created once.
DO $$
DECLARE v_jwt text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'gateway_anon_jwt') THEN
    SELECT substring(command FROM 'Bearer ([A-Za-z0-9._-]{20,})') INTO v_jwt
    FROM cron.job WHERE jobname = 'email-triage-job';
    IF v_jwt IS NULL THEN
      RAISE EXCEPTION 'could not read the gateway JWT from email-triage-job';
    END IF;
    PERFORM vault.create_secret(
      v_jwt, 'gateway_anon_jwt',
      'Public anon JWT so pg_cron calls pass the edge gateway verify_jwt check. Not an authorization credential — X-Cron-Secret is.');
  END IF;
END $$;

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'email-triage-job'),
  command := $cmd$
    SELECT net.http_post(
      url := 'https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/email-triage',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'gateway_anon_jwt'),
        'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ovis_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $cmd$
);

SELECT cron.alter_job(
  (SELECT jobid FROM cron.job WHERE jobname = 'portal-comment-alert-drain'),
  command := $cmd$
    SELECT net.http_post(
      url := 'https://rqbvcvwbziilnycqtmnc.supabase.co/functions/v1/send-portal-comment-alert',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'gateway_anon_jwt'),
        'X-Cron-Secret', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'ovis_cron_secret'),
        'Content-Type', 'application/json'
      ),
      body := '{}'::jsonb
    );
  $cmd$
);
