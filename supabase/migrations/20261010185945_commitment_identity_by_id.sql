-- commitment: identity stops being (thread, mailbox, direction).
--
-- WHY. The 2026-10-10 rerun measured it: 300 successful upserts produced 254
-- rows, so 46 extracted obligations (~15%) were merged into a row that already
-- held that thread+mailbox+ball, and the later one overwrote `what`. Direction
-- is not an identity -- a thread can hold two things the owner owes.
--
-- WHAT REPLACES IT. The extractor passes each conversation's existing OPEN rows
-- into the prompt with their ids and the model returns `existing_id` on any
-- commitment that continues one (validated against the real id set; an
-- unrecognised id is treated as new). Matched rows are UPDATEd by id, unmatched
-- ones INSERTed, and open rows the extraction no longer claims are deleted by
-- the replacement rule. There is therefore no column tuple to constrain, and a
-- unique index here would re-create the collapse it is meant to prevent.
DROP INDEX IF EXISTS public.commitment_thread_conn_ball_key;

-- The extraction unit is now a CONVERSATION, not a Gmail thread_id: 23% of the
-- owner's replies are stored under a different thread_id than their parent, so
-- thread_id alone hid the completion on 3 of 12 rated rows. Messages are linked
-- through Message-ID / In-Reply-To / References and merged with thread_id at
-- extraction time. emails.thread_id is NEVER mutated.
-- gmail_thread_id holds the conversation's primary (lowest) thread_id; this
-- column records every thread_id that merged into it.
ALTER TABLE public.commitment ADD COLUMN IF NOT EXISTS conversation_thread_ids text[];

CREATE INDEX IF NOT EXISTS idx_commitment_conn_thread
  ON public.commitment (gmail_connection_id, gmail_thread_id);

COMMENT ON COLUMN public.commitment.conversation_thread_ids IS
  'Every Gmail thread_id merged into this conversation. gmail_thread_id is the lowest of them. emails.thread_id is never rewritten.';
COMMENT ON COLUMN public.commitment.ball IS
  'Direction only. NOT part of identity -- a conversation can hold two obligations in the same direction; rows are matched by id, not by ball.';
