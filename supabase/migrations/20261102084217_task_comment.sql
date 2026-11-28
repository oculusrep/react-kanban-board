-- Task chat (Tasks command center, /tasks/queue).
--
-- A chat thread per task, for Mike and Noree. Deliberately its own table, NOT
-- site_submit_comment / activity / note_object_link: inserts into those three
-- call reset_board_clock() (trg_reset_clock_on_comment, trg_reset_clock_on_activity_insert,
-- trg_reset_clock_on_note_link), and site_submit_comment is read by portal users.
-- Task chat must never move a board clock or reach a client, so:
--   * no triggers on either table, and no deal_id / site_submit_id columns to key one off;
--   * internal users only (same gate as task SELECT); portal users and anon get nothing.
-- Proven by supabase/tests/task_comment_clock_test.sql.
--
-- task_comment_read holds each person's last-read time per task; "unread" is a
-- message from someone else created after it.
--
-- No BEGIN/COMMIT of its own: apply with psql --single-transaction.

CREATE TABLE public.task_comment (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id    uuid NOT NULL REFERENCES public.task(id) ON DELETE CASCADE,
  author_id  uuid NOT NULL DEFAULT public.task_current_user_id() REFERENCES public."user"(id),
  content    text NOT NULL CHECK (length(btrim(content)) > 0),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX task_comment_task_idx ON public.task_comment (task_id, created_at);

CREATE TABLE public.task_comment_read (
  task_id      uuid NOT NULL REFERENCES public.task(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL DEFAULT public.task_current_user_id() REFERENCES public."user"(id),
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, user_id)
);

ALTER TABLE public.task_comment      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.task_comment_read ENABLE ROW LEVEL SECURITY;

-- Any internal user reads every thread (decision 2026-11-02); authors post as themselves.
CREATE POLICY task_comment_select ON public.task_comment FOR SELECT TO authenticated
  USING ((SELECT public.is_internal_user()));
CREATE POLICY task_comment_insert ON public.task_comment FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_internal_user()) AND author_id = (SELECT public.task_current_user_id()));

-- Read markers: your own rows only.
CREATE POLICY task_comment_read_own ON public.task_comment_read FOR ALL TO authenticated
  USING ((SELECT public.is_internal_user()) AND user_id = (SELECT public.task_current_user_id()))
  WITH CHECK ((SELECT public.is_internal_user()) AND user_id = (SELECT public.task_current_user_id()));

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON public.task_comment, public.task_comment_read FROM anon, authenticated;
GRANT SELECT, INSERT         ON public.task_comment      TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.task_comment_read TO authenticated;

-- Live updates in the chat panel (realtime honours RLS).
ALTER PUBLICATION supabase_realtime ADD TABLE public.task_comment;
