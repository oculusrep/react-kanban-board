-- task ↔ package slide link, Noree's queue order, and the clock-reset exclusion.
-- Spec: docs/PACKAGE_TRACKER_SPEC.md §7. Decisions 2026-10-12 (Mike, items 4 and Phase 3).
--
-- package_slide_id  links the task that carries a slide's OWNER part (Noree's
--                   setup / completion) to its deal_package_slide. One task per
--                   slide. Mike's own slide work is not a task.
-- queue_rank        per-owner manual order for the Tasks queue (drag-and-drop,
--                   Phase 3). quick_note pattern: double precision, drop writes
--                   the midpoint of its neighbours, NULL sorts last. Applies to
--                   package and non-package tasks alike.
--
-- Clock-reset exclusion: trg_reset_clock_on_task_insert / _due fire for any task
-- carrying deal_id or site_submit_id. Package tasks carry both (so they show in
-- the sidebar Tasks tab) and Start Package inserts several — without this the
-- card would cool on package activity, which breaks §1.2 / §1.4 ("package state
-- never changes card heat", §2.29). Both triggers are re-created with
-- `AND NEW.package_slide_id IS NULL`; definitions otherwise copied from the live
-- database (pg_get_triggerdef, 2026-10-12). Status/completion updates never
-- fired the reset and still don't. Proven by supabase/tests/package_task_clock_test.sql.
--
-- No BEGIN/COMMIT: apply with psql --single-transaction.

ALTER TABLE public.task
  ADD COLUMN package_slide_id uuid REFERENCES public.deal_package_slide(id) ON DELETE CASCADE,
  ADD COLUMN queue_rank double precision;

CREATE UNIQUE INDEX task_package_slide_unique
  ON public.task (package_slide_id)
  WHERE package_slide_id IS NOT NULL;

CREATE INDEX task_owner_queue_idx
  ON public.task (owner_id, queue_rank)
  WHERE status IN ('open', 'in_progress');

COMMENT ON COLUMN public.task.package_slide_id IS
  'Package Tracker: the slide whose owner part this task carries. Package tasks never reset the board clock.';
COMMENT ON COLUMN public.task.queue_rank IS
  'Per-owner manual queue order (Tasks queue drag-and-drop). Midpoint inserts; NULL sorts last.';

DROP TRIGGER trg_reset_clock_on_task_insert ON public.task;
CREATE TRIGGER trg_reset_clock_on_task_insert
  AFTER INSERT ON public.task
  FOR EACH ROW
  WHEN ((NEW.deal_id IS NOT NULL OR NEW.site_submit_id IS NOT NULL)
        AND NEW.package_slide_id IS NULL)
  EXECUTE FUNCTION public.reset_deal_activity_clock();

DROP TRIGGER trg_reset_clock_on_task_due ON public.task;
CREATE TRIGGER trg_reset_clock_on_task_due
  AFTER UPDATE OF due_at ON public.task
  FOR EACH ROW
  WHEN ((NEW.deal_id IS NOT NULL OR NEW.site_submit_id IS NOT NULL)
        AND NEW.due_at IS DISTINCT FROM OLD.due_at
        AND NEW.package_slide_id IS NULL)
  EXECUTE FUNCTION public.reset_deal_activity_clock();

-- task grants/RLS unchanged (20261009105306): new columns inherit the table's.
