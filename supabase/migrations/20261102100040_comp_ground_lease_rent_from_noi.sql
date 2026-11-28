-- Piece 3 follow-up (2026-11-02): a ground lease's NOI IS its ground rent, so the listing NOI → lease
-- rent fill (20261031100649) now covers ground_lease as well as bts_nnn. Multi-tenant and untyped
-- leases stay excluded. Rebuilt from the live pg_get_functiondef; only the lease_type test changes.

CREATE OR REPLACE FUNCTION public.comp_sync_lease_rent_from_noi(p_om_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v_noi numeric;
BEGIN
  SELECT e.noi INTO v_noi FROM comp_listing_event e
   WHERE e.operating_memorandum_id = p_om_id AND e.noi IS NOT NULL
   ORDER BY e.event_date DESC, e.created_at DESC LIMIT 1;
  IF v_noi IS NULL THEN RETURN; END IF;
  UPDATE lease_comp l
     SET annual_base_rent = v_noi,
         field_basis = l.field_basis || '{"annual_base_rent": "derived"}'::jsonb
    FROM operating_memorandum o
   WHERE o.id = p_om_id AND l.id = o.lease_comp_id
     AND l.lease_type IN ('bts_nnn', 'ground_lease')
     AND (l.annual_base_rent IS NULL OR l.field_basis->>'annual_base_rent' = 'derived')
     AND l.annual_base_rent IS DISTINCT FROM v_noi;
END;
$function$

;

REVOKE ALL ON FUNCTION public.comp_sync_lease_rent_from_noi(uuid) FROM PUBLIC, anon, authenticated;

-- Backfill: re-run the sync for every offering (no-op for leases already filled or stated).
DO $$
DECLARE v_before int; v_after int;
BEGIN
  SELECT count(*) INTO v_before FROM public.lease_comp WHERE lease_type = 'ground_lease' AND field_basis->>'annual_base_rent' = 'derived';
  PERFORM public.comp_sync_lease_rent_from_noi(o.id) FROM public.operating_memorandum o;
  SELECT count(*) INTO v_after FROM public.lease_comp WHERE lease_type = 'ground_lease' AND field_basis->>'annual_base_rent' = 'derived';
  RAISE NOTICE 'backfill: ground leases with rent derived from NOI: % (was %)', v_after, v_before;
END $$;
