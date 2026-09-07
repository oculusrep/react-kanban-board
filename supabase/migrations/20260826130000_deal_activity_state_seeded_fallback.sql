-- ============================================================================
-- Starbucks Deal Board — seeded_fallback marker ("no history" tile state)
--
-- See docs/STARBUCKS_DEAL_BOARD_SPEC.md §3.3, §6.4, §9.
--
-- The step-2 backfill (20260826120000) seeded ball_in_court_since = now() for
-- the 27 Starbucks deals with NO activity and NO notes. Those clocks are
-- placeholders, not real touches — rendering them as cool would lie (cool =
-- "recently worked, not your problem"; these have zero history). This flag
-- marks such rows so the board renders a distinct neutral "no history" tile
-- and excludes them from warm/hot heat until a real touch lands.
--
-- The flag is trigger-cleared: the first real reset event (activity/note/task,
-- via reset_deal_activity_clock) sets seeded_fallback = false, because that
-- event IS the first real touch.
-- ============================================================================

ALTER TABLE deal_activity_state
  ADD COLUMN IF NOT EXISTS seeded_fallback BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN deal_activity_state.seeded_fallback IS
  'TRUE when ball_in_court_since is a now() placeholder from backfill (deal had no activity/notes), not a real touch. Cleared by reset_deal_activity_clock on the first real event. UI renders these as a neutral "no history" tile, excluded from heat.';

-- Flag existing rows whose clock was a fallback: no activity AND no note link.
UPDATE deal_activity_state das
SET seeded_fallback = TRUE
WHERE NOT EXISTS (SELECT 1 FROM activity a WHERE a.deal_id = das.deal_id)
  AND NOT EXISTS (SELECT 1 FROM note_object_link n WHERE n.deal_id = das.deal_id);

-- Clear the flag on any real touch (and keep the clock reset). Same trigger
-- function as before — just also unset seeded_fallback on conflict.
CREATE OR REPLACE FUNCTION public.reset_deal_activity_clock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO deal_activity_state (deal_id, ball_in_court_since, seeded_fallback)
  VALUES (NEW.deal_id, NOW(), FALSE)
  ON CONFLICT (deal_id) DO UPDATE
    SET ball_in_court_since = NOW(),
        seeded_fallback = FALSE;
  RETURN NEW;
END;
$$;
