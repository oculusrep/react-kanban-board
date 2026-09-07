-- ============================================================================
-- Starbucks Deal Board — step 6: realtime on deal_activity_state
--
-- See docs/STARBUCKS_DEAL_BOARD_SPEC.md §8. The board subscribes to Supabase
-- realtime so the wall TV updates without a manual reload. Every board write
-- (cool/classify/blocker/agenda) funnels through deal_activity_state — directly
-- or via the reset-clock triggers on note_object_link/task/activity — so
-- publishing this one satellite table captures them all. `deal` is already in
-- the publication (covers stage moves + new deals).
-- ============================================================================

ALTER PUBLICATION supabase_realtime ADD TABLE deal_activity_state;
