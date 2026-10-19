-- Canary for the label pipeline: prove end to end, every cycle, that a label
-- change in Gmail lands in gmail_label_event with the RIGHT classification.
--
-- WHY. Six times on this project a green status has meant nothing happened --
-- most recently the watcher itself, which reported events_recorded: 0 for three
-- days while every insert failed. The answer is not a longer measurement
-- window; it is a check that can come back negative.
--
-- WHAT MAKES THIS ONE ABLE TO FAIL. It asserts specific expected values, not
-- "a row exists":
--   * applies an OVIS label WITHOUT writing an email_label row, so the watcher
--     must attribute it to the OWNER. If it says 'ovis' or 'ambiguous',
--     attribution is broken and the canary fails.
--   * the add must classify as 'correction'; the bare removal must classify as
--     'handled'. A wrong gesture fails the canary.
--   * every state carries a deadline. Nothing observed in 15 minutes, or a
--     cycle not completing in 60, is a failure -- which catches the watcher
--     being down, the cron being rejected, or the gesture pass never running.
--
-- The message is excluded from the correction set BY CONSTRUCTION: the watcher
-- stamps excluded = true on any event whose gmail_id matches the canary row, so
-- nothing depends on remembering to filter it.

CREATE TABLE IF NOT EXISTS public.email_canary (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_connection_id uuid NOT NULL REFERENCES public.gmail_connection(id) ON DELETE CASCADE,
  -- The dedicated message. Nothing else is ever touched.
  gmail_id            varchar(255) NOT NULL,
  label               text NOT NULL DEFAULT 'OVIS/Canary',

  -- idle -> applied -> verified_add -> removed -> (verified_remove => idle)
  state               text NOT NULL DEFAULT 'idle'
                      CHECK (state IN ('idle','applied','verified_add','removed','failed')),
  state_at            timestamptz NOT NULL DEFAULT now(),

  last_success_at     timestamptz,
  last_failure_at     timestamptz,
  last_failure_reason text,
  consecutive_failures integer NOT NULL DEFAULT 0,
  is_active           boolean NOT NULL DEFAULT true,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_canary_one_per_connection
  ON public.email_canary (gmail_connection_id);

-- Same shape as email_ingestion_alert / email_classifier_alert so the existing
-- dispatcher drains it the same way: one email per incident, one on recovery,
-- and `notified` flips only on a confirmed Resend message id.
CREATE TABLE IF NOT EXISTS public.email_canary_alert (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  fired_at          timestamptz NOT NULL DEFAULT now(),
  reason            text NOT NULL,
  detail            text,
  stuck_state       text,
  stuck_since       timestamptz,
  resolved_at       timestamptz,
  notified          boolean NOT NULL DEFAULT false,
  resolved_notified boolean NOT NULL DEFAULT false,
  notify_error      text,
  notify_attempts   integer NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_email_canary_alert_open
  ON public.email_canary_alert (fired_at DESC) WHERE resolved_at IS NULL;

REVOKE ALL ON public.email_canary, public.email_canary_alert FROM anon, authenticated;
GRANT SELECT ON public.email_canary, public.email_canary_alert TO authenticated;
ALTER TABLE public.email_canary ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_canary_alert ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_canary_select_internal ON public.email_canary;
CREATE POLICY email_canary_select_internal ON public.email_canary
  FOR SELECT TO authenticated USING (public.is_internal_user());
DROP POLICY IF EXISTS email_canary_alert_select_internal ON public.email_canary_alert;
CREATE POLICY email_canary_alert_select_internal ON public.email_canary_alert
  FOR SELECT TO authenticated USING (public.is_internal_user());

COMMENT ON TABLE public.email_canary IS
  'End-to-end probe of the label pipeline. Applies and removes a label on one dedicated message and asserts the watcher classified it correctly. Its events are excluded from the correction set by construction.';
