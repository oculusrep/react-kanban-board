-- ============================================================================
-- Starbucks Deal Board — Phase 1, step 2: activity reset trigger + backfill
--
-- See docs/STARBUCKS_DEAL_BOARD_SPEC.md §3.3, §10.
--
-- Finding that drove this migration: Starbucks deal history lives in the
-- legacy `activity` table, NOT `note`/`note_object_link` (0 of 44 Starbucks
-- deals had any note_object_link; 19 have activity rows). So:
--   1. The clock's reset must also fire on `activity` insert, or logging a
--      call never cools a Starbucks tile (resolves spec open item #5: yes,
--      logging a call cools a tile — activity is the PRIMARY touch signal
--      for this account, not a supplement).
--   2. The ball_in_court_since backfill seeds from the most-recent of
--      activity + note_object_link, falling back to now().
--
-- NOTE: `activity` has no source/system column (only Salesforce sf_* fields,
-- which mark external origin, not human-vs-system). So the trigger fires on
-- ALL activity inserts with a deal_id. If Salesforce→OVIS sync inserts
-- activity rows automatically, that would cool a tile spuriously; guard with
-- `AND NEW.sf_id IS NULL` if that turns out to matter. Revisit for v2.
--
-- Requires client.starbucks_layer_enabled = true on the Starbucks clients
-- (set as a data operation). Backfill is idempotent (ON CONFLICT DO NOTHING)
-- and no-ops on environments where the flag isn't set.
-- ============================================================================

-- 1. Reset the clock on activity insert (reuses reset_deal_activity_clock()
--    from 20260825190000; NEW.deal_id exists on activity).
DROP TRIGGER IF EXISTS trg_reset_clock_on_activity_insert ON activity;
CREATE TRIGGER trg_reset_clock_on_activity_insert
  AFTER INSERT ON activity
  FOR EACH ROW
  WHEN (NEW.deal_id IS NOT NULL)
  EXECUTE FUNCTION public.reset_deal_activity_clock();


-- 2. Backfill ball_in_court_since for Starbucks deals.
--    Seed = most-recent of (activity.activity_date, note_object_link.created_at),
--    fallback now(). GREATEST ignores NULL inputs; COALESCE covers all-null.
--    ball_in_court / blocked_on / on_agenda left at defaults (Mike classifies
--    ball_in_court manually; blocked_on unset).
INSERT INTO deal_activity_state (deal_id, ball_in_court_since)
SELECT d.id,
       COALESCE(
         GREATEST(
           MAX(a.activity_date)::timestamptz,
           MAX(n.created_at)
         ),
         NOW()
       )
FROM deal d
JOIN client c ON c.id = d.client_id AND c.starbucks_layer_enabled = true
LEFT JOIN activity a ON a.deal_id = d.id
LEFT JOIN note_object_link n ON n.deal_id = d.id
GROUP BY d.id
ON CONFLICT (deal_id) DO NOTHING;
