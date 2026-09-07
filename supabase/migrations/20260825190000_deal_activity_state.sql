-- ============================================================================
-- Starbucks Deal Board — Phase 1, step 1: schema + reset triggers
--
-- See docs/STARBUCKS_DEAL_BOARD_SPEC.md §3.2–§3.3, §10.
--
-- Introduces deal_activity_state: a 1:1 satellite on `deal` holding the
-- board-owned "who owes the next move / why is this parked / is it on my
-- agenda" state. Named to generalize to the full pipeline in phase 3, not
-- just the Starbucks board view.
--
-- The clock (ball_in_court_since) is trigger-maintained so the email-triage
-- and voice layers cool a tile automatically — no application code has to
-- remember to call it. Three events reset it: a note logged against a deal,
-- a task created against a deal, a task's due date changed.
-- ============================================================================

-- Standard updated_at helper (already exists in this schema; CREATE OR REPLACE
-- keeps the migration safe on a fresh DB).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;


-- ============================================================================
-- 1. deal_activity_state — board-owned state, 1:1 with deal
-- ============================================================================

CREATE TABLE IF NOT EXISTS deal_activity_state (
  deal_id UUID PRIMARY KEY REFERENCES deal(id) ON DELETE CASCADE,

  -- Ball-in-court (spec §3.2). Distinct from deal.current_handoff_holder
  -- (document handoff) and the AI-generated deal_synopsis.ball_in_court.
  ball_in_court TEXT NOT NULL DEFAULT 'none' CHECK (ball_in_court IN (
    'us', 'them', 'none'
  )),
  ball_in_court_party TEXT,                 -- "Landlord", "Starbucks RE", "GDOT", "Seller"
  ball_in_court_since TIMESTAMPTZ NOT NULL DEFAULT NOW(),  -- the clock (spec §5)

  -- Pre-Submittal blocker (spec §3.2.1). Non-null only while in Pre-Submittal;
  -- cleared by trigger when the deal leaves that stage. 'ready' is a persistent
  -- value, not transient — a deal sitting in 'ready' is exactly the neglect the
  -- board exposes (rendered always-hot client-side, spec §5.3).
  blocked_on TEXT CHECK (blocked_on IS NULL OR blocked_on IN (
    'pricing', 'site_plan', 'under_contract', 'info', 'ready'
  )),

  -- Weekly call agenda (spec §3.2.2). Star toggle on the tile; "Agenda (n)"
  -- filters the board to these.
  on_agenda BOOLEAN NOT NULL DEFAULT FALSE,

  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_deal_activity_state_on_agenda
  ON deal_activity_state(on_agenda) WHERE on_agenda = TRUE;
CREATE INDEX IF NOT EXISTS idx_deal_activity_state_blocked_on
  ON deal_activity_state(blocked_on) WHERE blocked_on IS NOT NULL;

DROP TRIGGER IF EXISTS trg_deal_activity_state_updated_at ON deal_activity_state;
CREATE TRIGGER trg_deal_activity_state_updated_at
  BEFORE UPDATE ON deal_activity_state
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();


-- ============================================================================
-- 2. RLS — mirror the internal-app posture of deal / task (any authenticated
--    OVIS user reads and writes; no per-owner scoping on board state).
-- ============================================================================

ALTER TABLE deal_activity_state ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS deal_activity_state_select ON deal_activity_state;
CREATE POLICY deal_activity_state_select ON deal_activity_state
  FOR SELECT TO authenticated
  USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS deal_activity_state_modify ON deal_activity_state;
CREATE POLICY deal_activity_state_modify ON deal_activity_state
  FOR ALL TO authenticated
  USING (auth.uid() IS NOT NULL)
  WITH CHECK (auth.uid() IS NOT NULL);


-- ============================================================================
-- 3. Reset the clock (spec §3.3)
--
-- SECURITY DEFINER so the write into deal_activity_state succeeds no matter
-- which user (or the triage/voice service role) triggered it, and upsert so a
-- row is created on first touch — no pre-seeding required. Backfill of the
-- initial ball_in_court_since is step 2 (a separate migration).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.reset_deal_activity_clock()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO deal_activity_state (deal_id, ball_in_court_since)
  VALUES (NEW.deal_id, NOW())
  ON CONFLICT (deal_id) DO UPDATE
    SET ball_in_court_since = NOW();
  RETURN NEW;
END;
$$;

-- 3a. A note logged against a deal (notes are polymorphic — the link row
--     carries deal_id, not the note itself).
DROP TRIGGER IF EXISTS trg_reset_clock_on_note_link ON note_object_link;
CREATE TRIGGER trg_reset_clock_on_note_link
  AFTER INSERT ON note_object_link
  FOR EACH ROW
  WHEN (NEW.deal_id IS NOT NULL)
  EXECUTE FUNCTION public.reset_deal_activity_clock();

-- 3b. A next action (task) created against a deal.
DROP TRIGGER IF EXISTS trg_reset_clock_on_task_insert ON task;
CREATE TRIGGER trg_reset_clock_on_task_insert
  AFTER INSERT ON task
  FOR EACH ROW
  WHEN (NEW.deal_id IS NOT NULL)
  EXECUTE FUNCTION public.reset_deal_activity_clock();

-- 3c. An existing next action's due date changed.
DROP TRIGGER IF EXISTS trg_reset_clock_on_task_due ON task;
CREATE TRIGGER trg_reset_clock_on_task_due
  AFTER UPDATE OF due_at ON task
  FOR EACH ROW
  WHEN (NEW.deal_id IS NOT NULL AND NEW.due_at IS DISTINCT FROM OLD.due_at)
  EXECUTE FUNCTION public.reset_deal_activity_clock();


-- ============================================================================
-- 4. Clear blocked_on when a deal leaves Pre-Submittal (spec §3.2.1)
--
-- blocked_on is only meaningful in Pre-Submittal. When stage changes to
-- anything else, null it. Fires on all deals but only touches an existing
-- row that actually has blocked_on set (Starbucks Pre-Submittal deals).
-- ============================================================================

CREATE OR REPLACE FUNCTION public.clear_blocked_on_leaving_presubmittal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM deal_stage ds
    WHERE ds.id = NEW.stage_id AND ds.label = 'Pre-Submittal'
  ) THEN
    UPDATE deal_activity_state
      SET blocked_on = NULL
      WHERE deal_id = NEW.id AND blocked_on IS NOT NULL;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_clear_blocked_on_stage_change ON deal;
CREATE TRIGGER trg_clear_blocked_on_stage_change
  AFTER UPDATE OF stage_id ON deal
  FOR EACH ROW
  WHEN (NEW.stage_id IS DISTINCT FROM OLD.stage_id)
  EXECUTE FUNCTION public.clear_blocked_on_leaving_presubmittal();
