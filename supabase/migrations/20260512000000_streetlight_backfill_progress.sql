-- Tracks progress of the streetlight-backfill edge function.
-- One row per pre-defined region (e.g. 'georgia'); backfill is resumable across
-- invocations via next_tile_index. Service-role writes only — no RLS surface.

CREATE TABLE IF NOT EXISTS streetlight_backfill_progress (
  region TEXT PRIMARY KEY,
  tiles_total INTEGER NOT NULL,
  tiles_processed INTEGER NOT NULL DEFAULT 0,
  next_tile_index INTEGER NOT NULL DEFAULT 0,
  segments_added INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_run_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_error TEXT
);

COMMENT ON TABLE streetlight_backfill_progress IS
  'Progress tracking for the streetlight-backfill edge function. Used to resume tile iteration across multiple invocations.';
