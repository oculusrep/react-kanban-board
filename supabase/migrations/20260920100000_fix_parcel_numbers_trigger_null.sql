-- Fix: the parcel_numbers sync trigger could write NULL into a NOT NULL column.
--
-- Both municipal_project.parcel_numbers and municipal_project_staging.parcel_numbers
-- are NOT NULL DEFAULT '{}'. extract_parcel_numbers() returns NULL when it finds
-- nothing, and the trigger assigned that return value unconditionally — so any
-- insert whose notes contained no parcel id failed with
--   null value in column "parcel_numbers" violates not-null constraint
-- which is every ordinary insert, including approve_research_staging_rows.
--
-- Caught by testing the INSERT shape the approve RPC uses, before any user hit it.
-- The empty array, not NULL, is the "no parcel ids" value.

CREATE OR REPLACE FUNCTION municipal_project_sync_parcel_numbers()
RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE v_found text[];
BEGIN
  -- A value supplied explicitly always wins; this only fills a gap.
  IF NEW.parcel_numbers IS NULL OR cardinality(NEW.parcel_numbers) = 0 THEN
    v_found := extract_parcel_numbers(NEW.parcel_boundary_notes);
    -- Never NULL: the column is NOT NULL and '{}' is how "none" is spelled.
    NEW.parcel_numbers := COALESCE(v_found, NEW.parcel_numbers, '{}'::text[]);
  END IF;
  RETURN NEW;
END $$;

-- Repair anything the broken version nulled out. (The backfill in the previous
-- migration only ever SET non-null arrays, and the trigger fires on write, so
-- this is belt-and-braces — but a NOT NULL column holding NULL would be invisible
-- until the next write failed.)
UPDATE municipal_project_staging SET parcel_numbers = '{}'::text[] WHERE parcel_numbers IS NULL;
UPDATE municipal_project         SET parcel_numbers = '{}'::text[] WHERE parcel_numbers IS NULL;
