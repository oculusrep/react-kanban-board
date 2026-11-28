-- Tour hardening (pre-11/4)
-- Created: October 28, 2026
-- Description:
--   1. tour_stop.display_label — optional per-stop short name shown on the panel + map.
--   2. set_tour_stop_placements(p_tour_id, p_placements) — atomic day/position write for
--      drag-reorder and Optimize (replaces one UPDATE per stop from the browser).
--   3. Explicit grants for the four tour tables (the original tour migrations had no
--      REVOKE, so anon inherited ALL via default privileges; RLS was the only gate).
--
-- No BEGIN/COMMIT in this file: apply with psql --single-transaction so it can also be
-- round-trip tested inside a rolled-back transaction.

-- ============================================================================
-- 1. display_label
-- ============================================================================

ALTER TABLE public.tour_stop ADD COLUMN IF NOT EXISTS display_label TEXT;

-- ============================================================================
-- 2. Atomic placement RPC
-- ============================================================================
-- p_placements: [{ "id": uuid, "tour_day_id": uuid|null, "position": int }, ...]
-- SECURITY INVOKER: tour_stop / tour_day RLS still applies to the caller.
-- One UPDATE statement => all-or-nothing. Rejects ids from another tour and days
-- from another tour rather than silently skipping them.

CREATE OR REPLACE FUNCTION public.set_tour_stop_placements(p_tour_id UUID, p_placements JSONB)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
DECLARE
  v_expected INTEGER;
  v_updated INTEGER;
BEGIN
  IF p_placements IS NULL OR jsonb_typeof(p_placements) <> 'array' THEN
    RAISE EXCEPTION 'p_placements must be a JSON array';
  END IF;

  v_expected := jsonb_array_length(p_placements);
  IF v_expected = 0 THEN
    RETURN 0;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM jsonb_to_recordset(p_placements) AS p(id UUID, tour_day_id UUID, "position" INTEGER)
    WHERE p.tour_day_id IS NOT NULL
      AND NOT EXISTS (SELECT 1 FROM tour_day d WHERE d.id = p.tour_day_id AND d.tour_id = p_tour_id)
  ) THEN
    RAISE EXCEPTION 'placement references a day that is not on tour %', p_tour_id;
  END IF;

  UPDATE tour_stop s
  SET tour_day_id = p.tour_day_id,
      "position" = p."position"
  FROM jsonb_to_recordset(p_placements) AS p(id UUID, tour_day_id UUID, "position" INTEGER)
  WHERE s.id = p.id
    AND s.tour_id = p_tour_id;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  IF v_updated <> v_expected THEN
    RAISE EXCEPTION 'expected % stops on tour %, updated % (stale or foreign stop ids)',
      v_expected, p_tour_id, v_updated;
  END IF;

  RETURN v_updated;
END;
$$;

REVOKE ALL ON FUNCTION public.set_tour_stop_placements(UUID, JSONB) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_tour_stop_placements(UUID, JSONB) TO authenticated;

-- ============================================================================
-- 3. Grants: don't inherit the defaults, state what the app uses.
-- ============================================================================

REVOKE ALL ON public.tour FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tour TO authenticated;

REVOKE ALL ON public.tour_stop FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tour_stop TO authenticated;

REVOKE ALL ON public.tour_day FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tour_day TO authenticated;

-- Lookup table: the app only reads it.
REVOKE ALL ON public.tour_stop_category FROM anon, authenticated;
GRANT SELECT ON public.tour_stop_category TO authenticated;
