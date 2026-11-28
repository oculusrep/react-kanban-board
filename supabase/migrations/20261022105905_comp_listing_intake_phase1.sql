-- NNN listing intake, phase 1 — listings feed the EXISTING comp database.
-- Spec: docs/NNN_LISTING_INTAKE_SPEC_v2.md (approved 2026-10-22).
--
--   * comp_property: review_status (existing rows = 'reviewed'), address_norm (dedupe key)
--   * lease_comp: guarantor_type, guarantor_name
--   * operating_memorandum (= the offering): listing_status, first/last seen, as-listed
--     snapshots, lease_comp_id (lease in place)
--   * sale_comp: lease_comp_id (lease in place)
--   * comp_listing_event: append-only price/status history (the one new table, spec §8.1)
--   * RPCs: upsert_comp_listing, create_comp_va_task (service_role, called by ovis-mcp);
--           record_listing_close, listing_activity (authenticated + service_role)
--   * View: comp_listing_facts
--
-- listing_staging (v1, 0 rows) is dropped by a SEPARATE migration once the redeployed
-- ovis-mcp is live on this path.
--
-- Audit columns on comp tables reference auth.users(id): every write here uses an AUTH
-- user id (auth.uid() or the OAuth caller's id), never "user".id. task.* audit columns
-- reference "user"(id) and are mapped via "user".auth_user_id.

-- ============================================================================
-- 1. Columns on existing tables
-- ============================================================================

ALTER TABLE public.comp_property
  ADD COLUMN review_status text NOT NULL DEFAULT 'reviewed'
    CHECK (review_status IN ('pending_review','reviewed','rejected')),
  ADD COLUMN address_norm text
    GENERATED ALWAYS AS (public.normalize_listing_address(address, city, state)) STORED;

COMMENT ON COLUMN public.comp_property.review_status IS
  'pending_review = created by the listing intake, not yet reviewed (hidden from the comp layer by default); rejected = hidden, kept so the sweep never re-proposes it.';
COMMENT ON COLUMN public.comp_property.address_norm IS
  'Dedupe key: normalize_listing_address(address, city, state). Indexed, not unique (existing same-address rows).';

CREATE INDEX idx_comp_property_address_norm ON public.comp_property (address_norm);
CREATE INDEX idx_comp_property_review_status ON public.comp_property (review_status)
  WHERE review_status <> 'reviewed';

ALTER TABLE public.lease_comp
  ADD COLUMN guarantor_type text CHECK (guarantor_type IN ('corporate','franchisee','personal','other')),
  ADD COLUMN guarantor_name text;

ALTER TABLE public.operating_memorandum
  ADD COLUMN listing_status text NOT NULL DEFAULT 'active'
    CHECK (listing_status IN ('active','under_contract','off_market','sold')),
  ADD COLUMN first_seen_at timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN last_seen_at  timestamptz NOT NULL DEFAULT now(),
  ADD COLUMN listed_term_remaining text,
  ADD COLUMN listed_lease_type text,
  ADD COLUMN lease_comp_id uuid REFERENCES public.lease_comp(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.operating_memorandum.listing_status IS
  'Maintained from comp_listing_event (latest status-bearing event). Do not write directly.';
COMMENT ON COLUMN public.operating_memorandum.asking_price IS
  'Current ask. Mirrors the latest ask event in comp_listing_event; a direct edit records a price_change event.';
COMMENT ON COLUMN public.operating_memorandum.lease_comp_id IS 'Lease in place for this offering.';

ALTER TABLE public.sale_comp
  ADD COLUMN lease_comp_id uuid REFERENCES public.lease_comp(id) ON DELETE SET NULL;
COMMENT ON COLUMN public.sale_comp.lease_comp_id IS 'Lease in place at the sale (drives cap-by-tenant/guarantor/term).';

CREATE INDEX idx_operating_memorandum_lease ON public.operating_memorandum (lease_comp_id);
CREATE INDEX idx_sale_comp_lease ON public.sale_comp (lease_comp_id);

-- Backfill: existing offerings' seen-window = their record dates.
UPDATE public.operating_memorandum SET first_seen_at = created_at, last_seen_at = updated_at;

-- Backfill: lease in place where the property has exactly one lease (unambiguous only).
UPDATE public.sale_comp s SET lease_comp_id = l.id
FROM public.lease_comp l
WHERE l.comp_property_id = s.comp_property_id
  AND (SELECT count(*) FROM public.lease_comp x WHERE x.comp_property_id = s.comp_property_id) = 1;
UPDATE public.operating_memorandum o SET lease_comp_id = l.id
FROM public.lease_comp l
WHERE l.comp_property_id = o.comp_property_id
  AND (SELECT count(*) FROM public.lease_comp x WHERE x.comp_property_id = o.comp_property_id) = 1;

-- ============================================================================
-- 2. comp_listing_event — append-only pricing/status history
-- ============================================================================

CREATE TABLE public.comp_listing_event (
  id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_memorandum_id uuid NOT NULL REFERENCES public.operating_memorandum(id) ON DELETE CASCADE,
  event_date              date NOT NULL DEFAULT ((now() AT TIME ZONE 'America/New_York')::date),
  event_type              text NOT NULL CHECK (event_type IN
                            ('listed','price_change','cap_change','under_contract',
                             'back_on_market','off_market','closed','relisted')),
  price                   numeric,
  cap_rate                numeric,          -- percent, 6.25 = 6.25%
  noi                     numeric,
  sale_comp_id            uuid REFERENCES public.sale_comp(id) ON DELETE SET NULL,
  source_type             text CHECK (source_type IN ('manual','costar','crexi','om','ai_agent','broker','pt61')),
  source_url              text,
  verification_method     text CHECK (verification_method IN ('pt61','broker_confirm','om_verified')),
  recorded_by_kind        text NOT NULL DEFAULT 'user' CHECK (recorded_by_kind IN ('sweep','user')),
  recorded_by_id          uuid DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE SET NULL,
  note                    text,
  -- clock_timestamp, not now(): several events in one transaction must still order.
  created_at              timestamptz NOT NULL DEFAULT clock_timestamp(),
  -- Closed figures live on sale_comp (one source of truth); a closed event must be
  -- verified and point at it, and carries no price of its own.
  CONSTRAINT comp_listing_event_closed_shape CHECK (
    (event_type = 'closed') = (sale_comp_id IS NOT NULL)
    AND (event_type <> 'closed' OR (verification_method IS NOT NULL AND price IS NULL AND cap_rate IS NULL AND noi IS NULL))
  )
);

COMMENT ON TABLE public.comp_listing_event IS
  'Every price/status change of an offering (operating_memorandum), first listing to close. Append-only for users. Spec §8.';

CREATE INDEX idx_comp_listing_event_om ON public.comp_listing_event (operating_memorandum_id, event_date DESC, created_at DESC);
CREATE INDEX idx_comp_listing_event_feed ON public.comp_listing_event (event_type, created_at);

ALTER TABLE public.comp_listing_event ENABLE ROW LEVEL SECURITY;
CREATE POLICY comp_listing_event_internal_select ON public.comp_listing_event
  FOR SELECT TO authenticated USING ((SELECT public.is_internal_user()));
CREATE POLICY comp_listing_event_internal_insert ON public.comp_listing_event
  FOR INSERT TO authenticated WITH CHECK ((SELECT public.is_internal_user()));

-- Grants: don't inherit the defaults, state what the app uses. Users append; no UPDATE/DELETE.
REVOKE ALL ON public.comp_listing_event FROM anon, authenticated;
GRANT SELECT, INSERT ON public.comp_listing_event TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comp_listing_event TO service_role;

-- ============================================================================
-- 3. Sync: events → offering mirror (ask, status) → property availability,
--    and direct OM asking edits → events
-- ============================================================================

CREATE OR REPLACE FUNCTION public.refresh_offering_from_events(p_om_id uuid)
RETURNS void
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_price  numeric;
  v_cap    numeric;
  v_status text;
  v_prop   uuid;
BEGIN
  SELECT price INTO v_price FROM comp_listing_event
   WHERE operating_memorandum_id = p_om_id AND price IS NOT NULL
     AND event_type IN ('listed','relisted','price_change','cap_change','back_on_market')
   ORDER BY event_date DESC, created_at DESC LIMIT 1;
  SELECT cap_rate INTO v_cap FROM comp_listing_event
   WHERE operating_memorandum_id = p_om_id AND cap_rate IS NOT NULL
     AND event_type IN ('listed','relisted','price_change','cap_change','back_on_market')
   ORDER BY event_date DESC, created_at DESC LIMIT 1;
  -- price/cap changes don't move status; only status-bearing events do. A close is
  -- terminal: it is usually recorded after the fact with an earlier event_date (PT-61
  -- lag), so later-dated sweep events must not outrank it.
  IF EXISTS (SELECT 1 FROM comp_listing_event WHERE operating_memorandum_id = p_om_id AND event_type = 'closed') THEN
    v_status := 'sold';
  ELSE
  SELECT CASE event_type
           WHEN 'under_contract' THEN 'under_contract'
           WHEN 'off_market'     THEN 'off_market'
           WHEN 'closed'         THEN 'sold'
           ELSE 'active' END
    INTO v_status
    FROM comp_listing_event
   WHERE operating_memorandum_id = p_om_id
     AND event_type IN ('listed','relisted','back_on_market','under_contract','off_market','closed')
   ORDER BY event_date DESC, created_at DESC LIMIT 1;
  END IF;

  PERFORM set_config('ovis.listing_event_sync', 'on', true);
  UPDATE operating_memorandum
     SET asking_price    = COALESCE(v_price, asking_price),
         asking_cap_rate = COALESCE(v_cap, asking_cap_rate),
         listing_status  = COALESCE(v_status, listing_status)
   WHERE id = p_om_id
  RETURNING comp_property_id INTO v_prop;
  PERFORM set_config('ovis.listing_event_sync', 'off', true);

  -- Amber "on market" pin: on while any offering on the property is active.
  -- Only touched for properties that have offerings, so manual leasing
  -- availability flags on other comps are left alone.
  UPDATE comp_property cp
     SET is_available = EXISTS (SELECT 1 FROM operating_memorandum o
                                 WHERE o.comp_property_id = cp.id AND o.listing_status = 'active')
   WHERE cp.id = v_prop
     AND cp.is_available IS DISTINCT FROM EXISTS (SELECT 1 FROM operating_memorandum o
                                 WHERE o.comp_property_id = cp.id AND o.listing_status = 'active');
END;
$$;

-- DEFINER so the recompute (which authenticated can't EXECUTE directly) runs for any
-- internal user's insert; it only derives mirrors from rows already in the log.
CREATE OR REPLACE FUNCTION public.comp_listing_event_after_insert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public.refresh_offering_from_events(NEW.operating_memorandum_id);
  RETURN NULL;
END;
$$;

CREATE TRIGGER comp_listing_event_sync
  AFTER INSERT ON public.comp_listing_event
  FOR EACH ROW EXECUTE FUNCTION public.comp_listing_event_after_insert();

-- A direct edit of the ask (OM tab, CompDetailSlideout) is recorded as history, so
-- the existing UI keeps working and nothing bypasses the event log.
CREATE OR REPLACE FUNCTION public.operating_memorandum_ask_to_event()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
DECLARE
  v_has_events boolean;
BEGIN
  IF current_setting('ovis.listing_event_sync', true) = 'on' THEN
    RETURN NULL;
  END IF;
  IF TG_OP = 'UPDATE'
     AND NEW.asking_price IS NOT DISTINCT FROM OLD.asking_price
     AND NEW.asking_cap_rate IS NOT DISTINCT FROM OLD.asking_cap_rate THEN
    RETURN NULL;
  END IF;
  IF NEW.asking_price IS NULL AND NEW.asking_cap_rate IS NULL THEN
    RETURN NULL;
  END IF;

  SELECT EXISTS (SELECT 1 FROM comp_listing_event WHERE operating_memorandum_id = NEW.id) INTO v_has_events;

  INSERT INTO comp_listing_event (operating_memorandum_id, event_date, event_type, price, cap_rate,
                                  source_type, source_url, recorded_by_kind, note)
  VALUES (
    NEW.id,
    CASE WHEN NOT v_has_events THEN COALESCE(NEW.list_date, (now() AT TIME ZONE 'America/New_York')::date)
         ELSE (now() AT TIME ZONE 'America/New_York')::date END,
    CASE WHEN NOT v_has_events THEN 'listed'
         WHEN TG_OP = 'UPDATE' AND NEW.asking_price IS DISTINCT FROM OLD.asking_price THEN 'price_change'
         ELSE 'cap_change' END,
    NEW.asking_price, NEW.asking_cap_rate,
    NEW.source_type, NEW.source_url, 'user',
    'Recorded from an edit of the OM record'
  );
  RETURN NULL;
END;
$$;

CREATE TRIGGER operating_memorandum_ask_history
  AFTER INSERT OR UPDATE OF asking_price, asking_cap_rate ON public.operating_memorandum
  FOR EACH ROW EXECUTE FUNCTION public.operating_memorandum_ask_to_event();

REVOKE ALL ON FUNCTION public.refresh_offering_from_events(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comp_listing_event_after_insert() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.operating_memorandum_ask_to_event() FROM PUBLIC, anon, authenticated;

-- Backfill: one 'listed' event per existing offering that has an ask. The sync trigger
-- would set is_available from the new status; existing pins keep their current flag.
CREATE TEMP TABLE _avail_before ON COMMIT DROP AS SELECT id, is_available FROM public.comp_property;
INSERT INTO public.comp_listing_event (operating_memorandum_id, event_date, event_type, price, cap_rate,
                                       source_type, source_url, recorded_by_kind, recorded_by_id, note, created_at)
SELECT o.id, COALESCE(o.list_date, (o.created_at AT TIME ZONE 'America/New_York')::date), 'listed',
       o.asking_price, o.asking_cap_rate, o.source_type, o.source_url, 'user', o.created_by_id,
       'Backfilled from the OM record at history launch', o.created_at
FROM public.operating_memorandum o
WHERE o.asking_price IS NOT NULL OR o.asking_cap_rate IS NOT NULL;
UPDATE public.comp_property cp SET is_available = b.is_available
FROM _avail_before b WHERE b.id = cp.id AND cp.is_available IS DISTINCT FROM b.is_available;

-- ============================================================================
-- 4. upsert_comp_listing — the intake write path (ovis-mcp, service_role)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.upsert_comp_listing(
  p_tenant text, p_address text, p_city text, p_state text, p_zip text, p_apn text,
  p_price numeric, p_cap_rate numeric, p_noi numeric,
  p_lease_type text, p_term_left text, p_guarantor_type text, p_guarantor_name text,
  p_source text, p_source_url text, p_list_date date, p_broker_name text, p_brokerage text,
  p_acting_auth_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_state   text := upper(COALESCE(NULLIF(btrim(p_state), ''), 'GA'));
  v_norm    text := public.normalize_listing_address(p_address, p_city, v_state);
  v_apn     text := NULLIF(upper(regexp_replace(COALESCE(p_apn, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_tenant  text := NULLIF(btrim(p_tenant), '');
  v_src     text;
  v_lt      text;
  v_prop    public.comp_property%ROWTYPE;
  v_nmatch  integer := 0;
  v_new_prop boolean := false;
  v_lease   uuid;
  v_om      public.operating_memorandum%ROWTYPE;
  v_new_om  boolean := false;
  v_changed boolean := false;
  v_old     jsonb;
  v_new     jsonb;
  v_etype   text;
  v_brand   uuid;
BEGIN
  IF v_norm IS NULL THEN RAISE EXCEPTION 'address is required'; END IF;
  -- Serialize sightings of one address so two concurrent runs can't both insert it.
  PERFORM pg_advisory_xact_lock(hashtext('comp_listing:' || v_norm));

  v_src := CASE
    WHEN p_source ~* 'crexi' THEN 'crexi'
    WHEN p_source ~* 'costar|loopnet' THEN 'costar'
    ELSE 'ai_agent' END;
  v_lt := CASE
    WHEN p_lease_type ~* 'ground' THEN 'ground_lease'
    WHEN p_lease_type ~* '(^|[^n])nn([^n]|$)' THEN 'bts_nn'
    WHEN p_lease_type ~* 'nnn|abs' THEN 'bts_nnn'
    ELSE NULL END;

  -- ---- match (spec §5): APN first, then address_norm; best of several wins ----
  IF v_apn IS NOT NULL THEN
    SELECT count(*) INTO v_nmatch FROM comp_property
     WHERE upper(regexp_replace(COALESCE(parcel_id, ''), '[^A-Za-z0-9]', '', 'g')) = v_apn AND upper(state) = v_state;
  END IF;
  IF v_nmatch > 0 THEN
    SELECT * INTO v_prop FROM comp_property
     WHERE upper(regexp_replace(COALESCE(parcel_id, ''), '[^A-Za-z0-9]', '', 'g')) = v_apn AND upper(state) = v_state
     ORDER BY array_position(ARRAY['reviewed','pending_review','rejected'], review_status),
              array_position(ARRAY['verified','reported','unverified'], confidence), created_at
     LIMIT 1;
  ELSE
    SELECT count(*) INTO v_nmatch FROM comp_property WHERE address_norm = v_norm;
    IF v_nmatch > 0 THEN
      SELECT * INTO v_prop FROM comp_property WHERE address_norm = v_norm
       ORDER BY array_position(ARRAY['reviewed','pending_review','rejected'], review_status),
                array_position(ARRAY['verified','reported','unverified'], confidence), created_at
       LIMIT 1;
    END IF;
  END IF;

  -- ---- rejected: remember, don't resurrect ----
  IF v_nmatch > 0 AND v_prop.review_status = 'rejected' THEN
    UPDATE operating_memorandum SET last_seen_at = now()
     WHERE id = (SELECT id FROM operating_memorandum WHERE comp_property_id = v_prop.id
                  ORDER BY first_seen_at DESC LIMIT 1);
    RETURN jsonb_build_object('comp_property_id', v_prop.id, 'skipped', 'rejected',
                              'is_new', false, 'changed', false, 'review_status', 'rejected');
  END IF;

  -- ---- property ----
  IF v_nmatch = 0 THEN
    INSERT INTO comp_property (name, address, city, state, zip, parcel_id, source_type, source_url,
      source_reference, source_captured_at, confidence, is_available, review_status,
      created_by_id, updated_by_id)
    VALUES (v_tenant, btrim(p_address), NULLIF(btrim(p_city), ''), v_state, NULLIF(btrim(p_zip), ''),
      NULLIF(btrim(p_apn), ''), v_src, NULLIF(btrim(p_source_url), ''), NULLIF(btrim(p_source), ''), now(),
      'reported', true, 'pending_review', p_acting_auth_id, p_acting_auth_id)
    RETURNING * INTO v_prop;
    v_new_prop := true;
  ELSIF v_prop.parcel_id IS NULL AND p_apn IS NOT NULL THEN
    UPDATE comp_property SET parcel_id = btrim(p_apn) WHERE id = v_prop.id;
  END IF;

  -- ---- lease in place: same tenant, else the property's only lease ----
  IF v_tenant IS NOT NULL THEN
    SELECT id INTO v_lease FROM lease_comp
     WHERE comp_property_id = v_prop.id AND lower(btrim(tenant_name)) = lower(v_tenant)
     ORDER BY created_at LIMIT 1;
  END IF;
  IF v_lease IS NULL AND (SELECT count(*) FROM lease_comp WHERE comp_property_id = v_prop.id) = 1 THEN
    SELECT id INTO v_lease FROM lease_comp WHERE comp_property_id = v_prop.id;
  END IF;
  IF v_lease IS NULL AND v_tenant IS NOT NULL THEN
    SELECT id INTO v_brand FROM merchant_brand WHERE normalized_name = lower(v_tenant);
    INSERT INTO lease_comp (comp_property_id, tenant_name, merchant_brand_id, lease_type,
      guarantor_type, guarantor_name, source_type, source_url, source_reference, source_captured_at,
      confidence, created_by_id, updated_by_id)
    VALUES (v_prop.id, v_tenant, v_brand, v_lt,
      CASE WHEN lower(btrim(p_guarantor_type)) IN ('corporate','franchisee','personal','other')
           THEN lower(btrim(p_guarantor_type)) END,
      NULLIF(btrim(p_guarantor_name), ''), v_src, NULLIF(btrim(p_source_url), ''),
      NULLIF(btrim(p_source), ''), now(), 'reported', p_acting_auth_id, p_acting_auth_id)
    RETURNING id INTO v_lease;
  ELSIF v_lease IS NOT NULL THEN
    -- Fill, never overwrite: the VA's confirmed guarantor beats a listing's claim.
    UPDATE lease_comp SET
      guarantor_type = COALESCE(guarantor_type,
        CASE WHEN lower(btrim(p_guarantor_type)) IN ('corporate','franchisee','personal','other')
             THEN lower(btrim(p_guarantor_type)) END),
      guarantor_name = COALESCE(guarantor_name, NULLIF(btrim(p_guarantor_name), ''))
    WHERE id = v_lease AND (guarantor_type IS NULL OR guarantor_name IS NULL);
  END IF;

  -- ---- offering: the open (not sold) one, newest first ----
  SELECT * INTO v_om FROM operating_memorandum
   WHERE comp_property_id = v_prop.id AND listing_status <> 'sold'
   ORDER BY first_seen_at DESC LIMIT 1;

  -- Closed recently and still posted: listing sites lag a close by weeks. Don't
  -- open a 'relisted' offering off a stale post; just note the sighting.
  IF v_om.id IS NULL AND EXISTS (
       SELECT 1 FROM operating_memorandum o JOIN sale_comp s ON s.id = o.sale_comp_id
        WHERE o.comp_property_id = v_prop.id
          AND s.sale_date >= (now() AT TIME ZONE 'America/New_York')::date - 90) THEN
    UPDATE operating_memorandum SET last_seen_at = now()
     WHERE id = (SELECT id FROM operating_memorandum WHERE comp_property_id = v_prop.id
                  ORDER BY first_seen_at DESC LIMIT 1);
    RETURN jsonb_build_object('comp_property_id', v_prop.id, 'skipped', 'recently_closed',
                              'is_new', false, 'changed', false, 'review_status', v_prop.review_status);
  END IF;

  IF v_om.id IS NULL THEN
    v_etype := CASE WHEN EXISTS (SELECT 1 FROM operating_memorandum WHERE comp_property_id = v_prop.id)
                    THEN 'relisted' ELSE 'listed' END;
    INSERT INTO operating_memorandum (comp_property_id, lease_comp_id, title, broker_name, brokerage,
      list_date, listed_term_remaining, listed_lease_type, source_type, source_url, source_reference,
      source_captured_at, confidence, created_by_id, updated_by_id)
    VALUES (v_prop.id, v_lease, concat_ws(' — ', v_tenant, btrim(p_address)),
      NULLIF(btrim(p_broker_name), ''), NULLIF(btrim(p_brokerage), ''), p_list_date,
      NULLIF(btrim(p_term_left), ''), NULLIF(btrim(p_lease_type), ''), v_src,
      NULLIF(btrim(p_source_url), ''), NULLIF(btrim(p_source), ''), now(), 'reported',
      p_acting_auth_id, p_acting_auth_id)
    RETURNING * INTO v_om;
    INSERT INTO comp_listing_event (operating_memorandum_id, event_date, event_type, price, cap_rate, noi,
      source_type, source_url, recorded_by_kind, recorded_by_id)
    VALUES (v_om.id, COALESCE(p_list_date, (now() AT TIME ZONE 'America/New_York')::date), v_etype,
      p_price, p_cap_rate, p_noi, v_src, NULLIF(btrim(p_source_url), ''), 'sweep', p_acting_auth_id);
    v_new_om := true;
    v_new := jsonb_build_object('price', p_price, 'cap_rate', p_cap_rate);
  ELSE
    UPDATE operating_memorandum SET
      last_seen_at = now(),
      lease_comp_id = COALESCE(lease_comp_id, v_lease),
      listed_term_remaining = COALESCE(NULLIF(btrim(p_term_left), ''), listed_term_remaining),
      listed_lease_type = COALESCE(listed_lease_type, NULLIF(btrim(p_lease_type), '')),
      source_url = COALESCE(source_url, NULLIF(btrim(p_source_url), ''))
    WHERE id = v_om.id;

    v_old := jsonb_build_object('price', v_om.asking_price, 'cap_rate', v_om.asking_cap_rate);
    v_etype := CASE
      -- Off market and seen listed again → back on market. Under contract is NOT
      -- flipped back: contracted listings often stay posted, and the sweep can't tell.
      WHEN v_om.listing_status = 'off_market' THEN 'back_on_market'
      WHEN p_price IS NOT NULL AND p_price IS DISTINCT FROM v_om.asking_price THEN 'price_change'
      WHEN p_cap_rate IS NOT NULL AND p_cap_rate IS DISTINCT FROM v_om.asking_cap_rate THEN 'cap_change'
      ELSE NULL END;
    IF v_etype IS NOT NULL THEN
      INSERT INTO comp_listing_event (operating_memorandum_id, event_type, price, cap_rate, noi,
        source_type, source_url, recorded_by_kind, recorded_by_id)
      VALUES (v_om.id, v_etype, COALESCE(p_price, v_om.asking_price), COALESCE(p_cap_rate, v_om.asking_cap_rate),
        p_noi, v_src, NULLIF(btrim(p_source_url), ''), 'sweep', p_acting_auth_id);
      v_changed := true;
      v_new := jsonb_build_object('price', COALESCE(p_price, v_om.asking_price),
                                  'cap_rate', COALESCE(p_cap_rate, v_om.asking_cap_rate));
    END IF;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'comp_property_id', v_prop.id,
    'listing_id', v_om.id,
    'is_new', v_new_om,
    'is_new_property', v_new_prop,
    'matched_existing_comp', NOT v_new_prop,
    'review_status', (SELECT review_status FROM comp_property WHERE id = v_prop.id),
    'changed', v_changed,
    'event_type', v_etype,
    'old', CASE WHEN v_changed THEN v_old END,
    'new', CASE WHEN v_changed THEN v_new END,
    'ambiguous_match', CASE WHEN v_nmatch > 1 THEN true END,
    'address_norm', v_prop.address_norm,
    'needs_geocode', (SELECT latitude IS NULL AND verified_latitude IS NULL FROM comp_property WHERE id = v_prop.id)
  ));
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_comp_listing(text,text,text,text,text,text,numeric,numeric,numeric,text,text,text,text,text,text,date,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_comp_listing(text,text,text,text,text,text,numeric,numeric,numeric,text,text,text,text,text,text,date,text,text,uuid) TO service_role;

-- ============================================================================
-- 5. create_comp_va_task — one task in the assignee's Inbox, checklist in the body
-- ============================================================================

CREATE OR REPLACE FUNCTION public.create_comp_va_task(
  p_listing_id uuid,            -- operating_memorandum.id, or a comp_property.id (→ its newest offering)
  p_assignee_first_name text, p_due date, p_title text, p_checklist text[],
  p_acting_auth_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_om       public.operating_memorandum%ROWTYPE;
  v_prop     public.comp_property%ROWTYPE;
  v_tenant   text;
  v_assignee uuid;
  v_actor    uuid;
  v_n        integer;
  v_category uuid;
  v_due      date := COALESCE(p_due, (now() AT TIME ZONE 'America/New_York')::date);
  v_items    text[];
  v_task     uuid;
BEGIN
  SELECT * INTO v_om FROM operating_memorandum WHERE id = p_listing_id;
  IF v_om.id IS NULL THEN
    SELECT * INTO v_om FROM operating_memorandum WHERE comp_property_id = p_listing_id
     ORDER BY first_seen_at DESC LIMIT 1;
  END IF;
  IF v_om.id IS NULL THEN RAISE EXCEPTION 'no listing found for %', p_listing_id; END IF;
  SELECT * INTO v_prop FROM comp_property WHERE id = v_om.comp_property_id;
  SELECT tenant_name INTO v_tenant FROM lease_comp WHERE id = v_om.lease_comp_id;

  SELECT count(*), min(u.id::text)::uuid INTO v_n, v_assignee FROM "user" u
   WHERE lower(u.first_name) = lower(btrim(COALESCE(NULLIF(p_assignee_first_name, ''), 'Noree')))
     AND u.ovis_role IS NOT NULL;
  IF v_n = 0 THEN RAISE EXCEPTION 'no OVIS user with first name %', p_assignee_first_name;
  ELSIF v_n > 1 THEN RAISE EXCEPTION 'first name % matches % users; ambiguous', p_assignee_first_name, v_n;
  END IF;
  -- task audit columns reference "user"(id), not auth.users.
  SELECT id INTO v_actor FROM "user" WHERE auth_user_id = p_acting_auth_id;

  SELECT id INTO v_category FROM task_category WHERE name = 'other' AND scope = 'global';
  SELECT array_agg(btrim(x)) INTO v_items FROM unnest(COALESCE(p_checklist, '{}')) x WHERE btrim(x) <> '';

  INSERT INTO task (subject, description, status, category, category_id, owner_id,
                    assigned_by_id, created_by_id, due_at, is_inbox)
  VALUES (
    COALESCE(NULLIF(btrim(p_title), ''),
             'NNN listing — ' || COALESCE(v_tenant || ' — ', v_prop.name || ' — ', '') || COALESCE(v_prop.address, '')),
    concat_ws(E'\n',
      'NNN listing: ' || COALESCE(v_tenant, v_prop.name, '(tenant unknown)'),
      concat_ws(', ', v_prop.address, v_prop.city, v_prop.state),
      CASE WHEN v_om.asking_price IS NOT NULL THEN 'Asking: $' || to_char(v_om.asking_price, 'FM999,999,999') END,
      CASE WHEN v_om.asking_cap_rate IS NOT NULL THEN 'Cap: ' || v_om.asking_cap_rate || '%' END,
      CASE WHEN v_om.source_url IS NOT NULL THEN 'Source: ' || v_om.source_url END,
      'Listing: https://ovis.oculusrep.com/listings/review?listing=' || v_om.id,
      'Comp record: https://ovis.oculusrep.com/listings/review?comp=' || v_prop.id,
      CASE WHEN v_items IS NOT NULL THEN E'\nChecklist (enter results on the comp):\n'
        || array_to_string(ARRAY(SELECT '[ ] ' || i FROM unnest(v_items) i), E'\n') END
    ),
    'open', 'other', v_category, v_assignee, v_actor, v_actor,
    (v_due::timestamp) AT TIME ZONE 'America/New_York',
    v_assignee IS DISTINCT FROM v_actor   -- cross-user → assignee's Inbox (useTasks rule)
  )
  RETURNING id INTO v_task;

  RETURN jsonb_build_object('task_id', v_task, 'assignee_id', v_assignee, 'listing_id', v_om.id,
                            'comp_property_id', v_prop.id, 'due', v_due,
                            'checklist_items', COALESCE(array_length(v_items, 1), 0));
END;
$$;

REVOKE ALL ON FUNCTION public.create_comp_va_task(uuid,text,date,text,text[],uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_comp_va_task(uuid,text,date,text,text[],uuid) TO service_role;

-- ============================================================================
-- 6. record_listing_close — the ONLY path to closed figures (spec §8.2)
-- ============================================================================

CREATE OR REPLACE FUNCTION public.record_listing_close(
  p_listing_id uuid, p_close_date date, p_price numeric, p_cap_rate numeric, p_noi numeric,
  p_verification_method text, p_source_type text, p_source_url text,
  p_buyer text, p_seller text, p_note text
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_om   public.operating_memorandum%ROWTYPE;
  v_sale uuid;
BEGIN
  IF p_verification_method IS NULL OR p_verification_method NOT IN ('pt61','broker_confirm','om_verified') THEN
    RAISE EXCEPTION 'a close needs a verification method: pt61, broker_confirm or om_verified';
  END IF;
  IF p_price IS NULL OR p_close_date IS NULL THEN
    RAISE EXCEPTION 'a close needs a sale price and a close date';
  END IF;
  SELECT * INTO v_om FROM operating_memorandum WHERE id = p_listing_id FOR UPDATE;
  IF v_om.id IS NULL THEN RAISE EXCEPTION 'listing % not found or not visible', p_listing_id; END IF;
  IF v_om.sale_comp_id IS NOT NULL THEN RAISE EXCEPTION 'listing already closed'; END IF;

  -- Closed figures are entered here, never copied from the ask.
  INSERT INTO sale_comp (comp_property_id, lease_comp_id, sale_date, sale_price, cap_rate, noi,
    buyer_name, seller_name, source_type, source_url, source_captured_at, confidence,
    verified_by_id, verified_at, notes, created_by_id, updated_by_id)
  VALUES (v_om.comp_property_id, v_om.lease_comp_id, p_close_date, p_price, p_cap_rate, p_noi,
    NULLIF(btrim(p_buyer), ''), NULLIF(btrim(p_seller), ''),
    CASE WHEN p_source_type IN ('manual','costar','crexi','om','ai_agent') THEN p_source_type ELSE 'manual' END,
    NULLIF(btrim(p_source_url), ''), now(), 'verified', auth.uid(), now(),
    concat_ws(E'\n', 'Closed from listing; verified by ' || p_verification_method, NULLIF(btrim(p_note), '')),
    auth.uid(), auth.uid())
  RETURNING id INTO v_sale;

  UPDATE operating_memorandum SET sale_comp_id = v_sale WHERE id = v_om.id;

  INSERT INTO comp_listing_event (operating_memorandum_id, event_date, event_type, sale_comp_id,
    source_type, source_url, verification_method, recorded_by_kind, note)
  VALUES (v_om.id, p_close_date, 'closed', v_sale,
    CASE WHEN p_source_type IN ('manual','costar','crexi','om','ai_agent','broker','pt61') THEN p_source_type END,
    NULLIF(btrim(p_source_url), ''), p_verification_method, 'user', NULLIF(btrim(p_note), ''));

  RETURN v_sale;
END;
$$;

REVOKE ALL ON FUNCTION public.record_listing_close(uuid,date,numeric,numeric,numeric,text,text,text,text,text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_listing_close(uuid,date,numeric,numeric,numeric,text,text,text,text,text,text) TO authenticated;

-- ============================================================================
-- 7. comp_listing_facts — one row per offering (spec §8.4)
-- ============================================================================

CREATE VIEW public.comp_listing_facts
WITH (security_invoker = true) AS
WITH ev AS (
  SELECT e.*,
         row_number() OVER (PARTITION BY operating_memorandum_id ORDER BY event_date, created_at) AS rn
  FROM public.comp_listing_event e
),
orig AS (
  SELECT DISTINCT ON (operating_memorandum_id) operating_memorandum_id, price, cap_rate, event_date
  FROM ev WHERE event_type IN ('listed','relisted')
  ORDER BY operating_memorandum_id, event_date, created_at
),
first_ev AS (
  SELECT operating_memorandum_id, min(event_date) AS first_event_date,
         count(*) FILTER (WHERE event_type = 'price_change') AS price_change_count,
         max(event_date) FILTER (WHERE event_type = 'off_market') AS last_off_market_date,
         bool_or(recorded_by_kind = 'sweep') AS tracked_by_sweep
  FROM ev GROUP BY operating_memorandum_id
)
SELECT
  o.id                       AS listing_id,
  o.comp_property_id,
  cp.name                    AS property_name,
  cp.address, cp.city, cp.state, cp.address_norm,
  COALESCE(cp.verified_latitude, cp.latitude)   AS lat,
  COALESCE(cp.verified_longitude, cp.longitude) AS lng,
  cp.review_status,
  cp.created_at              AS property_created_at,
  o.lease_comp_id,
  lc.tenant_name             AS tenant,
  lc.guarantor_type, lc.guarantor_name,
  o.listing_status,
  o.first_seen_at, o.last_seen_at,
  COALESCE(o.list_date, fe.first_event_date)    AS list_date,
  orig.price                 AS original_ask,
  orig.cap_rate              AS original_cap,
  o.asking_price             AS current_ask,
  o.asking_cap_rate          AS current_cap,
  CASE WHEN orig.price > 0 AND o.asking_price IS NOT NULL
       THEN round((orig.price - o.asking_price) / orig.price * 100, 2) END AS total_reduction_pct,
  COALESCE(fe.price_change_count, 0)            AS price_change_count,
  s.sale_price               AS closed_price,
  s.cap_rate                 AS closed_cap,
  s.sale_date                AS close_date,
  (COALESCE(
     s.sale_date,
     CASE WHEN o.listing_status = 'off_market' THEN fe.last_off_market_date END,
     (now() AT TIME ZONE 'America/New_York')::date
   ) - COALESCE(o.list_date, fe.first_event_date))  AS days_on_market,
  CASE WHEN s.sale_price IS NOT NULL AND o.asking_price > 0
       THEN round((s.sale_price - o.asking_price) / o.asking_price * 100, 2) END AS ask_to_close_price_pct,
  CASE WHEN s.cap_rate IS NOT NULL AND o.asking_cap_rate IS NOT NULL
       THEN round((s.cap_rate - o.asking_cap_rate) * 100) END                  AS ask_to_close_cap_spread_bps,
  COALESCE(fe.tracked_by_sweep, false)          AS tracked_by_sweep,
  -- Only offerings the daily sweep watches can go stale; manual OMs are never flagged.
  (o.listing_status = 'active' AND COALESCE(fe.tracked_by_sweep, false)
   AND o.last_seen_at < now() - interval '21 days') AS possibly_off_market,
  o.listed_term_remaining, o.listed_lease_type,
  o.source_type, o.source_url, o.broker_name, o.brokerage
FROM public.operating_memorandum o
JOIN public.comp_property cp ON cp.id = o.comp_property_id
LEFT JOIN public.lease_comp lc ON lc.id = o.lease_comp_id
LEFT JOIN public.sale_comp s ON s.id = o.sale_comp_id
LEFT JOIN orig ON orig.operating_memorandum_id = o.id
LEFT JOIN first_ev fe ON fe.operating_memorandum_id = o.id;

COMMENT ON VIEW public.comp_listing_facts IS
  'One row per offering: original/current ask, reduction, DOM, close, ask-to-close spread, possibly_off_market (21 days unseen). Spec §8.4.';

REVOKE ALL ON public.comp_listing_facts FROM anon, authenticated;
GRANT SELECT ON public.comp_listing_facts TO authenticated, service_role;

-- ============================================================================
-- 8. listing_activity — daily summary feed (spec §8.6); new listings and price
--    changes reported separately
-- ============================================================================

CREATE OR REPLACE FUNCTION public.listing_activity(p_since timestamptz, p_until timestamptz DEFAULT now())
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
  WITH ev AS (
    SELECT e.*,
           lag(e.price)    OVER w AS prev_price,
           lag(e.cap_rate) OVER w AS prev_cap
    FROM comp_listing_event e
    WINDOW w AS (PARTITION BY e.operating_memorandum_id ORDER BY e.event_date, e.created_at)
  ),
  win AS (
    SELECT ev.*, f.tenant, f.address, f.city, f.comp_property_id, f.review_status
    FROM ev JOIN comp_listing_facts f ON f.listing_id = ev.operating_memorandum_id
    WHERE ev.created_at >= p_since AND ev.created_at < p_until
  )
  SELECT jsonb_build_object(
    'since', p_since, 'until', p_until,
    'new_listings', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'listing_id', operating_memorandum_id, 'comp_property_id', comp_property_id, 'event_type', event_type,
        'tenant', tenant, 'address', address, 'city', city, 'price', price, 'cap_rate', cap_rate,
        'review_status', review_status, 'event_date', event_date) ORDER BY created_at)
      FROM win WHERE event_type IN ('listed','relisted')), '[]'::jsonb),
    'price_changes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'listing_id', operating_memorandum_id, 'comp_property_id', comp_property_id, 'event_type', event_type,
        'tenant', tenant, 'address', address, 'city', city,
        'old_price', prev_price, 'new_price', price, 'old_cap', prev_cap, 'new_cap', cap_rate,
        'event_date', event_date) ORDER BY created_at)
      FROM win WHERE event_type IN ('price_change','cap_change')), '[]'::jsonb),
    'status_changes', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'listing_id', operating_memorandum_id, 'comp_property_id', comp_property_id, 'event_type', event_type,
        'tenant', tenant, 'address', address, 'city', city, 'event_date', event_date) ORDER BY created_at)
      FROM win WHERE event_type IN ('under_contract','back_on_market','off_market','closed')), '[]'::jsonb),
    'possibly_off_market', COALESCE((SELECT jsonb_agg(jsonb_build_object(
        'listing_id', listing_id, 'comp_property_id', comp_property_id, 'tenant', tenant,
        'address', address, 'city', city, 'last_seen_at', last_seen_at) ORDER BY last_seen_at)
      FROM comp_listing_facts WHERE possibly_off_market AND review_status <> 'rejected'), '[]'::jsonb)
  );
$$;

REVOKE ALL ON FUNCTION public.listing_activity(timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.listing_activity(timestamptz, timestamptz) TO authenticated, service_role;
