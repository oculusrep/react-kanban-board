-- ============================================================================
-- Tier-1 stubs get their own table, so a later demote cannot overwrite them.
--
-- WHY: processed_message_ids has UNIQUE(message_id), one row per message. Two
-- kinds of writer share it:
--   gmail-sync       upserts the tier-1 verdict  (action tier1_bulk / tier1_personal)
--   email-triage     upserts action='demoted' when the agent demotes
--   two UI pages     upsert action='demoted' on a domain exclusion
-- All of them use onConflict 'message_id', so whichever writes last wins. A
-- tier-1 message that is later demoted loses its tier-1 row. The 2026-09-14
-- review found A5 fired 47 times with 0 surviving stubs, A1 kept 470 of 771,
-- and Q1-Q3 as specced undercounted as a result. The reverse also happens: a
-- re-sync's tier-1 upsert overwrites a 'demoted' row.
--
-- Of the 577 outage emails queued for re-triage, 390 carry a tier-1 stub. Re-
-- running them through the old write path would erase the evidence the
-- restarted log-only week needs.
--
-- WHY A TABLE AND NOT UNIQUE(message_id, action): the two UI upserts
-- (FlaggedEmailQueuePage, SuggestedContactsPage) use onConflict 'message_id'
-- and swallow errors. Changing that key would break them silently, and fixing
-- them means a frontend deploy. With a separate table, processed_message_ids
-- keeps its key and every existing writer, and tier-1 rows are out of reach
-- of all of them. Only gmail-sync changes.
--
-- Same column names as processed_message_ids, so the spec's Q1-Q3 and the
-- precondition query change only the table name.
--
-- DEPLOY ORDER: apply this, deploy gmail-sync, then run
--   SELECT public.sweep_tier1_stubs_from_processed_message_ids();
-- to move any tier-1 rows the old gmail-sync wrote in between. It returns the
-- count moved (expected small), and it is idempotent.
--
-- Stubs already overwritten before this migration cannot be recovered here --
-- the rows are gone. This stops further loss.
-- ============================================================================

CREATE TABLE public.email_tier1_stub (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id          varchar(500) NOT NULL,
  gmail_connection_id uuid REFERENCES public.gmail_connection(id) ON DELETE SET NULL,
  action              varchar(20) NOT NULL,
  sender_email        varchar(255),
  tier1_reason        text,
  processed_at        timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz DEFAULT now(),
  CONSTRAINT email_tier1_stub_message_id_key UNIQUE (message_id),
  CONSTRAINT email_tier1_stub_action_valid CHECK (action IN ('tier1_bulk', 'tier1_personal')),
  -- Carried over from processed_message_ids: a personal verdict records no sender.
  CONSTRAINT email_tier1_stub_personal_carries_no_sender
    CHECK (action <> 'tier1_personal' OR (sender_email IS NULL AND tier1_reason IS NULL))
);

CREATE INDEX idx_email_tier1_stub_action_processed_at
  ON public.email_tier1_stub (action, processed_at DESC);
CREATE INDEX idx_email_tier1_stub_connection
  ON public.email_tier1_stub (gmail_connection_id);

ALTER TABLE public.email_tier1_stub ENABLE ROW LEVEL SECURITY;
-- Same visibility as processed_message_ids_select: rows for your own connection.
CREATE POLICY email_tier1_stub_select ON public.email_tier1_stub
  FOR SELECT
  USING (gmail_connection_id IN (
    SELECT gc.id FROM gmail_connection gc
    JOIN "user" u ON u.id = gc.user_id
    WHERE u.auth_user_id = auth.uid()
  ));

COMMENT ON TABLE public.email_tier1_stub IS
  'Tier-1 (pre-insert, header/sender) verdicts from gmail-sync. Separate from processed_message_ids so a later demote cannot overwrite them. Migration 20260914175119.';

-- Move rows out of processed_message_ids. Used by this migration and once more
-- after the gmail-sync deploy; safe to call again.
CREATE OR REPLACE FUNCTION public.sweep_tier1_stubs_from_processed_message_ids()
RETURNS integer
LANGUAGE plpgsql
AS $$
DECLARE v_moved integer;
BEGIN
  WITH moved AS (
    DELETE FROM public.processed_message_ids
     WHERE action IN ('tier1_bulk', 'tier1_personal')
    RETURNING message_id, gmail_connection_id, action, sender_email, tier1_reason,
              processed_at, created_at
  ), ins AS (
    INSERT INTO public.email_tier1_stub
      (message_id, gmail_connection_id, action, sender_email, tier1_reason, processed_at, created_at)
    SELECT message_id, gmail_connection_id, action, sender_email, tier1_reason, processed_at, created_at
      FROM moved
    ON CONFLICT (message_id) DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_moved FROM moved;
  RETURN v_moved;
END;
$$;

SELECT public.sweep_tier1_stubs_from_processed_message_ids();
