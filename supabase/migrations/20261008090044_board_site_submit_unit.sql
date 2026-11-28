-- Starbucks Deal Board: the board unit becomes the site_submit.
-- Decisions: docs/STARBUCKS_DEAL_BOARD_DECISIONS.md §2.14 (amended), §2.27, §5 (2026-10-08).
--
-- 1. client.starbucks_board_enabled — board membership flag, separate from
--    starbucks_layer_enabled (which also gates the map layer/portal).
-- 2. deal_activity_state goes dual-key: surrogate id PK; deal_id and
--    site_submit_id each nullable + unique; at least one set. A site_submit
--    with no deal can now carry board state (court, blocker, clock, parked,
--    urgent, agenda). Backfilled from deal.site_submit_id.
-- 3. When a deal gets linked to a site_submit (insert or relink), the
--    site_submit-only state row is attached to the deal — the card keeps its
--    history across "deal created".
-- 4. The reset-clock trigger also fires on touches logged against a
--    site_submit (task / activity / note_object_link.site_submit_id). If that
--    site has a deal, the DEAL's clock resets (same site). The email-blind +
--    SF guard on activity (§2.4) is unchanged.
-- 5. Blocker auto-clear also fires on site_submit stage change, so a
--    site_submit-only card leaving Pre-Submittal drops its blocker the same
--    way a deal does.
--
-- No BEGIN/COMMIT: apply with psql --single-transaction.

-- ---------------------------------------------------------------------------
-- 1. Board membership flag
-- ---------------------------------------------------------------------------
ALTER TABLE public.client
  ADD COLUMN IF NOT EXISTS starbucks_board_enabled boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.client.starbucks_board_enabled IS
  'Client''s site_submits/deals appear on the Starbucks Deal Board (/starbucks-board). '
  'Separate from starbucks_layer_enabled, which gates the map layer/portal.';

UPDATE public.client SET starbucks_board_enabled = true
 WHERE id IN ('39933b5b-3e8c-438d-be2f-e48cd9228c00',   -- Starbucks
              'e58e358e-0d3e-47cb-a806-2464f0b5795c');  -- Starbucks - JW (Coastal GA)

-- ---------------------------------------------------------------------------
-- 2. deal_activity_state: dual key
-- ---------------------------------------------------------------------------
ALTER TABLE public.deal_activity_state
  ADD COLUMN id uuid NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN site_submit_id uuid REFERENCES public.site_submit(id) ON DELETE CASCADE;

ALTER TABLE public.deal_activity_state DROP CONSTRAINT deal_activity_state_pkey;
ALTER TABLE public.deal_activity_state ADD CONSTRAINT deal_activity_state_pkey PRIMARY KEY (id);

ALTER TABLE public.deal_activity_state ALTER COLUMN deal_id DROP NOT NULL;
-- Plain (non-partial) unique constraints so ON CONFLICT (deal_id) /
-- ON CONFLICT (site_submit_id) keep working, from SQL and from PostgREST upserts.
ALTER TABLE public.deal_activity_state
  ADD CONSTRAINT deal_activity_state_deal_id_key UNIQUE (deal_id),
  ADD CONSTRAINT deal_activity_state_site_submit_id_key UNIQUE (site_submit_id),
  ADD CONSTRAINT deal_activity_state_has_subject CHECK (deal_id IS NOT NULL OR site_submit_id IS NOT NULL);

-- Backfill. One deal per site_submit (verified 2026-10-08: no duplicates), so
-- the unique constraint can't trip.
UPDATE public.deal_activity_state das
   SET site_submit_id = d.site_submit_id
  FROM public.deal d
 WHERE d.id = das.deal_id
   AND d.site_submit_id IS NOT NULL;

COMMENT ON TABLE public.deal_activity_state IS
  'Board-owned activity state (court, clock, blocker, parked, urgent, agenda). '
  'One row per board card: keyed by deal_id and/or site_submit_id (at least one). '
  'A site_submit-only row is attached to the deal when one is linked.';

-- ---------------------------------------------------------------------------
-- 3. Attach a site_submit-only row to its deal when the deal is linked
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.attach_activity_state_to_deal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_site public.deal_activity_state;
  v_deal public.deal_activity_state;
BEGIN
  SELECT * INTO v_site FROM deal_activity_state WHERE site_submit_id = NEW.site_submit_id;
  SELECT * INTO v_deal FROM deal_activity_state WHERE deal_id = NEW.id;

  IF v_site.id IS NULL THEN
    -- No row for the site yet: just stamp the deal's own row (if any).
    UPDATE deal_activity_state SET site_submit_id = NEW.site_submit_id WHERE id = v_deal.id;
    RETURN NEW;
  END IF;

  IF v_site.deal_id IS NOT NULL THEN
    -- Already this deal's row, or held by another deal (data drift — leave it;
    -- a trigger must never block the deal write).
    RETURN NEW;
  END IF;

  IF v_deal.id IS NULL THEN
    UPDATE deal_activity_state SET deal_id = NEW.id WHERE id = v_site.id;
    RETURN NEW;
  END IF;

  -- Both exist (only possible when an existing deal is relinked to a site that
  -- already had its own card). The site row is the card that was on the board,
  -- so its court/blocker/park/urgent/agenda win; the clock is the most recent
  -- real touch of the two.
  DELETE FROM deal_activity_state WHERE id = v_deal.id;
  UPDATE deal_activity_state
     SET deal_id = NEW.id,
         ball_in_court_since = CASE
           WHEN v_site.seeded_fallback AND NOT v_deal.seeded_fallback THEN v_deal.ball_in_court_since
           WHEN v_deal.seeded_fallback THEN v_site.ball_in_court_since
           ELSE GREATEST(v_site.ball_in_court_since, v_deal.ball_in_court_since)
         END,
         seeded_fallback = v_site.seeded_fallback AND v_deal.seeded_fallback
   WHERE id = v_site.id;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.attach_activity_state_to_deal() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_attach_activity_state_to_deal
  AFTER INSERT OR UPDATE OF site_submit_id ON public.deal
  FOR EACH ROW
  WHEN (NEW.site_submit_id IS NOT NULL)
  EXECUTE FUNCTION public.attach_activity_state_to_deal();

-- ---------------------------------------------------------------------------
-- 4. Reset clock: resolve the card from deal_id or site_submit_id
-- ---------------------------------------------------------------------------
-- All three sources (activity, task, note_object_link) carry both deal_id and
-- site_submit_id. Precedence: the touch's deal_id; else the deal linked to the
-- touched site_submit (B: same site → the deal's clock resets); else the
-- site_submit-only card. Never raises on drift — blocking a user's activity
-- insert would be worse than a missed reset.
CREATE OR REPLACE FUNCTION public.reset_deal_activity_clock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_deal uuid := NEW.deal_id;
  v_ss   uuid := NEW.site_submit_id;
BEGIN
  IF v_deal IS NULL AND v_ss IS NOT NULL THEN
    SELECT id INTO v_deal FROM deal WHERE site_submit_id = v_ss LIMIT 1;
  END IF;

  IF v_deal IS NOT NULL THEN
    UPDATE deal_activity_state
       SET ball_in_court_since = NOW(), seeded_fallback = FALSE
     WHERE deal_id = v_deal;
    IF FOUND THEN RETURN NEW; END IF;

    -- The card's site is the deal's own site_submit, not the touch's.
    SELECT site_submit_id INTO v_ss FROM deal WHERE id = v_deal;

    IF v_ss IS NOT NULL THEN
      -- A site_submit-only card for this deal's site: adopt it.
      UPDATE deal_activity_state
         SET deal_id = v_deal, ball_in_court_since = NOW(), seeded_fallback = FALSE
       WHERE site_submit_id = v_ss AND deal_id IS NULL;
      IF FOUND THEN RETURN NEW; END IF;
      -- Site held by another deal's row (drift): don't claim it.
      IF EXISTS (SELECT 1 FROM deal_activity_state WHERE site_submit_id = v_ss) THEN
        v_ss := NULL;
      END IF;
    END IF;

    INSERT INTO deal_activity_state (deal_id, site_submit_id, ball_in_court_since, seeded_fallback)
    VALUES (v_deal, v_ss, NOW(), FALSE)
    ON CONFLICT (deal_id) DO UPDATE
      SET ball_in_court_since = NOW(), seeded_fallback = FALSE;
  ELSE
    INSERT INTO deal_activity_state (site_submit_id, ball_in_court_since, seeded_fallback)
    VALUES (v_ss, NOW(), FALSE)
    ON CONFLICT (site_submit_id) DO UPDATE
      SET ball_in_court_since = NOW(), seeded_fallback = FALSE;
  END IF;
  RETURN NEW;
END;
$function$;

-- Widen the WHEN clauses to site_submit-only touches. Activity keeps its
-- email-blind + SF guard (§2.4).
DROP TRIGGER trg_reset_clock_on_activity_insert ON public.activity;
CREATE TRIGGER trg_reset_clock_on_activity_insert
  AFTER INSERT ON public.activity
  FOR EACH ROW
  WHEN ((NEW.deal_id IS NOT NULL OR NEW.site_submit_id IS NOT NULL)
        AND NEW.email_id IS NULL AND NEW.sf_id IS NULL)
  EXECUTE FUNCTION public.reset_deal_activity_clock();

DROP TRIGGER trg_reset_clock_on_note_link ON public.note_object_link;
CREATE TRIGGER trg_reset_clock_on_note_link
  AFTER INSERT ON public.note_object_link
  FOR EACH ROW
  WHEN (NEW.deal_id IS NOT NULL OR NEW.site_submit_id IS NOT NULL)
  EXECUTE FUNCTION public.reset_deal_activity_clock();

DROP TRIGGER trg_reset_clock_on_task_insert ON public.task;
CREATE TRIGGER trg_reset_clock_on_task_insert
  AFTER INSERT ON public.task
  FOR EACH ROW
  WHEN (NEW.deal_id IS NOT NULL OR NEW.site_submit_id IS NOT NULL)
  EXECUTE FUNCTION public.reset_deal_activity_clock();

DROP TRIGGER trg_reset_clock_on_task_due ON public.task;
CREATE TRIGGER trg_reset_clock_on_task_due
  AFTER UPDATE OF due_at ON public.task
  FOR EACH ROW
  WHEN ((NEW.deal_id IS NOT NULL OR NEW.site_submit_id IS NOT NULL)
        AND NEW.due_at IS DISTINCT FROM OLD.due_at)
  EXECUTE FUNCTION public.reset_deal_activity_clock();

-- ---------------------------------------------------------------------------
-- 5. Blocker auto-clear on site_submit stage change
-- ---------------------------------------------------------------------------
-- Mirrors clear_blocked_on_leaving_presubmittal (deal side): clears only when
-- the new submit stage maps to a non-Pre-Submittal deal stage. Unmapped stages
-- (Pass, Monitor, ...) don't move the deal and don't clear the blocker either,
-- so a reverted Pass keeps its blocker exactly as it does today.
CREATE OR REPLACE FUNCTION public.clear_blocked_on_site_submit_leaving_presubmittal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF EXISTS (
    SELECT 1 FROM deal_submit_stage_map m
      JOIN deal_stage ds ON ds.id = m.deal_stage_id
     WHERE m.submit_stage_id = NEW.submit_stage_id
       AND ds.label <> 'Pre-Submittal'
  ) THEN
    UPDATE deal_activity_state
       SET blocked_on = NULL, needs_pricing = FALSE, needs_site_plan = FALSE
     WHERE site_submit_id = NEW.id
       AND (blocked_on IS NOT NULL OR needs_pricing OR needs_site_plan);
  END IF;
  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.clear_blocked_on_site_submit_leaving_presubmittal() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_clear_blocked_on_site_submit_stage_change
  AFTER UPDATE OF submit_stage_id ON public.site_submit
  FOR EACH ROW
  WHEN (NEW.submit_stage_id IS DISTINCT FROM OLD.submit_stage_id)
  EXECUTE FUNCTION public.clear_blocked_on_site_submit_leaving_presubmittal();

-- ---------------------------------------------------------------------------
-- Grants: deal_activity_state still had the inherited anon/authenticated ALL
-- (RLS was the only gate). State what the board uses: read + upsert, no delete.
-- ---------------------------------------------------------------------------
REVOKE ALL ON public.deal_activity_state FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.deal_activity_state TO authenticated;

-- Trigger-only helpers that were still EXECUTE-able by anon/authenticated.
REVOKE ALL ON FUNCTION public.reset_deal_activity_clock() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.clear_blocked_on_leaving_presubmittal() FROM PUBLIC, anon, authenticated;
