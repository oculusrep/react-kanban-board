-- Migration: Schema corrections for StreetLight tables to match spec §4.3 / §4.5
-- 
-- NOTE: This migration assumes tables may have data. Column renames/drops are done
-- carefully. For streetlight_usage_log the old columns (segment_count, cost_usd, status)
-- are dropped and new spec columns are added.

-- ─── streetlight_usage_log ────────────────────────────────────────────────────

-- Add new spec columns (missing from original migration)
ALTER TABLE streetlight_usage_log
  ADD COLUMN IF NOT EXISTS segments_requested INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS segments_billed    INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS segments_new       INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS segments_refresh   INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS request_geometry   JSONB,
  ADD COLUMN IF NOT EXISTS checked_segment_ids BIGINT[],
  ADD COLUMN IF NOT EXISTS date_spec          JSONB,
  ADD COLUMN IF NOT EXISTS endpoint           TEXT NOT NULL DEFAULT 'metrics';

-- Add generated column for wasted segments (must be done separately — cannot be IF NOT EXISTS)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'streetlight_usage_log' AND column_name = 'segments_wasted'
  ) THEN
    ALTER TABLE streetlight_usage_log
      ADD COLUMN segments_wasted INTEGER GENERATED ALWAYS AS (segments_billed - segments_new - segments_refresh) STORED;
  END IF;
END $$;

-- Consolidate response_status: ensure it exists (was named 'status' in old schema)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'streetlight_usage_log' AND column_name = 'status'
  ) AND NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'streetlight_usage_log' AND column_name = 'response_status'
  ) THEN
    ALTER TABLE streetlight_usage_log RENAME COLUMN status TO response_status;
  ELSIF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'streetlight_usage_log' AND column_name = 'response_status'
  ) THEN
    ALTER TABLE streetlight_usage_log ADD COLUMN response_status TEXT;
  END IF;
END $$;

-- Drop old columns no longer in spec
ALTER TABLE streetlight_usage_log
  DROP COLUMN IF EXISTS segment_count,
  DROP COLUMN IF EXISTS cost_usd;

-- ─── streetlight_usage_log_segment ───────────────────────────────────────────

ALTER TABLE streetlight_usage_log_segment
  ADD COLUMN IF NOT EXISTS update_reason TEXT NOT NULL DEFAULT 'new'
    CHECK (update_reason IN ('new','refresh','different_daypart')),
  ADD COLUMN IF NOT EXISTS prior_spec JSONB,
  ADD COLUMN IF NOT EXISTS new_spec   JSONB,
  ADD COLUMN IF NOT EXISTS aadt       INTEGER;

-- ─── streetlight_quota_config ─────────────────────────────────────────────────

DROP TABLE IF EXISTS streetlight_quota_config CASCADE;

CREATE TABLE streetlight_quota_config (
  id                     INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  annual_segment_quota   INTEGER NOT NULL DEFAULT 10000,
  hard_stop_pct          INTEGER NOT NULL DEFAULT 95,
  warning_pct            INTEGER NOT NULL DEFAULT 75,
  default_daily_per_user INTEGER NOT NULL DEFAULT 200,
  contract_start_date    DATE NOT NULL,
  updated_at             TIMESTAMPTZ DEFAULT now(),
  updated_by             UUID REFERENCES "user"(id)
);

INSERT INTO streetlight_quota_config (id, contract_start_date)
VALUES (1, CURRENT_DATE)
ON CONFLICT (id) DO NOTHING;

-- ─── streetlight_segment_metrics ─────────────────────────────────────────────

ALTER TABLE streetlight_segment_metrics
  ADD COLUMN IF NOT EXISTS year_month   TEXT NOT NULL DEFAULT '2024-annual',
  ADD COLUMN IF NOT EXISTS day_type     TEXT NOT NULL DEFAULT 'all_days',
  ADD COLUMN IF NOT EXISTS day_part     TEXT NOT NULL DEFAULT 'all_day',
  ADD COLUMN IF NOT EXISTS trips_volume INTEGER,
  ADD COLUMN IF NOT EXISTS vmt          DECIMAL,
  ADD COLUMN IF NOT EXISTS vhd          DECIMAL,
  ADD COLUMN IF NOT EXISTS truck_pct    DECIMAL(5,2),
  ADD COLUMN IF NOT EXISTS fetched_by   UUID,
  ADD COLUMN IF NOT EXISTS usage_log_id UUID;

-- Fix primary key to include year_month, day_type, day_part
-- (Only safe if no existing unique constraint covers this combination)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'streetlight_segment_metrics_segment_id_year_month_day_type_day_pa'
      OR conname = 'streetlight_segment_metrics_pkey_new'
  ) THEN
    -- Drop old unique constraint if it exists on (segment_id, date_range_start, date_range_end)
    ALTER TABLE streetlight_segment_metrics
      DROP CONSTRAINT IF EXISTS streetlight_segment_metrics_segment_id_date_range_start_date_r;
    -- Add new unique constraint matching atomic spend RPC ON CONFLICT clause
    ALTER TABLE streetlight_segment_metrics
      ADD CONSTRAINT streetlight_segment_metrics_segment_year_daytype_daypart_key
        UNIQUE (segment_id, year_month, day_type, day_part);
  END IF;
END $$;

-- ─── streetlight_segment: segment_id type note ───────────────────────────────
-- 
-- If streetlight_segment.id is TEXT and should be BIGINT:
--   If the table is empty, drop and recreate. If it has data, a careful multi-step
--   migration is needed (add bigint column, populate, swap). This migration adds a
--   TODO comment — the type fix requires manual review of existing data.
--
-- TODO: Verify streetlight_segment.id type is BIGINT. If currently TEXT and table
-- is empty, run:
--   ALTER TABLE streetlight_segment ALTER COLUMN id TYPE BIGINT USING id::BIGINT;
