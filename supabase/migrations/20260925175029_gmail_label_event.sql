-- gmail_label_event — every Gmail label change, and who we think made it.
--
-- PURPOSE: when the owner relabels a message by hand in Gmail, that is a
-- correction. Gmail cannot ask why, and OVIS has no surface to ask on yet, so
-- the disagreement is accumulated here and reviewed later. Record only: nothing
-- reads this to change behaviour, no rules are written from it.
--
-- ATTRIBUTION IS A TWO-STEP, ON PURPOSE. OVIS applying a label is itself a label
-- change, so the watcher has to tell its own writes from the owner's. Gmail's
-- history records carry NO timestamp, so an event cannot be aged by its own
-- content -- it is aged by when we observed it. Events therefore land as
-- 'pending' and are attributed on a later pass, once at least
-- LABEL_ATTRIBUTION_LAG_SECONDS have elapsed, by which time the labeller's own
-- email_label row is certainly written (it writes the intent row BEFORE calling
-- Gmail). Attributing immediately would race the labeller and credit the owner
-- with OVIS's own writes.

CREATE TABLE IF NOT EXISTS public.gmail_label_event (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  gmail_connection_id uuid REFERENCES public.gmail_connection(id) ON DELETE SET NULL,
  gmail_id            varchar(255) NOT NULL,
  message_id          varchar(500),
  email_id            uuid REFERENCES public.emails(id) ON DELETE SET NULL,

  event_type          text NOT NULL CHECK (event_type IN ('added', 'removed')),
  label               text NOT NULL,
  history_id          varchar(64),

  -- When the watcher saw it. Not when Gmail recorded it: history records have
  -- no timestamp, and pretending otherwise would put a false precision on the
  -- attribution window.
  observed_at         timestamptz NOT NULL DEFAULT now(),

  -- pending -> owner | ovis | ambiguous. 'ambiguous' is deliberately a value and
  -- not a silent drop: a row we could not attribute must stay visible, because
  -- the failure mode being guarded against is miscrediting a correction.
  attribution         text NOT NULL DEFAULT 'pending'
                      CHECK (attribution IN ('pending', 'owner', 'ovis', 'ambiguous')),
  attributed_at       timestamptz,
  attribution_note    text,

  -- What OVIS thought at the time, so a disagreement is readable later even if
  -- the message is reclassified or the rules move underneath it.
  ovis_label          text,
  ovis_verdict        text,

  created_at          timestamptz NOT NULL DEFAULT now()
);

-- One row per (message, label, event type, history record). Gmail can replay a
-- history record across paginated reads; this keeps a replay idempotent.
CREATE UNIQUE INDEX IF NOT EXISTS gmail_label_event_unique
  ON public.gmail_label_event (gmail_id, label, event_type, coalesce(history_id, ''));

CREATE INDEX IF NOT EXISTS idx_gmail_label_event_pending
  ON public.gmail_label_event (observed_at)
  WHERE attribution = 'pending';

-- The review queue this exists to feed, once there is a pile worth reviewing.
CREATE INDEX IF NOT EXISTS idx_gmail_label_event_owner
  ON public.gmail_label_event (observed_at DESC)
  WHERE attribution = 'owner';

-- The watcher needs its own cursor: gmail-sync advances last_history_id for
-- message ingestion and would drag label reads past unseen events.
ALTER TABLE public.gmail_connection
  ADD COLUMN IF NOT EXISTS last_label_history_id varchar(64);

COMMENT ON COLUMN public.gmail_connection.last_label_history_id IS
  'Watermark for the label watcher, independent of last_history_id. NULL means the watcher has not started for this connection; it initialises to the profile historyId so it never backfills history it cannot attribute.';

REVOKE ALL ON public.gmail_label_event FROM anon, authenticated;
GRANT SELECT ON public.gmail_label_event TO authenticated;

ALTER TABLE public.gmail_label_event ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS gmail_label_event_select_internal ON public.gmail_label_event;
CREATE POLICY gmail_label_event_select_internal ON public.gmail_label_event
  FOR SELECT TO authenticated
  USING (public.is_internal_user());

COMMENT ON TABLE public.gmail_label_event IS
  'Gmail label changes observed by the label watcher, attributed to the owner or to OVIS itself. Accumulates corrections; nothing acts on it yet.';
