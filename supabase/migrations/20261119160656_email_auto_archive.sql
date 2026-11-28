-- email_auto_archive — OVIS taking a labelled message out of the inbox.
--
-- WHY
-- The owner asked (2026-11-19) that mail labelled OVIS/Reading or OVIS/Junk keep
-- its label and leave the inbox. label-inbox does that after labelling. This
-- reverses part of the 2026-10-03 "archive-on-arrival is off the table" decision,
-- for those two labels only; the rest still archive by hand.
--
-- WHY A TABLE, NOT COLUMNS ON email_label
--   * Archive ONCE. If the owner pulls a message back into the inbox, that is an
--     override, and re-archiving it every 5 minutes would fight them. A row here
--     means "already done, leave it alone".
--   * Hand-tagged Reading has no email_label row and must not get one: the
--     reconcile pass treats every email_label row as OVIS's own label and would
--     strip it.
--   * label-watcher attributes an INBOX removal to OVIS by matching archived_at,
--     so OVIS's archive is not recorded as the owner's "handled" gesture.

CREATE TABLE IF NOT EXISTS public.email_auto_archive (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_connection_id uuid NOT NULL REFERENCES public.gmail_connection(id) ON DELETE CASCADE,
  gmail_id            varchar(255) NOT NULL,
  -- The OVIS label the message carried when it was archived.
  label               text NOT NULL,
  -- Intent row first, then the Gmail call (same order as email_label, same
  -- reason): archived_at NULL means not confirmed, archive_error says why.
  archived_at         timestamptz,
  archive_error       text,
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS email_auto_archive_unique_target
  ON public.email_auto_archive (gmail_id, gmail_connection_id);
CREATE INDEX IF NOT EXISTS idx_email_auto_archive_created
  ON public.email_auto_archive (created_at DESC);

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON public.email_auto_archive FROM anon, authenticated;
GRANT SELECT ON public.email_auto_archive TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_auto_archive TO service_role;

ALTER TABLE public.email_auto_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS email_auto_archive_select_internal ON public.email_auto_archive;
CREATE POLICY email_auto_archive_select_internal ON public.email_auto_archive
  FOR SELECT TO authenticated
  USING (public.is_internal_user());

COMMENT ON TABLE public.email_auto_archive IS
  'Messages label-inbox removed from the Gmail inbox because they carry an auto-archive label (OVIS/Reading, OVIS/Junk). One row per message per mailbox: archived once, never re-archived.';
