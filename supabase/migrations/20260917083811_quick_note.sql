-- Personal quick-capture list (floating "Quick Note" panel, available on every page).
-- Rows are private to their owner. Expired rows (past expires_at) are hidden
-- by the UI but never deleted.

CREATE TABLE IF NOT EXISTS public.quick_note (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
  text        text NOT NULL CHECK (length(btrim(text)) > 0),
  deal_id     uuid REFERENCES public.deal(id) ON DELETE SET NULL,
  -- Ascending = display order. Default puts new rows above everything
  -- existing; drag-reorder writes midpoints between neighbours.
  sort_order  double precision NOT NULL DEFAULT -extract(epoch FROM clock_timestamp()),
  done        boolean NOT NULL DEFAULT false,
  created_at  timestamptz NOT NULL DEFAULT now(),
  expires_at  timestamptz NOT NULL
);

-- expires_at is always created_at + 7 days. (A generated column isn't allowed:
-- timestamptz + interval is only STABLE.)
CREATE OR REPLACE FUNCTION public.quick_note_set_expires_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.expires_at := NEW.created_at + interval '7 days';
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS quick_note_set_expires_at ON public.quick_note;
CREATE TRIGGER quick_note_set_expires_at
  BEFORE INSERT OR UPDATE OF created_at, expires_at ON public.quick_note
  FOR EACH ROW EXECUTE FUNCTION public.quick_note_set_expires_at();

CREATE INDEX IF NOT EXISTS quick_note_user_expires_idx
  ON public.quick_note (user_id, expires_at);

ALTER TABLE public.quick_note ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS quick_note_select_own ON public.quick_note;
CREATE POLICY quick_note_select_own ON public.quick_note
  FOR SELECT TO authenticated USING (user_id = auth.uid());

DROP POLICY IF EXISTS quick_note_insert_own ON public.quick_note;
CREATE POLICY quick_note_insert_own ON public.quick_note
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS quick_note_update_own ON public.quick_note;
CREATE POLICY quick_note_update_own ON public.quick_note
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS quick_note_delete_own ON public.quick_note;
CREATE POLICY quick_note_delete_own ON public.quick_note
  FOR DELETE TO authenticated USING (user_id = auth.uid());

GRANT SELECT, INSERT, UPDATE, DELETE ON public.quick_note TO authenticated;
