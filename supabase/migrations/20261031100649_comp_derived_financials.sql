-- Derived listing financials (docs/NNN_LISTING_LEASE_FINANCIALS_PLAN.md §3).
--
-- Any two of price / cap / NOI give the third:  NOI = price × cap / 100  (cap_rate is a PERCENT).
-- The derivation lives in a BEFORE INSERT trigger on comp_listing_event, so the MCP sweep,
-- the UI's Record-a-change and this backfill share one implementation.
--
-- field_basis (jsonb, per row) records which figures were computed rather than stated:
--   {"noi": "derived"}. A missing key = stated by the caller (or legacy/unknown).
-- Callers only ever send stated values; derivation never overwrites one.
--
-- NOI → lease rent: for a bts_nnn lease (absolute NNN / NNN; NOI is the rent), the listing's
-- latest NOI fills lease_comp.annual_base_rent when it is empty or was itself derived, and is
-- marked {"annual_base_rent": "derived"}. Ground / multi-tenant / unknown leases are left alone.

ALTER TABLE public.comp_listing_event
  ADD COLUMN IF NOT EXISTS field_basis jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.lease_comp
  ADD COLUMN IF NOT EXISTS field_basis jsonb NOT NULL DEFAULT '{}'::jsonb;

-- Pure: fill the missing one of (price, cap %, NOI) when exactly two are known and positive.
-- `derived` names the filled field, or is NULL when nothing could be (or needed to be) derived.
CREATE OR REPLACE FUNCTION public.comp_derive_listing_figures(
  p_price numeric, p_cap numeric, p_noi numeric,
  OUT price numeric, OUT cap_rate numeric, OUT noi numeric, OUT derived text)
LANGUAGE plpgsql IMMUTABLE
SET search_path = public, pg_temp
AS $$
BEGIN
  price := p_price; cap_rate := p_cap; noi := p_noi; derived := NULL;
  IF p_noi IS NULL AND p_price > 0 AND p_cap > 0 THEN
    noi := round(p_price * p_cap / 100, 2); derived := 'noi';
  ELSIF p_cap IS NULL AND p_price > 0 AND p_noi > 0 THEN
    cap_rate := round(p_noi / p_price * 100, 2); derived := 'cap_rate';
  ELSIF p_price IS NULL AND p_cap > 0 AND p_noi > 0 THEN
    price := round(p_noi / (p_cap / 100), 0); derived := 'price';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.comp_listing_event_derive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE d record;
BEGIN
  -- A closed event carries no figures (sale_comp holds them; CHECK constraint).
  IF NEW.event_type = 'closed' THEN RETURN NEW; END IF;
  d := public.comp_derive_listing_figures(NEW.price, NEW.cap_rate, NEW.noi);
  IF d.derived IS NOT NULL THEN
    NEW.price := d.price; NEW.cap_rate := d.cap_rate; NEW.noi := d.noi;
    NEW.field_basis := coalesce(NEW.field_basis, '{}'::jsonb) || jsonb_build_object(d.derived, 'derived');
  END IF;
  RETURN NEW;
END;
$$;

-- Latest NOI of an offering → its bts_nnn lease's annual_base_rent (empty or derived only).
CREATE OR REPLACE FUNCTION public.comp_sync_lease_rent_from_noi(p_om_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
     AND l.lease_type = 'bts_nnn'
     AND (l.annual_base_rent IS NULL OR l.field_basis->>'annual_base_rent' = 'derived')
     AND l.annual_base_rent IS DISTINCT FROM v_noi;
END;
$$;

CREATE OR REPLACE FUNCTION public.comp_listing_event_rent_sync()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.noi IS NOT NULL THEN PERFORM public.comp_sync_lease_rent_from_noi(NEW.operating_memorandum_id); END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS comp_listing_event_derive ON public.comp_listing_event;
CREATE TRIGGER comp_listing_event_derive
  BEFORE INSERT ON public.comp_listing_event
  FOR EACH ROW EXECUTE FUNCTION public.comp_listing_event_derive();

DROP TRIGGER IF EXISTS comp_listing_event_rent_sync ON public.comp_listing_event;
CREATE TRIGGER comp_listing_event_rent_sync
  AFTER INSERT ON public.comp_listing_event
  FOR EACH ROW EXECUTE FUNCTION public.comp_listing_event_rent_sync();

-- Grants: internal helpers, reached only through the triggers (which run as definer).
REVOKE ALL ON FUNCTION public.comp_derive_listing_figures(numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comp_listing_event_derive() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comp_sync_lease_rent_from_noi(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comp_listing_event_rent_sync() FROM PUBLIC, anon, authenticated;

-- Backfill existing events (only rows with exactly two of the three), then lease rent.
DO $$
DECLARE v_noi int; v_cap int; v_price int; v_rent int;
BEGIN
  WITH d AS (
    SELECT e.id, (public.comp_derive_listing_figures(e.price, e.cap_rate, e.noi)).*
      FROM public.comp_listing_event e WHERE e.event_type <> 'closed'
  ), u AS (
    UPDATE public.comp_listing_event e
       SET price = d.price, cap_rate = d.cap_rate, noi = d.noi,
           field_basis = e.field_basis || jsonb_build_object(d.derived, 'derived')
      FROM d WHERE d.id = e.id AND d.derived IS NOT NULL
    RETURNING d.derived
  )
  SELECT count(*) FILTER (WHERE derived = 'noi'), count(*) FILTER (WHERE derived = 'cap_rate'),
         count(*) FILTER (WHERE derived = 'price')
    INTO v_noi, v_cap, v_price FROM u;
  RAISE NOTICE 'backfill: events given NOI %, cap %, price %', v_noi, v_cap, v_price;

  PERFORM public.comp_sync_lease_rent_from_noi(o.id) FROM public.operating_memorandum o;
  SELECT count(*) INTO v_rent FROM public.lease_comp WHERE field_basis->>'annual_base_rent' = 'derived';
  RAISE NOTICE 'backfill: bts_nnn leases with rent derived from NOI: %', v_rent;
END $$;
