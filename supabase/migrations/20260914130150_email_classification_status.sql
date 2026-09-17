-- ============================================================================
-- Email classification state + classifier-health alert
--
-- WHY: from 2026-09-09 11:45 ET to 2026-09-14 every Gemini call returned 429
-- ("prepayment credits are depleted"). email-triage's error handler set
-- ai_processed = true "to avoid infinite retries", so ~580 emails were marked
-- processed with no classification. A failed call and a successful one wrote
-- the same row state, and ingestion kept running normally, so the staleness
-- monitor (20260907220000) could not see it. Five days of outage looked like
-- normal operation.
--
-- WHAT:
--   1. emails.classification_status: pending | classified | failed | abandoned
--      ai_processed stays, but now means ONLY "a verdict was recorded". It is
--      kept in sync with status = 'classified' by trigger + CHECK.
--      failed    = last attempt errored; retry scheduled at next_attempt_at.
--      abandoned = failed MAX_ATTEMPTS times; not auto-retried, still counted.
--   2. classification_outcome records HOW a verdict was reached, so a model
--      loop that ended without calling done() is countable instead of
--      looking like a real verdict.
--   3. Model token usage per email, so cost is measured, not estimated.
--   4. email_classifier_alert + email_classifier_health() +
--      check_email_classifier_health(), on its own cron. Dispatched by
--      email-ingestion-alert-dispatch (extended, same Resend path).
--
-- DEPLOY ORDER: apply this migration BEFORE deploying the new email-triage.
-- The trigger keeps the currently-deployed code working: its writes of
-- ai_processed = true are promoted to status 'classified' (same as today), and
-- the UI's re-triage reset (ai_processed -> false) returns the row to pending.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Columns
--
-- Added with DEFAULT 'classified' so existing rows fill in without a table
-- rewrite (every existing row has ai_processed = true -- verified 0 unprocessed
-- on 2026-09-14). Rows that are not processed are then set to 'pending', and the
-- default flipped to 'pending' for new inserts.
--
-- The ~580 outage emails are left 'classified' here on purpose. Their IDs exist
-- only in function logs; they are marked 'failed' in the re-run step, not
-- guessed at in a migration.
-- ---------------------------------------------------------------------------
ALTER TABLE public.emails
  ADD COLUMN classification_status text NOT NULL DEFAULT 'classified',
  ADD COLUMN classification_outcome text,
  ADD COLUMN classification_attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN classification_last_attempt_at timestamptz,
  ADD COLUMN classification_next_attempt_at timestamptz,
  ADD COLUMN classification_error text,
  ADD COLUMN classification_input_tokens integer,
  ADD COLUMN classification_output_tokens integer;

UPDATE public.emails
   SET classification_status = 'pending'
 WHERE ai_processed = false;

ALTER TABLE public.emails
  ALTER COLUMN classification_status SET DEFAULT 'pending';

ALTER TABLE public.emails
  ADD CONSTRAINT emails_classification_status_valid
    CHECK (classification_status IN ('pending', 'classified', 'failed', 'abandoned')),
  ADD CONSTRAINT emails_classification_outcome_valid
    CHECK (classification_outcome IS NULL OR classification_outcome IN (
      'model_done',          -- model called done() with a verdict
      'model_no_verdict',    -- model loop ended without done(); default keep applied
      'rule_exclusion',      -- agent_rules exclusion, no model call
      'rule_link',           -- agent_rules link rule, no model call
      'thread_inheritance',  -- inheritance short-circuit, no model call
      'sender_automatch'     -- auto-match short-circuit, no model call
    )),
  ADD CONSTRAINT emails_ai_processed_matches_status
    CHECK (ai_processed = (classification_status = 'classified'));

COMMENT ON COLUMN public.emails.ai_processed IS
  'True only when a classification verdict was recorded. Mirrors classification_status = ''classified''. A failed model call does NOT set this.';
COMMENT ON COLUMN public.emails.classification_status IS
  'pending | classified | failed (retry scheduled at classification_next_attempt_at) | abandoned (max attempts, not auto-retried).';

-- Triage picker is served by the existing partial idx_emails_ai_processed
-- (WHERE ai_processed = false) -- verified by EXPLAIN in the dry run.

-- Health check: recent failures and recent model verdicts.
CREATE INDEX idx_emails_classification_failed_recent
  ON public.emails (classification_last_attempt_at DESC)
  WHERE classification_status IN ('failed', 'abandoned');

-- ---------------------------------------------------------------------------
-- 2. Keep ai_processed and classification_status in step for writers that only
--    know about ai_processed (the currently-deployed email-triage, and
--    EmailClassificationReviewPage's re-triage reset).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.emails_sync_classification_status()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  -- Only fill in status when the writer did NOT set it. A writer that sets both
  -- inconsistently (e.g. status 'failed' with ai_processed = true) is a bug, and
  -- must hit emails_ai_processed_matches_status rather than be silently
  -- "corrected" into looking like a success -- that is the failure this
  -- migration exists to end.
  IF NEW.classification_status IS DISTINCT FROM OLD.classification_status THEN
    RETURN NEW;
  END IF;

  IF NEW.ai_processed AND NOT OLD.ai_processed THEN
    -- A writer recorded a verdict without setting status.
    NEW.classification_status := 'classified';
    NEW.classification_error := NULL;
    NEW.classification_next_attempt_at := NULL;
  ELSIF NOT NEW.ai_processed AND OLD.ai_processed THEN
    -- A writer asked for re-triage without setting status.
    NEW.classification_status := 'pending';
    NEW.classification_outcome := NULL;
    NEW.classification_attempts := 0;
    NEW.classification_error := NULL;
    NEW.classification_next_attempt_at := NULL;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_emails_sync_classification_status
  BEFORE UPDATE OF ai_processed ON public.emails
  FOR EACH ROW
  EXECUTE FUNCTION public.emails_sync_classification_status();

-- ---------------------------------------------------------------------------
-- 3. Classifier health
--
-- Separate from ingestion staleness on purpose: ingestion ran clean for five
-- days while nothing was classified. This watches the classifier's own output.
--
-- Evaluated 24/7, gated on volume rather than business hours -- a model outage
-- at 21:00 matters as much as one at 10:00, and the volume thresholds keep a
-- quiet night from alerting.
--
-- Unhealthy when ANY of:
--   A. model outage:   >= 3 failed attempts in 60 min and 0 model verdicts
--   B. degraded:       >= 5 failed attempts in 60 min and failures > verdicts
--   C. backlog:        oldest due-or-failed unclassified email > 90 min old
--                      (capacity is 60/hour at 5 per 5-minute run)
--   D. abandoned:      any email abandoned in the last 24 hours
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.email_classifier_health()
RETURNS TABLE (
  is_unhealthy boolean,
  reasons text[],
  failed_60m integer,
  model_verdicts_60m integer,
  backlog_count integer,
  oldest_backlog_at timestamptz,
  abandoned_24h integer,
  last_error text,
  detail text
)
LANGUAGE sql
STABLE
AS $$
  WITH m AS (
    SELECT
      (SELECT count(*) FROM public.emails
        WHERE classification_status IN ('failed', 'abandoned')
          AND classification_last_attempt_at > now() - interval '60 minutes')::int AS failed_60m,
      (SELECT count(*) FROM public.emails
        WHERE classification_outcome IN ('model_done', 'model_no_verdict')
          AND ai_processed_at > now() - interval '60 minutes')::int AS verdicts_60m,
      (SELECT count(*) FROM public.emails
        WHERE ai_processed = false AND classification_status <> 'abandoned')::int AS backlog,
      (SELECT min(created_at) FROM public.emails
        WHERE ai_processed = false AND classification_status <> 'abandoned') AS oldest,
      (SELECT count(*) FROM public.emails
        WHERE classification_status = 'abandoned'
          AND classification_last_attempt_at > now() - interval '24 hours')::int AS abandoned_24h,
      (SELECT classification_error FROM public.emails
        WHERE classification_status IN ('failed', 'abandoned')
        ORDER BY classification_last_attempt_at DESC NULLS LAST LIMIT 1) AS last_error
  ), r AS (
    SELECT m.*,
      array_remove(ARRAY[
        CASE WHEN failed_60m >= 3 AND verdicts_60m = 0 THEN 'model_outage' END,
        CASE WHEN failed_60m >= 5 AND failed_60m > verdicts_60m THEN 'degraded' END,
        CASE WHEN oldest < now() - interval '90 minutes' THEN 'backlog' END,
        CASE WHEN abandoned_24h > 0 THEN 'abandoned' END
      ], NULL) AS reasons
    FROM m
  )
  SELECT
    cardinality(reasons) > 0,
    reasons,
    failed_60m,
    verdicts_60m,
    backlog,
    oldest,
    abandoned_24h,
    last_error,
    CASE WHEN cardinality(reasons) = 0 THEN
      'ok - ' || verdicts_60m || ' model verdicts, ' || failed_60m || ' failures in 60 min; backlog ' || backlog
    ELSE
      'EMAIL CLASSIFIER UNHEALTHY (' || array_to_string(reasons, ', ') || '): '
      || failed_60m || ' failed attempts and ' || verdicts_60m || ' model verdicts in 60 min; '
      || backlog || ' unclassified' || COALESCE(', oldest ' || to_char(oldest AT TIME ZONE 'America/New_York', 'YYYY-MM-DD HH24:MI') || ' ET', '')
      || '; ' || abandoned_24h || ' abandoned in 24h. Last error: ' || COALESCE(left(last_error, 300), 'none')
    END
  FROM r;
$$;

CREATE TABLE public.email_classifier_alert (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fired_at          timestamptz NOT NULL DEFAULT now(),
  reasons           text[] NOT NULL,
  failed_60m        integer NOT NULL,
  model_verdicts_60m integer NOT NULL,
  backlog_count     integer NOT NULL,
  oldest_backlog_at timestamptz,
  abandoned_24h     integer NOT NULL,
  last_error        text,
  detail            text NOT NULL,
  resolved_at       timestamptz,
  notified          boolean NOT NULL DEFAULT false,
  resolved_notified boolean NOT NULL DEFAULT false,
  notify_error      text,
  notify_attempts   integer NOT NULL DEFAULT 0
);

CREATE INDEX idx_email_classifier_alert_open
  ON public.email_classifier_alert (fired_at DESC) WHERE resolved_at IS NULL;
CREATE INDEX idx_email_classifier_alert_pending_notify
  ON public.email_classifier_alert (fired_at)
  WHERE notified = false OR (resolved_at IS NOT NULL AND resolved_notified = false);

ALTER TABLE public.email_classifier_alert ENABLE ROW LEVEL SECURITY;
CREATE POLICY email_classifier_alert_internal_all
  ON public.email_classifier_alert
  TO authenticated
  USING (is_internal_user())
  WITH CHECK (is_internal_user());

CREATE OR REPLACE FUNCTION public.check_email_classifier_health()
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE h RECORD; v_open uuid;
BEGIN
  SELECT * INTO h FROM public.email_classifier_health();

  SELECT id INTO v_open FROM public.email_classifier_alert
   WHERE resolved_at IS NULL ORDER BY fired_at DESC LIMIT 1;

  IF h.is_unhealthy AND v_open IS NULL THEN
    INSERT INTO public.email_classifier_alert
      (reasons, failed_60m, model_verdicts_60m, backlog_count, oldest_backlog_at,
       abandoned_24h, last_error, detail)
    VALUES
      (h.reasons, h.failed_60m, h.model_verdicts_60m, h.backlog_count, h.oldest_backlog_at,
       h.abandoned_24h, h.last_error, h.detail);
    RAISE WARNING '%', h.detail;

  -- Resolve only on positive evidence the model is answering again, or on an
  -- empty queue -- not merely on the failures ageing out of the 60-min window.
  ELSIF NOT h.is_unhealthy AND v_open IS NOT NULL
        AND (h.model_verdicts_60m > 0 OR h.backlog_count = 0) THEN
    UPDATE public.email_classifier_alert SET resolved_at = now() WHERE id = v_open;
  END IF;
END;
$$;

-- Offset from the ingestion check (*/15) so the two don't contend; dispatch
-- runs at 5-59/15 and picks both tables up.
SELECT cron.schedule(
  'email-classifier-health-check',
  '2-59/15 * * * *',
  $$SELECT public.check_email_classifier_health();$$
);
