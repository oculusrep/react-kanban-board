-- court_since: when the CURRENT ball-in-court started, separate from the heat
-- clock (ball_in_court_since).
--
-- Why: ball_in_court_since does two jobs — the board's heat clock and "in their
-- court since". Parking sets it to the review date (the card comes back fresh),
-- and every touch (note, task, chat, activity) resets it to now. Both are right
-- for heat and wrong for "how long has this been in their court". The Pipeline
-- Report's Days in Court reads court_since, so a parked LOI still shows
-- "Them · 89d since 7/13" while the board's clock stays paused.
--
-- Maintained by a BEFORE trigger so every writer stays consistent — board
-- classify controls, the report, the touch/reset triggers, park/un-park:
--   * court cleared (NULL)                         → court_since NULL
--   * court changed, court_since not set explicitly → the save's clock date
--     (ball_in_court_since — so a back-dated classify back-dates the court too)
--   * court unchanged                               → kept (touches, park,
--     un-park and party edits never move it)
--   * an explicit court_since in the write          → kept as written
-- Never later than now (a parked row's clock can sit in the future).
--
-- No BEGIN/COMMIT: apply with psql --single-transaction.

ALTER TABLE public.deal_activity_state ADD COLUMN court_since timestamptz;

-- Backfill: the current clock is the best record of when the court started.
-- Clamped to now — a parked row's clock is its future review date.
UPDATE public.deal_activity_state
   SET court_since = LEAST(ball_in_court_since, now())
 WHERE ball_in_court IS NOT NULL AND ball_in_court_since IS NOT NULL;

CREATE FUNCTION public.set_court_since()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.ball_in_court IS NULL THEN
    NEW.court_since := NULL;
  ELSIF TG_OP = 'INSERT' THEN
    NEW.court_since := COALESCE(NEW.court_since, NEW.ball_in_court_since, now());
  ELSIF NEW.ball_in_court IS DISTINCT FROM OLD.ball_in_court
        AND NEW.court_since IS NOT DISTINCT FROM OLD.court_since THEN
    NEW.court_since := COALESCE(NEW.ball_in_court_since, now());
  ELSIF NEW.court_since IS NULL THEN
    -- court set but never stamped (pre-backfill edge) — start it now
    NEW.court_since := COALESCE(OLD.court_since, NEW.ball_in_court_since, now());
  END IF;
  IF NEW.court_since > now() THEN
    NEW.court_since := now();
  END IF;
  RETURN NEW;
END;
$$;

-- Trigger-only: nobody calls it directly.
REVOKE ALL ON FUNCTION public.set_court_since() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_set_court_since
  BEFORE INSERT OR UPDATE ON public.deal_activity_state
  FOR EACH ROW EXECUTE FUNCTION public.set_court_since();
