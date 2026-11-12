-- Teach extract_parcel_numbers() Hall County's parcel ids, including the way Hall
-- sources list them, and backfill Hall records.
--
-- Hall PIN (Gainesville-Hall GIS parcel_owner_public/FeatureServer/0), profiled
-- 2026-11-12 over 8,000 rows: a 5-digit map, then either a space or a sub-map
-- letter, then a 6-digit parcel, then an optional 1–2 letter suffix:
--   10081 000099 · 15043D000069 · 15016 000011X · 15037B000005D
--
-- Hall sources state the map ONCE and list the rest bare:
--   "Parcels 15048 000008, 000007, 000025C, 000204A"
--   "Tax Parcels 15036A000001, 000003, 000011"
--   "09108 000107-000109"
-- The old patterns read only the first id of such a list, so a "parsed" Hall
-- record could be missing most of its parcels. Here a bare 6-digit parcel
-- inherits the most recent map in the same clause; a bare range expands when it
-- spans 25 parcels or fewer. Bare numbers are never accepted before a full id in
-- the clause, so other counties' 6-digit runs are untouched. "(pt.)" / "pt" is
-- dropped first so it can't read as a suffix.
--
-- Output matches the fabric's own form: '15048 000007', '15036A000003'.
--
-- Definition pulled from the live database (includes the Henry pattern from
-- 20261112075338). CREATE OR REPLACE keeps the existing ACL.

CREATE OR REPLACE FUNCTION public.extract_parcel_numbers(p_text text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE
AS $function$
DECLARE
  v_clause text;
  v_clean  text;
  v_out    text[] := '{}';
  v_hit    text[];
  -- Known county parcel-id shapes. \y anchors stop these from biting into longer
  -- runs of digits (a zip+4, a year range, a plat page range).
  c_patterns text[] := ARRAY[
    '\y([A-Z]?[0-9]{2,3}-[0-9]{3})\y',      -- Forsyth: 080-264, C37-002
    '\y([A-Z][0-9]{3}-[0-9]{4})\y',         -- Macon-Bibb: I008-0229, N101-0042
    '\y([0-9]{5}[ ][0-9]{6})\y',            -- 5+6 spaced: 09105 000001
    '\y([0-9H][0-9]{2}[A-Z]?-?[0-9]{8})\y'  -- Henry: 128-02065000, H04A01001000
  ];
  v_pat text;
  -- Hall: full id | bare parcel (optionally a range).
  -- Groups: 1 map, 2 sub-map letter, 3 parcel, 4 suffix, 5 range end |
  --         6 bare parcel, 7 bare suffix, 8 bare range end.
  c_hall text := '\y(?:([0-9]{5})(?:([A-Z])|[ -])([0-9]{6})([A-Z]{0,2})(?:-([0-9]{6}))?|([0-9]{6})([A-Z]{0,2})(?:-([0-9]{6}))?)\y';
  v_p      text;
  v_sfx    text;
  v_end    text;
  v_m      text[];
  v_map    text;
  i        int;
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

    -- Hall lists: map stated once, parcels after it bare.
    v_clean := upper(regexp_replace(v_clause, '\(?\s*\mpt\M\.?\s*\)?', ' ', 'gi'));
    v_map := NULL;
    FOR v_m IN SELECT regexp_matches(v_clean, c_hall, 'g') LOOP
      IF v_m[1] IS NOT NULL THEN
        v_map := v_m[1] || coalesce(v_m[2], '');
        v_p := v_m[3]; v_sfx := v_m[4]; v_end := v_m[5];
      ELSIF v_map IS NOT NULL THEN
        v_p := v_m[6]; v_sfx := v_m[7]; v_end := v_m[8];
      ELSE
        CONTINUE;   -- a bare number before any full id: not ours
      END IF;
      v_out := v_out || (CASE WHEN length(v_map) = 6 THEN v_map ELSE v_map || ' ' END || v_p || v_sfx);
      IF v_end IS NOT NULL AND v_sfx = '' AND v_end::int - v_p::int BETWEEN 1 AND 25 THEN
        FOR i IN v_p::int + 1 .. v_end::int LOOP
          v_out := v_out || (CASE WHEN length(v_map) = 6 THEN v_map ELSE v_map || ' ' END || lpad(i::text, 6, '0'));
        END LOOP;
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

-- Backfill Hall. parcel_numbers on these rows was only ever written by this
-- parser (the agent doesn't send it), so a re-parse that is a SUPERSET of what's
-- stored replaces it; anything else is left alone. Rows whose boundary already
-- came from a parcel fetch are skipped (fetch once, never refetch). Staging rows
-- of in-flight runs are skipped — the review guard would reject the write.
UPDATE public.municipal_project_staging st
   SET parcel_numbers = public.extract_parcel_numbers(st.parcel_boundary_notes)
  FROM public.boundary_municipality b, public.research_run rr
 WHERE b.id = st.boundary_municipality_id
   AND rr.id = st.research_run_id
   AND rr.state NOT IN ('pending', 'running')
   AND b.name IN ('Hall County', 'Gainesville', 'Flowery Branch', 'Oakwood', 'Lula', 'Clermont', 'Gillsville')
   AND public.extract_parcel_numbers(st.parcel_boundary_notes) @> st.parcel_numbers
   AND public.extract_parcel_numbers(st.parcel_boundary_notes) <> st.parcel_numbers;

UPDATE public.municipal_project p
   SET parcel_numbers = public.extract_parcel_numbers(p.parcel_boundary_notes)
  FROM public.municipality mu
 WHERE mu.id = p.municipality_id
   AND mu.name IN ('Hall County', 'Gainesville', 'Flowery Branch', 'Oakwood', 'Lula', 'Clermont', 'Gillsville')
   AND p.geometry_source IS DISTINCT FROM 'parcel_fetch'
   AND public.extract_parcel_numbers(p.parcel_boundary_notes) @> p.parcel_numbers
   AND public.extract_parcel_numbers(p.parcel_boundary_notes) <> p.parcel_numbers;
