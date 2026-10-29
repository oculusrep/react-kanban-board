-- NNN intake v1 cleanup. Apply ONLY after ovis-mcp is redeployed on the phase-1 path
-- (upsert_comp_listing); until then the deployed function still writes here.
-- listing_staging had 0 rows when this was written (2026-10-22); the guard refuses
-- to drop it if anything landed since.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM public.listing_staging) THEN
    RAISE EXCEPTION 'listing_staging is not empty — migrate its rows before dropping';
  END IF;
END $$;

DROP FUNCTION IF EXISTS public.upsert_listing_staging(text,text,text,text,numeric,numeric,text,text,text,text,text,uuid);
DROP FUNCTION IF EXISTS public.create_listing_va_task(uuid,text,date,text,text[],uuid);
DROP FUNCTION IF EXISTS public.promote_listing_to_comp(uuid);
DROP TABLE public.listing_staging;
-- normalize_listing_address stays: comp_property.address_norm is generated from it.
