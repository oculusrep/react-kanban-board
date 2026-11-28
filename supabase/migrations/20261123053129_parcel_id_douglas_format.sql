-- Teach extract_parcel_numbers() Douglas County's parcel ids, scoped to Douglas
-- County records, and backfill them.
--
-- Douglas County's own ArcGIS Server (not in the ArcGIS Online index):
-- maps.douglascountyga.gov/arcgis/rest/services/CountyLayers/Parcels/MapServer/15.
-- Profiled 2026-11-23: 55,100 rows, 54,992 distinct ParcelNo, lossless under
-- normalization. ParcelNo is land lot (4) + district (2) + section (1) + parcel
-- (4) with no separators: '06461820001' (52,827 rows), '0016015A013' (letter in
-- the parcel, 2,102), '04811820005B' (letter suffix, 57). District+section is
-- always one of 015, 025, 035, 013, 182. c_douglas matches 54,986 of 55,100; the
-- rest are three 12-digit oddities and non-parcels ('15'' ALLEY', road names).
--
-- The plain 11-digit form was already read everywhere by the Henry pattern. What
-- this adds, for Douglas only: the dashed form sources write ('0978-182-0001'),
-- the letter forms, and tails ('0022015C014/C015/C016', '06461820001-003',
-- '0318-182-0014 through -0027'). Scoped by county because Cobb's ids are also
-- 11 digits.
--
-- parcel_id_county(): 'Douglas County' for Douglas County and Douglasville (100%
-- inside). Austell (3% in Douglas, mostly Cobb) and Villa Rica (32% in Douglas,
-- mostly Carroll) straddle and are not matched. 'Douglas' (Coffee County) is a
-- different place and is not matched.
--
-- Built from the LIVE definition (pg_get_functiondef, 2026-11-23), which includes
-- the Forsyth, Macon-Bibb, 5+6, Henry, Hall, Coweta and Houston forms.
-- The 1-argument wrapper and the sync trigger are unchanged.

CREATE OR REPLACE FUNCTION public.extract_parcel_numbers(p_text text, p_county text)
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
  -- Houston: 6-char map + 6-char parcel ('0W1330 039000', '00122A 105000',
  -- '0W68A0 05B000', '000340 001CEL'). Read ONLY when p_county = 'Houston County':
  -- a bare 6+6 shape is far too generic to read everywhere.
  c_houston text := '\y(0[0-9WPC][0-9A-Z]{4})[ -]+([0-9]{2}[0-9A-Z](?:[0-9]{3}|CEL))\y';
  -- Douglas: land lot (4) + district (2) + section (1) + parcel (4, the first
  -- may be a letter) + optional letter suffix. The fabric stores it unseparated
  -- ('06461820001', '0016015A013', '04811820005B'); sources also write it dashed
  -- ('0978-182-0001'). District+section is one of the five the fabric uses.
  -- Read ONLY when p_county = 'Douglas County': Cobb's 11-digit ids have the
  -- same digit count.
  -- Group 5 is a tail of list items / a range written against the last id:
  --   '0022015C014/C015/C016'        -> list (right-aligned replacement)
  --   '06461820001-003', '06461820001/02/03'
  --   '0318-182-0014 through -0027'  -> range, numeric only, at most 25 apart
  c_douglas text := '\y([0-9]{4})[ -]?([0-9]{2})[ -]?([0-9])[ -]?([0-9A-Z][0-9]{3}[A-Z]?)\y((?:\s*(?:/|-|THROUGH|THRU)\s*-?\s*[0-9A-Z]{2,5}\y)*)';
  c_douglas_tail text := '(/|-|THROUGH|THRU)\s*-?\s*([0-9A-Z]{2,5})\y';
  c_douglas_ds text[] := ARRAY['015','025','035','013','182'];
  v_t      text[];
  v_base   text;
  v_cur    text;
  v_next   text;
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

    -- Houston (see c_houston). Sources write the qPublic padding ('0W1330    039000')
    -- or a dash; stored single-spaced, which is how the fabric stores it.
    IF p_county = 'Houston County' THEN
      FOR v_m IN SELECT regexp_matches(upper(v_clause), c_houston, 'g') LOOP
        v_out := v_out || (v_m[1] || ' ' || v_m[2]);
      END LOOP;
    END IF;

    -- Douglas (see c_douglas). Emitted unseparated, as the fabric stores it.
    IF p_county = 'Douglas County' THEN
      FOR v_m IN SELECT regexp_matches(upper(v_clause), c_douglas, 'g') LOOP
        CONTINUE WHEN NOT (v_m[2] || v_m[3]) = ANY (c_douglas_ds);
        v_base := v_m[1] || v_m[2] || v_m[3];
        v_cur  := v_m[4];
        v_out  := v_out || (v_base || v_cur);
        FOR v_t IN SELECT regexp_matches(coalesce(v_m[5], ''), c_douglas_tail, 'g') LOOP
          EXIT WHEN length(v_t[2]) > length(v_cur);
          v_next := left(v_cur, length(v_cur) - length(v_t[2])) || v_t[2];
          IF v_t[1] = '/' THEN
            v_out := v_out || (v_base || v_next);
          ELSIF v_cur ~ '^[0-9]+$' AND v_next ~ '^[0-9]+$'
                AND v_next::int - v_cur::int BETWEEN 1 AND 25 THEN
            FOR i IN v_cur::int + 1 .. v_next::int LOOP
              v_out := v_out || (v_base || lpad(i::text, length(v_cur), '0'));
            END LOOP;
          ELSE
            EXIT;   -- not a range we can read: stop, don't guess
          END IF;
          v_cur := v_next;
        END LOOP;
      END LOOP;
    END IF;

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

CREATE OR REPLACE FUNCTION public.parcel_id_county(p_municipality_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN btrim(p_municipality_name) ~* '^(houston county|warner robins|perry|centerville)$'
      THEN 'Houston County'
    WHEN btrim(p_municipality_name) ~* '^(douglas county|douglasville)$'
      THEN 'Douglas County'
  END;
$function$;

-- Grants: CREATE OR REPLACE keeps them, restated so the file stands alone.
REVOKE ALL ON FUNCTION public.extract_parcel_numbers(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extract_parcel_numbers(text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.parcel_id_county(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parcel_id_county(text) TO authenticated, service_role;

-- Backfill, superset-only: a row only gains ids, never loses one. Skips
-- parcel-fetched boundaries and in-flight runs.
UPDATE public.municipal_project_staging st
   SET parcel_numbers = public.extract_parcel_numbers(st.parcel_boundary_notes, 'Douglas County')
  FROM public.boundary_municipality b, public.research_run rr
 WHERE b.id = st.boundary_municipality_id
   AND rr.id = st.research_run_id
   AND rr.state NOT IN ('pending', 'running')
   AND public.parcel_id_county(b.name) = 'Douglas County'
   AND st.geometry_source IS DISTINCT FROM 'parcel_fetch'
   AND public.extract_parcel_numbers(st.parcel_boundary_notes, 'Douglas County') @> st.parcel_numbers
   AND public.extract_parcel_numbers(st.parcel_boundary_notes, 'Douglas County') <> st.parcel_numbers;

UPDATE public.municipal_project p
   SET parcel_numbers = public.extract_parcel_numbers(p.parcel_boundary_notes, 'Douglas County')
  FROM public.municipality mu
 WHERE mu.id = p.municipality_id
   AND public.parcel_id_county(mu.name) = 'Douglas County'
   AND p.geometry_source IS DISTINCT FROM 'parcel_fetch'
   AND public.extract_parcel_numbers(p.parcel_boundary_notes, 'Douglas County') @> p.parcel_numbers
   AND public.extract_parcel_numbers(p.parcel_boundary_notes, 'Douglas County') <> p.parcel_numbers;
