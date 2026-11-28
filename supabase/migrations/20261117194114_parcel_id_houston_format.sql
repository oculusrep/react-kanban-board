-- Teach extract_parcel_numbers() Houston County's parcel ids, scoped to Houston
-- County records, and backfill them.
--
-- Houston County publishes no queryable parcel service of its own (its AGOL org
-- hcga has only a service-line inventory; the assessor links qPublic). The public
-- fabric is the City of Warner Robins Planning & Engineering layer
-- services6.arcgis.com/wtKwyZlCD3bY8Zh4/.../Base_Map_Polygon/FeatureServer/0,
-- which covers all of Houston (71,012 parcels) and Peach (14,608). Profiled
-- 2026-11-17: Houston Parcel_No is 6-char map + single space + 6-char parcel
-- ('0W1330 039000', '00122A 105000', '0W77C0 617000', '0W1630 80A000',
-- '000340 001CEL'). Map prefix: 0W Warner Robins, 0P Perry, 0C Centerville,
-- 00 unincorporated. c_houston matches 70,855 of 71,012; the rest are '…PU',
-- '…L01' lease rows and non-parcels ('DRAINAGE', 'GA POWER R/W').
--
-- WHY A COUNTY ARGUMENT. Every other county's shape is distinctive enough to read
-- everywhere; 6+6 alphanumerics is not. So the Houston pattern only runs when the
-- caller says the record is in Houston County:
--   * extract_parcel_numbers(text, text) — the full parser, Houston-aware.
--   * extract_parcel_numbers(text)       — unchanged behaviour: calls the above
--                                          with NULL, so it can't read Houston.
--   * parcel_id_county(municipality name) — 'Houston County' for Houston County,
--     Warner Robins, Perry, Centerville (same list as the adapter's `matches`).
--     Warner Robins (7.8%) and Perry (6.5%) straddle Peach; a Peach-side parcel
--     has Peach's own format, so it simply doesn't parse.
--   * municipal_project_sync_parcel_numbers() passes the record's county.
--
-- Built from the LIVE definition (pg_get_functiondef, 2026-11-17), which includes
-- the Forsyth, Macon-Bibb, 5+6, Henry, Hall and Coweta forms.

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


-- The old one-argument signature: same output as before this migration, always.
CREATE OR REPLACE FUNCTION public.extract_parcel_numbers(p_text text)
 RETURNS text[]
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT public.extract_parcel_numbers(p_text, NULL::text);
$function$;

-- Municipality name -> the county whose scoped parcel-id shape applies. Only
-- counties with a scoped shape are listed; NULL means "unscoped shapes only".
CREATE OR REPLACE FUNCTION public.parcel_id_county(p_municipality_name text)
 RETURNS text
 LANGUAGE sql
 IMMUTABLE
AS $function$
  SELECT CASE
    WHEN btrim(p_municipality_name) ~* '^(houston county|warner robins|perry|centerville)$'
      THEN 'Houston County'
  END;
$function$;

-- Same as the live trigger, plus the county. The row's municipality is looked up
-- by boundary_municipality_id (staging) or municipality_id (both tables); to_jsonb
-- keeps one function valid for both tables' column sets.
CREATE OR REPLACE FUNCTION public.municipal_project_sync_parcel_numbers()
 RETURNS trigger
 LANGUAGE plpgsql
AS $function$
DECLARE
  v_found  text[];
  v_row    jsonb;
  v_name   text;
BEGIN
  -- A value supplied explicitly always wins; this only fills a gap.
  IF NEW.parcel_numbers IS NULL OR cardinality(NEW.parcel_numbers) = 0 THEN
    v_row := to_jsonb(NEW);
    IF v_row ? 'boundary_municipality_id' AND v_row->>'boundary_municipality_id' IS NOT NULL THEN
      SELECT b.name INTO v_name FROM public.boundary_municipality b
       WHERE b.id = (v_row->>'boundary_municipality_id')::uuid;
    END IF;
    IF v_name IS NULL AND v_row->>'municipality_id' IS NOT NULL THEN
      SELECT m.name INTO v_name FROM public.municipality m
       WHERE m.id = (v_row->>'municipality_id')::uuid;
    END IF;
    v_found := extract_parcel_numbers(NEW.parcel_boundary_notes, parcel_id_county(v_name));
    -- Never NULL: the column is NOT NULL and '{}' is how "none" is spelled.
    NEW.parcel_numbers := COALESCE(v_found, NEW.parcel_numbers, '{}'::text[]);
  END IF;
  RETURN NEW;
END $function$;

-- Grants: same as the existing parsers (20261113152028) — no PUBLIC, no anon.
REVOKE ALL ON FUNCTION public.extract_parcel_numbers(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extract_parcel_numbers(text, text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.extract_parcel_numbers(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extract_parcel_numbers(text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.parcel_id_county(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.parcel_id_county(text) TO authenticated, service_role;

-- Backfill Houston. Same rules as Henry/Hall/Coweta: superset-only, skip
-- boundaries that already came from a parcel fetch (fetch once), skip in-flight runs.
UPDATE public.municipal_project_staging st
   SET parcel_numbers = public.extract_parcel_numbers(st.parcel_boundary_notes, 'Houston County')
  FROM public.boundary_municipality b, public.research_run rr
 WHERE b.id = st.boundary_municipality_id
   AND rr.id = st.research_run_id
   AND rr.state NOT IN ('pending', 'running')
   AND public.parcel_id_county(b.name) = 'Houston County'
   AND st.geometry_source IS DISTINCT FROM 'parcel_fetch'
   AND public.extract_parcel_numbers(st.parcel_boundary_notes, 'Houston County') @> st.parcel_numbers
   AND public.extract_parcel_numbers(st.parcel_boundary_notes, 'Houston County') <> st.parcel_numbers;

UPDATE public.municipal_project p
   SET parcel_numbers = public.extract_parcel_numbers(p.parcel_boundary_notes, 'Houston County')
  FROM public.municipality mu
 WHERE mu.id = p.municipality_id
   AND public.parcel_id_county(mu.name) = 'Houston County'
   AND p.geometry_source IS DISTINCT FROM 'parcel_fetch'
   AND public.extract_parcel_numbers(p.parcel_boundary_notes, 'Houston County') @> p.parcel_numbers
   AND public.extract_parcel_numbers(p.parcel_boundary_notes, 'Houston County') <> p.parcel_numbers;
