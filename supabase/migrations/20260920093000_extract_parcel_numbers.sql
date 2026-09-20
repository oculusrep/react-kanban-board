-- Populate parcel_numbers from the prose in parcel_boundary_notes.
--
-- The column has existed on both tables since the table was created and has never
-- been populated (0/346 staging, 16/352 committed). The ids are sitting in free
-- text: "Parcels 080-264, 080-265, 080-009; 40.45 acres".
--
-- Two things a naive regex gets wrong, both found on the real data before this was
-- written:
--
--  1. It matches things that are not parcel ids. "Plat Book 222 Pages 233-261"
--     yields 233-261; "Approx 312-318 acres" yields 312-318; the address
--     "11-165 Willow Bend Road" yields 11-165. So a match only counts inside a
--     semicolon-delimited clause that actually says parcel or PIN.
--
--  2. Parcel id FORMAT is per-county, exactly like the endpoints are. Forsyth is
--     "080-264" / "C37-002"; Macon-Bibb is "I008-0229" / "N101-0042"; Bibb tax
--     parcels are "09105 000001". One pattern cannot cover them, and a pattern
--     loose enough to try matches junk instead.
--
-- So: a keyword-scoped scan over a union of known county shapes. An unrecognized
-- format yields nothing rather than a wrong guess — parcel_numbers staying empty
-- is recoverable, a wrong parcel id silently geocodes to the wrong place.

CREATE OR REPLACE FUNCTION extract_parcel_numbers(p_text text)
RETURNS text[]
LANGUAGE plpgsql IMMUTABLE AS $$
DECLARE
  v_clause text;
  v_out    text[] := '{}';
  v_hit    text[];
  -- Known county parcel-id shapes. \y anchors stop these from biting into longer
  -- runs of digits (a zip+4, a year range, a plat page range).
  c_patterns text[] := ARRAY[
    '\y([A-Z]?[0-9]{2,3}-[0-9]{3})\y',      -- Forsyth: 080-264, C37-002
    '\y([A-Z][0-9]{3}-[0-9]{4})\y',         -- Macon-Bibb: I008-0229, N101-0042
    '\y([0-9]{5}[ ][0-9]{6})\y'             -- Bibb tax parcel: 09105 000001
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
END $$;

COMMENT ON FUNCTION extract_parcel_numbers(text) IS
  'Parcel ids out of parcel_boundary_notes prose. Keyword-scoped (only clauses '
  'naming a parcel/PIN) over a union of per-county id shapes. Returns NULL rather '
  'than guessing at an unrecognized format.';

-- ---- backfill both tables -------------------------------------------------
-- Only fills rows that have nothing; never overwrites an id already recorded.
-- The 16 committed rows that already carry parcel_numbers came from a CSV import
-- in yet another format ("WN03 001", "XX 062 007 & XX 062 007A", ampersands and
-- all). They are left exactly as they are: they are someone's real data, and
-- re-deriving them from prose would be a guess dressed up as a cleanup.
UPDATE municipal_project_staging
   SET parcel_numbers = extract_parcel_numbers(parcel_boundary_notes)
 WHERE (parcel_numbers IS NULL OR cardinality(parcel_numbers) = 0)
   AND extract_parcel_numbers(parcel_boundary_notes) IS NOT NULL;

UPDATE municipal_project
   SET parcel_numbers = extract_parcel_numbers(parcel_boundary_notes)
 WHERE (parcel_numbers IS NULL OR cardinality(parcel_numbers) = 0)
   AND extract_parcel_numbers(parcel_boundary_notes) IS NOT NULL;

-- ---- keep it populated going forward --------------------------------------
-- The agent does not emit parcel_numbers, and asking it to is a separate change
-- to the prompt contract. Until then a trigger keeps the column in step with the
-- prose on every insert/update, so no new row arrives with ids only in text.
CREATE OR REPLACE FUNCTION municipal_project_sync_parcel_numbers()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- A value supplied explicitly always wins; this only fills a gap.
  IF NEW.parcel_numbers IS NULL OR cardinality(NEW.parcel_numbers) = 0 THEN
    NEW.parcel_numbers := extract_parcel_numbers(NEW.parcel_boundary_notes);
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS municipal_project_staging_parcel_numbers ON municipal_project_staging;
CREATE TRIGGER municipal_project_staging_parcel_numbers
  BEFORE INSERT OR UPDATE OF parcel_boundary_notes, parcel_numbers
  ON municipal_project_staging
  FOR EACH ROW EXECUTE FUNCTION municipal_project_sync_parcel_numbers();

DROP TRIGGER IF EXISTS municipal_project_parcel_numbers ON municipal_project;
CREATE TRIGGER municipal_project_parcel_numbers
  BEFORE INSERT OR UPDATE OF parcel_boundary_notes, parcel_numbers
  ON municipal_project
  FOR EACH ROW EXECUTE FUNCTION municipal_project_sync_parcel_numbers();
