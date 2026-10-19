-- Labeler freshness check.
--
-- The canary watches the WATCHER (are label changes recorded?). Nothing watched
-- the LABELER, which is how 600 messages sat unlabelled for two days and the
-- owner found it by hand -- exactly what the canary was built to prevent, one
-- component to the left.
--
-- Computed by label-inbox itself, because the question is about GMAIL's inbox.
-- email_visibility.folder_label is written once at ingest and never refreshed
-- (26k rows claim INBOX), so a SQL-only check would answer a different question
-- confidently.
--
-- THE THREE VERDICTS, and why 'inconclusive' is not 'healthy':
--   healthy       there was labellable mail and it is labelled
--   unhealthy     mail triage finished with, older than the grace period, still
--                 bare in Gmail
--   inconclusive  nothing was labellable this run. The check could not fail,
--                 so it did not pass. Reporting that as healthy is the
--                 self-confirming trap this project has hit six times.
CREATE TABLE IF NOT EXISTS public.email_labeler_health (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  checked_at         timestamptz NOT NULL DEFAULT now(),
  mailbox            text NOT NULL,
  verdict            text NOT NULL CHECK (verdict IN ('healthy','unhealthy','inconclusive')),
  inbox_total        integer NOT NULL,
  -- triage finished with these: they SHOULD carry a label
  labelable_total    integer NOT NULL,
  labelled           integer NOT NULL,
  -- the failure signal: labellable, older than the grace period, still bare
  bare_stale         integer NOT NULL,
  -- not a fault: triage has not run on these yet, so bare is correct
  awaiting_triage    integer NOT NULL,
  detail             text
);

CREATE INDEX IF NOT EXISTS idx_email_labeler_health_recent
  ON public.email_labeler_health (mailbox, checked_at DESC);

-- Same shape as the other alert tables so the existing dispatcher drains it.
CREATE TABLE IF NOT EXISTS public.email_labeler_alert (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fired_at          timestamptz NOT NULL DEFAULT now(),
  mailbox           text NOT NULL,
  bare_stale        integer NOT NULL,
  labelable_total   integer NOT NULL,
  detail            text,
  resolved_at       timestamptz,
  notified          boolean NOT NULL DEFAULT false,
  resolved_notified boolean NOT NULL DEFAULT false,
  notify_error      text,
  notify_attempts   integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_email_labeler_alert_open
  ON public.email_labeler_alert (fired_at DESC) WHERE resolved_at IS NULL;

REVOKE ALL ON public.email_labeler_health, public.email_labeler_alert FROM anon, authenticated;
GRANT SELECT ON public.email_labeler_health, public.email_labeler_alert TO authenticated;
ALTER TABLE public.email_labeler_health ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_labeler_alert ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_labeler_health_select_internal ON public.email_labeler_health;
CREATE POLICY email_labeler_health_select_internal ON public.email_labeler_health
  FOR SELECT TO authenticated USING (public.is_internal_user());
DROP POLICY IF EXISTS email_labeler_alert_select_internal ON public.email_labeler_alert;
CREATE POLICY email_labeler_alert_select_internal ON public.email_labeler_alert
  FOR SELECT TO authenticated USING (public.is_internal_user());
