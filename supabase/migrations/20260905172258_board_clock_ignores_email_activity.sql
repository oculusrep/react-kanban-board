-- ============================================================================
-- Email triage dependency (e): the board clock goes email-blind.
--
-- Problem: email-triage inserts one `activity` row per deal tag. Those rows
-- fire trg_reset_clock_on_activity_insert -> reset_deal_activity_clock(),
-- which stamps deal_activity_state.ball_in_court_since = NOW(). 186 such
-- inserts in the 7 days before this migration; 18 of 63 tiles were showing a
-- fresh clock whose last cause was an INBOUND email nobody had replied to.
-- Worst case read 2 days when the true figure was 194.
--
-- Fix: exclude email-sourced activity from the reset. Manual notes, tasks,
-- calls and UI actions keep resetting the clock exactly as before.
--
-- Why not direction-aware: ball-in-court needs judgment we don't have yet.
-- 10 of 28 bad clocks came from OUTBOUND mail (including intra-firm mike<->
-- arty), and 6 came from non-correspondence entirely (one Google Chat
-- notification cooled four Starbucks tiles). Direction is not the signal.
-- The board goes email-blind until the commitment model can classify.
--
-- Salesforce guard: closes the open item deferred in the header of
-- 20260826120000_deal_activity_state_backfill.sql ("If Salesforce->OVIS sync
-- inserts activity rows automatically, that would cool a tile spuriously;
-- guard with AND NEW.sf_id IS NULL if that turns out to matter. Revisit for
-- v2."). The 5,532 Salesforce-imported "Email" rows carry email_id NULL, so
-- the email_id predicate alone would not stop them if that sync resumes.
--
-- Discriminators verified against production before writing, not assumed:
--   activity rows with deal_id:
--     email_id NOT NULL -> 2,827 rows, ALL activity_type='Email', ALL sf_id NULL
--     sf_id   NOT NULL  -> 11,277 rows, last insert 2025-10-02 (sync dormant)
--     both NULL         -> 64 hand-logged Task/Call rows, last 2026-07-15,
--                          which MUST keep resetting the clock -- they still do
--     sf_id AND email_id both set -> 0 rows
--
-- Existing rows: NOT touched. 28 of 63 tiles currently hold a value that was
-- set by email. Decision (Mike, 2026-09-05) is to leave them frozen:
--   * Recomputing from the last non-email cause fixes only 5 -- just 23 of the
--     28 have any non-email cause at all -- producing a board where some tiles
--     are honest and some are not, with no way to tell which.
--   * NULLing them requires dropping NOT NULL on a live prod column with
--     unverified frontend behaviour, and would blank 44 of 63 tiles (28 nulled
--     + 16 seeded_fallback) to buy honesty for the few weeks until the
--     classifier ships.
--   * Frozen decays in the right direction: once the trigger stops firing the
--     fake timestamps age and converge toward looking neglected, which is
--     where the truth is.
--
-- NOTE (schema drift, per CLAUDE.md): deal_activity_state and this trigger are
-- live in production but their 10 creating migrations exist only on
-- feature/starbucks-deal-board, not on main. This migration edits an object
-- main does not know about. The definition below was pulled from the live
-- database via pg_get_triggerdef, not rebuilt from a migration file.
--
-- ROLLBACK:
--   DROP TRIGGER IF EXISTS trg_reset_clock_on_activity_insert ON activity;
--   CREATE TRIGGER trg_reset_clock_on_activity_insert
--     AFTER INSERT ON activity
--     FOR EACH ROW
--     WHEN (NEW.deal_id IS NOT NULL)
--     EXECUTE FUNCTION public.reset_deal_activity_clock();
-- ============================================================================

DROP TRIGGER IF EXISTS trg_reset_clock_on_activity_insert ON activity;

CREATE TRIGGER trg_reset_clock_on_activity_insert
  AFTER INSERT ON activity
  FOR EACH ROW
  WHEN (NEW.deal_id IS NOT NULL AND NEW.email_id IS NULL AND NEW.sf_id IS NULL)
  EXECUTE FUNCTION public.reset_deal_activity_clock();
