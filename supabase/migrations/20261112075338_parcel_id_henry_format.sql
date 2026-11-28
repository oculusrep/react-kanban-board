-- Teach extract_parcel_numbers() Henry County's parcel-id shape, and backfill
-- Henry records whose parcel_boundary_notes already state one.
--
-- Henry PARCEL_NO (arcgis.co.henry.ga.us Parcels/MapServer/12), profiled
-- 2026-11-12: 3-char map (digits, or H + 2 digits), optional sub-map letter,
-- optional dash, 8 digits — 128-02065000, H01-01001000, H04A01001000, 077A01084000.
--
-- The pattern list is county-agnostic: an 11-digit Cobb PIN (17021400320) also
-- matches, which is correct — it is a parcel id; the county adapter decides
-- what to do with it. Hall's 15036B000037 and Forsyth's 080-264 do not match
-- (\y anchors), so existing extractions are unchanged.
--
-- Definition pulled from the live database (pg_get_functiondef), not an older
-- migration; only the Henry line is new. CREATE OR REPLACE keeps the existing ACL.

CREATE OR REPLACE FUNCTION public.extract_parcel_numbers(p_text text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  v_clause text;
  v_out    text[] := '{}';
  v_hit    text[];
  -- Known county parcel-id shapes. \y anchors stop these from biting into longer
  -- runs of digits (a zip+4, a year range, a plat page range).
  c_patterns text[] := ARRAY[
    '\y([A-Z]?[0-9]{2,3}-[0-9]{3})\y',      -- Forsyth: 080-264, C37-002
    '\y([A-Z][0-9]{3}-[0-9]{4})\y',         -- Macon-Bibb: I008-0229, N101-0042
    '\y([0-9]{5}[ ][0-9]{6})\y',            -- Bibb tax parcel: 09105 000001
    '\y([0-9H][0-9]{2}[A-Z]?-?[0-9]{8})\y'  -- Henry: 128-02065000, H04A01001000
  ];
  v_pat text;
BEGIN
  IF p_text IS NULL OR btrim(p_text) = '' THEN
    RETURN NULL;
  END IF;

  -- Only clauses that name a parcel are eligible. Splitting on ';' keeps
  -- "Parcels A, B, C; 40.45 acres" from letting the acreage clause contribute.
  FOREACH v_clause IN ARRAY string_to_array(p_text, ';') LOOP
    CONTINUE WHEN v_clause !~* '\y(parcels?|pins?|tax\s+parcels?)\y';
    FOREACH v_pat IN ARRAY c_patterns LOOP
      SELECT array_agg(upper(btrim(m[1]))) INTO v_hit
        FROM regexp_matches(v_clause, v_pat, 'g') m;
      IF v_hit IS NOT NULL THEN
        v_out := v_out || v_hit;
      END IF;
    END LOOP;
  END LOOP;

  IF array_length(v_out, 1) IS NULL THEN
    RETURN NULL;
  END IF;
  -- Stable, de-duplicated. Order is the reviewer-facing display order.
  SELECT array_agg(DISTINCT x ORDER BY x) INTO v_out FROM unnest(v_out) x;
  RETURN v_out;
END $function$;

-- Backfill: Henry only, and only rows with no parcel ids yet (an explicit value
-- always wins). Staging rows of in-flight runs are skipped — the review guard
-- would reject the write, and the next checkpoint submit re-runs the trigger anyway.
UPDATE public.municipal_project_staging st
   SET parcel_numbers = public.extract_parcel_numbers(st.parcel_boundary_notes)
  FROM public.boundary_municipality b, public.research_run rr
 WHERE b.id = st.boundary_municipality_id
   AND rr.id = st.research_run_id
   AND rr.state NOT IN ('pending', 'running')
   AND b.name IN ('Henry County', 'McDonough', 'Stockbridge', 'Hampton', 'Locust Grove')
   AND cardinality(st.parcel_numbers) = 0
   AND public.extract_parcel_numbers(st.parcel_boundary_notes) IS NOT NULL;

UPDATE public.municipal_project p
   SET parcel_numbers = public.extract_parcel_numbers(p.parcel_boundary_notes)
  FROM public.municipality m
 WHERE m.id = p.municipality_id
   AND m.name IN ('Henry County', 'McDonough', 'Stockbridge', 'Hampton', 'Locust Grove')
   AND cardinality(p.parcel_numbers) = 0
   AND public.extract_parcel_numbers(p.parcel_boundary_notes) IS NOT NULL;
