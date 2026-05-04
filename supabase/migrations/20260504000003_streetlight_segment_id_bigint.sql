-- Fix streetlight_segment.id and related FK columns to BIGINT
-- StreetLight segment IDs are numeric; TEXT was incorrect and would break cache lookups.

ALTER TABLE streetlight_segment_metrics DROP CONSTRAINT IF EXISTS streetlight_segment_metrics_segment_id_fkey;
ALTER TABLE streetlight_usage_log_segment DROP CONSTRAINT IF EXISTS streetlight_usage_log_segment_segment_id_fkey;

ALTER TABLE streetlight_segment ALTER COLUMN id TYPE BIGINT USING id::BIGINT;
ALTER TABLE streetlight_segment_metrics ALTER COLUMN segment_id TYPE BIGINT USING segment_id::BIGINT;
ALTER TABLE streetlight_usage_log_segment ALTER COLUMN segment_id TYPE BIGINT USING segment_id::BIGINT;

ALTER TABLE streetlight_segment_metrics
  ADD CONSTRAINT streetlight_segment_metrics_segment_id_fkey
  FOREIGN KEY (segment_id) REFERENCES streetlight_segment(id) ON DELETE CASCADE;

ALTER TABLE streetlight_usage_log_segment
  ADD CONSTRAINT streetlight_usage_log_segment_segment_id_fkey
  FOREIGN KEY (segment_id) REFERENCES streetlight_segment(id);
