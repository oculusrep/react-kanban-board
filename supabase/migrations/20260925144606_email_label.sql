-- email_label — what OVIS decided a message is, and whether Gmail was actually told.
--
-- WHY THIS TABLE EXISTS
-- Twice now an outcome has lived only in an edge function's HTTP response body,
-- which pg_cron discards:
--   * gmail-sync's watermark_held (2026-09-25) — whether a run held the watermark
--     back is unobservable from the database.
--   * email-triage's gmail_label_applied — nobody can tell whether the OVIS-Linked
--     label was ever applied to anything, which is how a ~25% 404 rate on label
--     applies went unnoticed for months.
-- The labeler is the third such writer, so it records its own outcome instead.
-- One row per (message, mailbox, label): the decision, the verdict it came from,
-- and the result of the Gmail call — including the failures.

CREATE TABLE IF NOT EXISTS public.email_label (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- What was labelled. email_id may be null: the labeler enumerates from Gmail,
  -- so it can meet a message OVIS never ingested and must still record that.
  email_id            uuid REFERENCES public.emails(id) ON DELETE CASCADE,
  gmail_id            varchar(255) NOT NULL,
  message_id          varchar(500),

  -- Which mailbox. gmail_id is per-mailbox, so this pair is the real identity.
  gmail_connection_id uuid REFERENCES public.gmail_connection(id) ON DELETE CASCADE,

  -- The decision.
  label               text NOT NULL,
  -- What the decision was derived from, e.g. 'tier1:A1:list-unsubscribe',
  -- 'classification:rule_exclusion', 'link:deal', 'none'. Free text on purpose:
  -- the routing design is still moving, and a CHECK here would ossify it.
  source_verdict      text NOT NULL,

  -- The Gmail call. applied_at stays NULL for a dry run or a failure, so
  -- "was this label ever really applied?" is `applied_at IS NOT NULL` —
  -- the question that could not be asked before.
  applied_at          timestamptz,
  apply_error         text,
  dry_run             boolean NOT NULL DEFAULT false,

  created_at          timestamptz NOT NULL DEFAULT now()
);

-- One row per message per mailbox per label. A re-run updates in place rather
-- than accumulating duplicates.
CREATE UNIQUE INDEX IF NOT EXISTS email_label_unique_target
  ON public.email_label (gmail_id, gmail_connection_id, label);

CREATE INDEX IF NOT EXISTS idx_email_label_email ON public.email_label (email_id);
CREATE INDEX IF NOT EXISTS idx_email_label_label ON public.email_label (label, created_at DESC);
-- Partial index for the failure sweep: rows that were meant to apply and did not.
CREATE INDEX IF NOT EXISTS idx_email_label_unapplied
  ON public.email_label (created_at DESC)
  WHERE applied_at IS NULL AND dry_run = false;

-- Supabase grants every new public table to anon + authenticated by default, so
-- revoke first and grant back deliberately; RLS would otherwise be the only gate.
REVOKE ALL ON public.email_label FROM anon, authenticated;
GRANT SELECT ON public.email_label TO authenticated;

ALTER TABLE public.email_label ENABLE ROW LEVEL SECURITY;

-- Readable by internal users only. Writes come from the labeler via the
-- service-role key, which bypasses RLS; no write policy is granted to anyone else.
DROP POLICY IF EXISTS email_label_select_internal ON public.email_label;
CREATE POLICY email_label_select_internal ON public.email_label
  FOR SELECT TO authenticated
  USING (public.is_internal_user());

COMMENT ON TABLE public.email_label IS
  'OVIS label decisions per message per mailbox, and whether Gmail was actually told. applied_at IS NOT NULL means the Gmail modify call succeeded.';
