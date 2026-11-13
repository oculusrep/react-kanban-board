-- Teach extract_parcel_numbers() Coweta County's parcel ids and backfill Coweta
-- records (Coweta County, Newnan, Senoia, Haralson, Grantville, Moreland, Turin,
-- Sharpsburg).
--
-- Coweta ParcelNumber (WeeklyUpdate_WinGapParcels/FeatureServer/0), profiled
-- 2026-11-13 over all 66,099 rows. 13 shapes, all built from three runs:
--   '162  1259 001'  '162  1259 001A'  'N12  1234 001'  'N12A 1234 001'  (3-part, 66%)
--   '075A      012'  'N23       045'   'AB1       001'  'N23A      012'  (2-part, 34%)
-- Internal whitespace is padding (double space, or six spaces in 2-part ids).
-- Stripping every non-alphanumeric is lossless: 65,417 distinct raw ids -> 65,417
-- distinct normalized, zero collisions — so the adapter's run-LIKE + normalized
-- compare is exact.
--
-- Only the 3-part form is read. Every Coweta id cited in our data is 3-part.
-- The 2-part form ('075A 012', 'G12 053') was tried and dropped: it is the same
-- shape other counties use (Dublin, Elbert County and Grovetown rows matched it), so it
-- would start filling parcel_numbers outside Coweta with ids no adapter can
-- fetch. A Coweta source citing a 2-part id will parse to nothing — the fetch
-- button doesn't appear, and the boundary is drawn by hand.

-- Built from the LIVE definition (pg_get_functiondef, 2026-11-13), which includes
-- the Forsyth, Macon-Bibb, 5+6, Henry and Hall forms.

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
  -- Coweta: district / map / parcel. Separators are spaces or dashes in any
  -- number (the fabric itself stores '162  1259 001' with a double space;
  -- sources write '162-1259-001', '163 1261 002'). Emitted single-spaced.
  c_coweta text := '\y([A-Z]?[0-9]{2,3}[A-Z]?)[ -]+([0-9]{4})[ -]+([0-9]{3}[A-Z]?)\y';
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

    -- Coweta (see c_coweta). Runs are rejoined with one space, so the stored id
    -- never carries the fabric's double space; the fetch matches on runs anyway.
    FOR v_m IN SELECT regexp_matches(upper(v_clause), c_coweta, 'g') LOOP
      v_out := v_out || (v_m[1] || ' ' || v_m[2] || ' ' || v_m[3]);
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

-- Backfill Coweta. Same rules as the Hall/Henry backfills: superset-only (this
-- parser is the only writer of parcel_numbers on these rows), skip boundaries
-- that already came from a parcel fetch (fetch once), skip in-flight runs.
UPDATE public.municipal_project_staging st
   SET parcel_numbers = public.extract_parcel_numbers(st.parcel_boundary_notes)
  FROM public.boundary_municipality b, public.research_run rr
 WHERE b.id = st.boundary_municipality_id
   AND rr.id = st.research_run_id
   AND rr.state NOT IN ('pending', 'running')
   AND b.name IN ('Coweta County', 'Newnan', 'Senoia', 'Haralson', 'Grantville', 'Moreland', 'Turin', 'Sharpsburg')
   AND public.extract_parcel_numbers(st.parcel_boundary_notes) @> st.parcel_numbers
   AND public.extract_parcel_numbers(st.parcel_boundary_notes) <> st.parcel_numbers;

UPDATE public.municipal_project p
   SET parcel_numbers = public.extract_parcel_numbers(p.parcel_boundary_notes)
  FROM public.municipality mu
 WHERE mu.id = p.municipality_id
   AND mu.name IN ('Coweta County', 'Newnan', 'Senoia', 'Haralson', 'Grantville', 'Moreland', 'Turin', 'Sharpsburg')
   AND p.geometry_source IS DISTINCT FROM 'parcel_fetch'
   AND public.extract_parcel_numbers(p.parcel_boundary_notes) @> p.parcel_numbers
   AND public.extract_parcel_numbers(p.parcel_boundary_notes) <> p.parcel_numbers;
