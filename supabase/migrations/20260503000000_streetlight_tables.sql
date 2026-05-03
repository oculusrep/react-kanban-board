-- StreetLight SATC Integration Tables
-- Migration: 20260503000000_streetlight_tables.sql
-- Creates tables for caching StreetLight road segment geometry, metrics, usage tracking, and quota management.

-- ============================================================================
-- streetlight_segment
-- Caches road segment geometry from the StreetLight SATC API
-- ============================================================================
CREATE TABLE IF NOT EXISTS streetlight_segment (
  id                    TEXT PRIMARY KEY,          -- StreetLight segment ID (string)
  road_name             TEXT,
  road_type             TEXT,                      -- e.g. 'Interstate', 'State Highway', 'Local Road'
  geom                  GEOMETRY(LineString, 4326) NOT NULL,
  bbox_south            DOUBLE PRECISION,
  bbox_west             DOUBLE PRECISION,
  bbox_north            DOUBLE PRECISION,
  bbox_east             DOUBLE PRECISION,
  cached_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- PostGIS spatial index for fast bounding-box queries
CREATE INDEX IF NOT EXISTS idx_streetlight_segment_geom ON streetlight_segment USING GIST (geom);
CREATE INDEX IF NOT EXISTS idx_streetlight_segment_bbox ON streetlight_segment (bbox_south, bbox_west, bbox_north, bbox_east);

-- ============================================================================
-- streetlight_segment_metrics
-- Stores AADT and other metrics retrieved from the StreetLight API for a segment
-- on a specific date range / data vintage.
-- ============================================================================
CREATE TABLE IF NOT EXISTS streetlight_segment_metrics (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  segment_id            TEXT NOT NULL REFERENCES streetlight_segment(id) ON DELETE CASCADE,
  date_range_start      DATE NOT NULL,
  date_range_end        DATE NOT NULL,
  aadt                  INTEGER,                   -- Annual Average Daily Traffic
  aadt_raw              JSONB,                     -- Full API response for this segment
  fetched_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (segment_id, date_range_start, date_range_end)
);

CREATE INDEX IF NOT EXISTS idx_streetlight_segment_metrics_segment_id ON streetlight_segment_metrics (segment_id);
CREATE INDEX IF NOT EXISTS idx_streetlight_segment_metrics_fetched_at ON streetlight_segment_metrics (fetched_at DESC);

-- ============================================================================
-- streetlight_usage_log
-- Tracks each "spend" event: who requested metrics and how many segments were consumed.
-- ============================================================================
CREATE TABLE IF NOT EXISTS streetlight_usage_log (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                UUID,                      -- FK to org if applicable
  user_id               UUID NOT NULL,             -- auth.users.id
  segment_count         INTEGER NOT NULL,
  cost_usd              NUMERIC(10,4),
  requested_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  status                TEXT NOT NULL DEFAULT 'success', -- 'success' | 'failed' | 'partial'
  error_message         TEXT
);

CREATE INDEX IF NOT EXISTS idx_streetlight_usage_log_user_id ON streetlight_usage_log (user_id);
CREATE INDEX IF NOT EXISTS idx_streetlight_usage_log_requested_at ON streetlight_usage_log (requested_at DESC);
CREATE INDEX IF NOT EXISTS idx_streetlight_usage_log_org_id ON streetlight_usage_log (org_id);

-- ============================================================================
-- streetlight_usage_log_segment
-- Junction table linking a usage_log entry to the specific segments consumed.
-- ============================================================================
CREATE TABLE IF NOT EXISTS streetlight_usage_log_segment (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usage_log_id          UUID NOT NULL REFERENCES streetlight_usage_log(id) ON DELETE CASCADE,
  segment_id            TEXT NOT NULL REFERENCES streetlight_segment(id) ON DELETE CASCADE,
  UNIQUE (usage_log_id, segment_id)
);

CREATE INDEX IF NOT EXISTS idx_streetlight_usage_log_segment_log_id ON streetlight_usage_log_segment (usage_log_id);
CREATE INDEX IF NOT EXISTS idx_streetlight_usage_log_segment_segment_id ON streetlight_usage_log_segment (segment_id);

-- ============================================================================
-- streetlight_user_limit
-- Per-user daily / monthly spend limits (org-level or individual overrides).
-- ============================================================================
CREATE TABLE IF NOT EXISTS streetlight_user_limit (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL UNIQUE,      -- auth.users.id
  daily_segment_limit   INTEGER NOT NULL DEFAULT 500,
  monthly_segment_limit INTEGER,
  notes                 TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ============================================================================
-- streetlight_quota_config
-- Global org-level quota configuration (one row per org; default row is org_id IS NULL).
-- ============================================================================
CREATE TABLE IF NOT EXISTS streetlight_quota_config (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id                    UUID UNIQUE,           -- NULL = global default
  cost_per_segment_usd      NUMERIC(10,4) NOT NULL DEFAULT 0.10,
  monthly_hard_limit_usd    NUMERIC(10,2),
  monthly_hard_limit_segments INTEGER,
  period_start_date         DATE NOT NULL DEFAULT CURRENT_DATE,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Insert a global default quota config row
INSERT INTO streetlight_quota_config (org_id, cost_per_segment_usd, monthly_hard_limit_segments, period_start_date, notes)
VALUES (NULL, 0.10, 10000, CURRENT_DATE, 'Global default quota — adjust before go-live')
ON CONFLICT (org_id) DO NOTHING;
