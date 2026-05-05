-- Migration: Atomic spend RPC for StreetLight usage logging
-- Wraps usage_log + usage_log_segment + segment_metrics upsert in a single transaction.

CREATE OR REPLACE FUNCTION streetlight_record_spend(
  p_usage_log streetlight_usage_log,
  p_segments streetlight_usage_log_segment[],
  p_metrics streetlight_segment_metrics[]
) RETURNS UUID
LANGUAGE plpgsql SECURITY DEFINER AS $$
DECLARE v_log_id UUID;
BEGIN
  INSERT INTO streetlight_usage_log VALUES (p_usage_log.*) RETURNING id INTO v_log_id;
  INSERT INTO streetlight_usage_log_segment SELECT * FROM unnest(p_segments);
  INSERT INTO streetlight_segment_metrics SELECT * FROM unnest(p_metrics)
    ON CONFLICT (segment_id, year_month, day_type, day_part) DO UPDATE
    SET aadt = EXCLUDED.aadt, fetched_at = EXCLUDED.fetched_at, fetched_by = EXCLUDED.fetched_by;
  RETURN v_log_id;
END;
$$;
