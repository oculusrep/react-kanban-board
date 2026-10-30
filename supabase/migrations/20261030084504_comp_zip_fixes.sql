-- ZIP fixes flagged in the duplicate review (docs/NNN_LISTING_INTAKE_SPEC_v2.md §12), approved 2026-10-30.
-- Data only. Each update fires only from the value it is correcting, so a re-run or a later
-- hand edit is left alone. Comp audit columns are AUTH ids.

DO $$
DECLARE
  v_mike_auth uuid := 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';
  v_n integer;
BEGIN
  -- Dutch Bros Macon, 5781 Zebulon Rd: 31220 → 31210.
  UPDATE public.comp_property SET zip = '31210', updated_by_id = v_mike_auth
   WHERE id = 'aa444493-9000-4f24-90e3-919fa26d5c08' AND zip = '31220';
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Dutch Bros ZIP updated: %', v_n;

  -- Chipotle Hoschton, 3699 Hwy 53: no ZIP → 30548.
  UPDATE public.comp_property SET zip = '30548', updated_by_id = v_mike_auth
   WHERE id = '6be046ec-2453-4bd5-867d-7aca9575bb8d' AND zip IS NULL;
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RAISE NOTICE 'Hoschton ZIP updated: %', v_n;
END $$;
