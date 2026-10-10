-- commitment: per-mailbox identity + a model-written reason kept separate from
-- the composed one.
--
-- WHY THE KEY CHANGES. Extraction now runs PER gmail_connection, because the
-- first run put both mailboxes in the owner set: a message from asantos@ was
-- marked (OWNER) in mike@'s thread, "Mike" read as a third party in the body,
-- and `ball` inverted. Per-connection extraction fixes that, but 171 threads in
-- the 14-day window are visible to BOTH connections, so (gmail_thread_id, ball)
-- would make the two mailboxes overwrite each other's rows. The connection is
-- part of the identity.
--
-- NULLS NOT DISTINCT (Postgres 15+; this database is 17.6) matters: the FK is
-- ON DELETE SET NULL, so removing a connection nulls the column, and under the
-- default NULLS DISTINCT those rows would silently stop being deduplicated.
DROP INDEX IF EXISTS public.commitment_thread_ball_key;
CREATE UNIQUE INDEX IF NOT EXISTS commitment_thread_conn_ball_key
  ON public.commitment (gmail_thread_id, gmail_connection_id, ball) NULLS NOT DISTINCT;

-- The model's own sentence, with NO time language in it. speakable_reason is
-- composed in code = reason_core + an age computed from the thread's last
-- message + any promised_date, because the model is not given a reliable
-- "now" and its relative phrasing was wrong on 21 of 209 rows.
ALTER TABLE public.commitment ADD COLUMN IF NOT EXISTS reason_core text;

COMMENT ON COLUMN public.commitment.reason_core IS
  'Model-written reason, time-free by contract. speakable_reason = reason_core + code-computed age + promised_date. A time word here is a prompt regression.';
COMMENT ON COLUMN public.commitment.gmail_connection_id IS
  'The OWNER mailbox this commitment was extracted for -- extraction runs per connection, so this IS owner_connection_id; no separate column.';
