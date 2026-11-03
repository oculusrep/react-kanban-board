-- Package chat (Tasks command center, /tasks/queue).
--
-- One thread per package (deal_package), each message optionally tagged to one of
-- the package's slides; no slide = "General". Replaces per-task chat for package
-- slide tasks; ordinary tasks keep task_comment.
--
-- Same rules as task_comment (20261102084217):
--   * its own tables, NOT site_submit_comment / activity / note_object_link — inserts
--     into those call reset_board_clock(), and site_submit_comment is read by portal users;
--   * no triggers, and no deal_id / site_submit_id columns to key one off;
--   * internal users only; portal users and anon get nothing.
-- Proven by supabase/tests/package_comment_test.sql.
--
-- The slide reference is keyed by slide, not task, so every slide (Mike's, held,
-- not-yet-released) can carry chat. A composite FK keeps the slide inside its package.
--
-- Read state: package_comment_read, per user per package. slide_id NULL = "read the
-- whole thread" (opened from the card); a slide row = read that slide's filtered view.
-- A message from someone else is unread when it is newer than the whole-thread marker
-- and (for a slide-tagged message) newer than that slide's marker.
--
-- Existing task_comment rows on package tasks are copied here with their slide tag
-- (same id, author, content, created_at), and their read markers become slide markers.
-- The originals stay in task_comment untouched; the UI stops reading them for package tasks.
--
-- No BEGIN/COMMIT of its own: apply with psql --single-transaction.

-- Target for the composite FK (id is already unique; this just names the pair).
ALTER TABLE public.deal_package_slide
  ADD CONSTRAINT deal_package_slide_id_package_key UNIQUE (id, package_id);

CREATE TABLE public.package_comment (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  package_id uuid NOT NULL REFERENCES public.deal_package(id) ON DELETE CASCADE,
  slide_id   uuid,                                   -- NULL = General
  author_id  uuid NOT NULL DEFAULT public.task_current_user_id() REFERENCES public."user"(id),
  content    text NOT NULL CHECK (length(btrim(content)) > 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT package_comment_slide_in_package
    FOREIGN KEY (slide_id, package_id) REFERENCES public.deal_package_slide (id, package_id) ON DELETE CASCADE
);
CREATE INDEX package_comment_package_idx ON public.package_comment (package_id, created_at);

CREATE TABLE public.package_comment_read (
  package_id   uuid NOT NULL REFERENCES public.deal_package(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL DEFAULT public.task_current_user_id() REFERENCES public."user"(id),
  slide_id     uuid,                                 -- NULL = whole thread
  last_read_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT package_comment_read_slide_in_package
    FOREIGN KEY (slide_id, package_id) REFERENCES public.deal_package_slide (id, package_id) ON DELETE CASCADE,
  CONSTRAINT package_comment_read_one UNIQUE NULLS NOT DISTINCT (package_id, user_id, slide_id)
);

ALTER TABLE public.package_comment      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.package_comment_read ENABLE ROW LEVEL SECURITY;

-- Any internal user reads every thread; authors post as themselves.
CREATE POLICY package_comment_select ON public.package_comment FOR SELECT TO authenticated
  USING ((SELECT public.is_internal_user()));
CREATE POLICY package_comment_insert ON public.package_comment FOR INSERT TO authenticated
  WITH CHECK ((SELECT public.is_internal_user()) AND author_id = (SELECT public.task_current_user_id()));

-- Read markers: your own rows only.
CREATE POLICY package_comment_read_own ON public.package_comment_read FOR ALL TO authenticated
  USING ((SELECT public.is_internal_user()) AND user_id = (SELECT public.task_current_user_id()))
  WITH CHECK ((SELECT public.is_internal_user()) AND user_id = (SELECT public.task_current_user_id()));

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON public.package_comment, public.package_comment_read FROM anon, authenticated;
GRANT SELECT, INSERT         ON public.package_comment      TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.package_comment_read TO authenticated;

-- Copy existing package-task chat, tagged to the task's slide.
INSERT INTO public.package_comment (id, package_id, slide_id, author_id, content, created_at)
SELECT tc.id, s.package_id, s.id, tc.author_id, tc.content, tc.created_at
  FROM public.task_comment tc
  JOIN public.task t               ON t.id = tc.task_id
  JOIN public.deal_package_slide s ON s.id = t.package_slide_id;

INSERT INTO public.package_comment_read (package_id, user_id, slide_id, last_read_at)
SELECT s.package_id, r.user_id, s.id, max(r.last_read_at)
  FROM public.task_comment_read r
  JOIN public.task t               ON t.id = r.task_id
  JOIN public.deal_package_slide s ON s.id = t.package_slide_id
 GROUP BY s.package_id, r.user_id, s.id;

-- Live updates in the chat panel and the card dots (realtime honours RLS).
ALTER PUBLICATION supabase_realtime ADD TABLE public.package_comment;
