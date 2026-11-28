-- Starbucks Deal Board: one history with the deal / site-submit chat.
-- Plan: docs/STARBUCKS_BOARD_UNIFIED_HISTORY_PLAN.md. Decisions log §5 (2026-10-09).
--
-- A. site_submit_comment.origin marks rows the board wrote:
--      'board_note'    — Log a note / Pass / Mark lost, written from the board
--      'board_history' — court / blocker / park change, written by trigger (C)
--    CHECK: a board row is always visibility = 'internal'. Portal RLS already
--    only returns visibility = 'client' rows, and the client-digest trigger
--    (capture_comment_activity) skips internal rows; the CHECK makes sure no
--    toggle, edit or SQL can ever turn a board row client-visible.
-- B. deal_activity_state.parked_reason — the park reason travels with the park
--    date in one upsert, so the history entry carries it (no separate note).
-- C. log_board_state_change(): AFTER INSERT OR UPDATE on deal_activity_state,
--    one internal 'board_history' chat row per change to court / party /
--    blocker / landlord detail / park. Author = auth.uid(); no row when there
--    is no signed-in user (author_id is NOT NULL). Urgent / agenda are NOT logged.
-- D. Clock. Reset logic moves into reset_board_clock(deal, site) unchanged;
--    reset_deal_activity_clock() (activity / task / note_object_link triggers)
--    now calls it. New trigger on site_submit_comment resets the clock for a
--    chat message written by an internal user as themselves — any message,
--    wherever it's typed (sidebar chat or board). Never for 'board_history'
--    rows (the save that produced them already set the clock — a reset would
--    overwrite a back-dated clock or a park review date), never for portal
--    users' messages.
--
-- No new relations → no grants block. New functions: EXECUTE revoked.
-- No BEGIN/COMMIT: apply with psql --single-transaction.

-- ---------------------------------------------------------------------------
-- A. origin on site_submit_comment
-- ---------------------------------------------------------------------------
ALTER TABLE public.site_submit_comment
  ADD COLUMN origin text,
  ADD CONSTRAINT site_submit_comment_origin_check
    CHECK (origin IS NULL OR origin IN ('board_note', 'board_history')),
  ADD CONSTRAINT site_submit_comment_board_rows_internal
    CHECK (origin IS NULL OR visibility = 'internal');

COMMENT ON COLUMN public.site_submit_comment.origin IS
  'NULL = typed in the chat. board_note / board_history = written by the Starbucks '
  'Deal Board; always internal (CHECK site_submit_comment_board_rows_internal).';

-- ---------------------------------------------------------------------------
-- B. park reason
-- ---------------------------------------------------------------------------
ALTER TABLE public.deal_activity_state ADD COLUMN parked_reason text;

-- ---------------------------------------------------------------------------
-- D1. Reset logic as a plain function (body unchanged from 20261008090044)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_board_clock(p_deal uuid, p_ss uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deal uuid := p_deal;
  v_ss   uuid := p_ss;
BEGIN
  IF v_deal IS NULL AND v_ss IS NOT NULL THEN
    SELECT id INTO v_deal FROM deal WHERE site_submit_id = v_ss LIMIT 1;
  END IF;

  IF v_deal IS NOT NULL THEN
    UPDATE deal_activity_state
       SET ball_in_court_since = NOW(), seeded_fallback = FALSE
     WHERE deal_id = v_deal;
    IF FOUND THEN RETURN; END IF;

    -- The card's site is the deal's own site_submit, not the touch's.
    SELECT site_submit_id INTO v_ss FROM deal WHERE id = v_deal;

    IF v_ss IS NOT NULL THEN
      -- A site_submit-only card for this deal's site: adopt it.
      UPDATE deal_activity_state
         SET deal_id = v_deal, ball_in_court_since = NOW(), seeded_fallback = FALSE
       WHERE site_submit_id = v_ss AND deal_id IS NULL;
      IF FOUND THEN RETURN; END IF;
      -- Site held by another deal's row (drift): don't claim it.
      IF EXISTS (SELECT 1 FROM deal_activity_state WHERE site_submit_id = v_ss) THEN
        v_ss := NULL;
      END IF;
    END IF;

    INSERT INTO deal_activity_state (deal_id, site_submit_id, ball_in_court_since, seeded_fallback)
    VALUES (v_deal, v_ss, NOW(), FALSE)
    ON CONFLICT (deal_id) DO UPDATE
      SET ball_in_court_since = NOW(), seeded_fallback = FALSE;
  ELSIF v_ss IS NOT NULL THEN
    INSERT INTO deal_activity_state (site_submit_id, ball_in_court_since, seeded_fallback)
    VALUES (v_ss, NOW(), FALSE)
    ON CONFLICT (site_submit_id) DO UPDATE
      SET ball_in_court_since = NOW(), seeded_fallback = FALSE;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_board_clock(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Existing touch triggers (activity / task / note_object_link) — same behavior.
CREATE OR REPLACE FUNCTION public.reset_deal_activity_clock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM reset_board_clock(NEW.deal_id, NEW.site_submit_id);
  RETURN NEW;
END;
$function$;

-- ---------------------------------------------------------------------------
-- D2. Chat messages from internal users reset the clock
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.reset_clock_on_internal_comment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  -- Internal user, writing as themselves. Portal users' messages and
  -- service-role / SQL inserts (auth.uid() NULL) don't touch the clock.
  IF auth.uid() IS NOT NULL AND NEW.author_id = auth.uid() AND is_internal_user() THEN
    PERFORM reset_board_clock(NEW.deal_id, NEW.site_submit_id);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.reset_clock_on_internal_comment() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_reset_clock_on_comment
  AFTER INSERT ON public.site_submit_comment
  FOR EACH ROW
  WHEN (NEW.origin IS DISTINCT FROM 'board_history'
        AND (NEW.site_submit_id IS NOT NULL OR NEW.deal_id IS NOT NULL))
  EXECUTE FUNCTION public.reset_clock_on_internal_comment();

-- ---------------------------------------------------------------------------
-- C. Court / blocker / park history into the chat
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_board_state_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o_court   text    := CASE WHEN TG_OP = 'UPDATE' THEN OLD.ball_in_court END;
  o_party   text    := CASE WHEN TG_OP = 'UPDATE' THEN OLD.ball_in_court_party END;
  o_blocked text    := CASE WHEN TG_OP = 'UPDATE' THEN OLD.blocked_on END;
  o_pricing boolean := CASE WHEN TG_OP = 'UPDATE' THEN OLD.needs_pricing ELSE FALSE END;
  o_plan    boolean := CASE WHEN TG_OP = 'UPDATE' THEN OLD.needs_site_plan ELSE FALSE END;
  o_parked  date    := CASE WHEN TG_OP = 'UPDATE' THEN OLD.parked_until END;
  parts     text[]  := ARRAY[]::text[];
  v_court   text;
  v_block   text;
  v_ss      uuid;
  v_deal    uuid;
BEGIN
  IF auth.uid() IS NULL THEN RETURN NEW; END IF; -- author_id is NOT NULL

  -- Court / party
  IF NEW.ball_in_court IS DISTINCT FROM o_court OR NEW.ball_in_court_party IS DISTINCT FROM o_party THEN
    v_court := CASE NEW.ball_in_court
      WHEN 'us'   THEN 'Ball → Us'
      WHEN 'them' THEN 'Ball → Them'
      WHEN 'none' THEN 'Ball → No one'
      ELSE 'Court cleared (unclassified)'
    END;
    IF NEW.ball_in_court IS NOT NULL AND NULLIF(btrim(NEW.ball_in_court_party), '') IS NOT NULL THEN
      v_court := v_court || ' (' || btrim(NEW.ball_in_court_party) || ')';
    END IF;
    parts := parts || v_court;
  END IF;

  -- Blocker (+ landlord detail)
  IF NEW.blocked_on IS DISTINCT FROM o_blocked
     OR NEW.needs_pricing IS DISTINCT FROM o_pricing
     OR NEW.needs_site_plan IS DISTINCT FROM o_plan THEN
    v_block := CASE NEW.blocked_on
      WHEN 'awaiting_ll' THEN 'waiting on landlord: ' || CASE
          WHEN NEW.needs_pricing AND NEW.needs_site_plan THEN 'pricing + site plan'
          WHEN NEW.needs_pricing THEN 'pricing'
          WHEN NEW.needs_site_plan THEN 'site plan'
          ELSE 'unspecified' END
      WHEN 'site_control' THEN 'waiting on site control'
      ELSE CASE WHEN o_blocked IS NOT NULL THEN 'blocker cleared' END
    END;
    IF v_block IS NOT NULL THEN parts := parts || v_block; END IF;
  END IF;

  -- Park / un-park
  IF NEW.parked_until IS DISTINCT FROM o_parked THEN
    IF NEW.parked_until IS NOT NULL THEN
      parts := parts || ('Parked until ' || to_char(NEW.parked_until, 'Mon FMDD, YYYY')
               || COALESCE(': ' || NULLIF(btrim(NEW.parked_reason), ''), ''));
    ELSIF o_parked IS NOT NULL THEN
      parts := parts || 'Un-parked, back on the board'::text;
    END IF;
  END IF;

  IF cardinality(parts) = 0 THEN RETURN NEW; END IF;

  -- The card's thread: its site_submit when it has one, else the deal.
  v_ss := NEW.site_submit_id;
  IF v_ss IS NULL AND NEW.deal_id IS NOT NULL THEN
    SELECT site_submit_id INTO v_ss FROM deal WHERE id = NEW.deal_id;
  END IF;
  IF v_ss IS NULL THEN v_deal := NEW.deal_id; END IF;

  INSERT INTO site_submit_comment (site_submit_id, deal_id, author_id, content, visibility, origin)
  VALUES (v_ss, v_deal, auth.uid(), array_to_string(parts, ' — '), 'internal', 'board_history');
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.log_board_state_change() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_log_board_state_change
  AFTER INSERT OR UPDATE ON public.deal_activity_state
  FOR EACH ROW
  EXECUTE FUNCTION public.log_board_state_change();
