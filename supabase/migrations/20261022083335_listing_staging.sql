-- NNN listing intake: staging table + narrow RPCs behind the ovis-mcp edge function.
-- See docs/NNN_LISTING_INTAKE.md.
--
-- Deviations from the original spec, on purpose:
--   * The spec's investment_comps / comp_leases tables don't exist. The comp database is
--     comp_property (location) + lease_comp (tenant lease) + comp_availability (asking price).
--     The back-link column is therefore comp_property_id, not investment_comp_id.
--   * address_norm includes city + state. "100 Main St" exists in many GA cities; a
--     street-only unique key would merge different listings.
--   * va_task_id links the listing to the VA task created for it (task has no listing FK).

-- ----------------------------------------------------------------------------
-- Address normalization (canonical, server-side; the MCP tool and the UI both use it)
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.normalize_listing_address(p_address text, p_city text, p_state text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public, pg_temp
AS $$
DECLARE
  v text;
  w text;
  out_words text[] := '{}';
  -- Suffix + directional abbreviations (USPS Pub 28 subset)
  abbr CONSTANT jsonb := '{
    "street":"st","str":"st","road":"rd","avenue":"ave","av":"ave","drive":"dr","boulevard":"blvd",
    "highway":"hwy","parkway":"pkwy","lane":"ln","court":"ct","place":"pl","circle":"cir",
    "terrace":"ter","trail":"trl","way":"way","square":"sq","crossing":"xing","center":"ctr",
    "point":"pt","pike":"pike","expressway":"expy","freeway":"fwy","route":"rte","suite":"ste",
    "north":"n","south":"s","east":"e","west":"w",
    "northeast":"ne","northwest":"nw","southeast":"se","southwest":"sw"
  }';
BEGIN
  IF p_address IS NULL OR btrim(p_address) = '' THEN
    RETURN NULL;
  END IF;
  v := lower(p_address);
  v := regexp_replace(v, '[.,#]', ' ', 'g');
  v := regexp_replace(v, '\s+', ' ', 'g');
  v := btrim(v);
  FOREACH w IN ARRAY string_to_array(v, ' ') LOOP
    out_words := out_words || COALESCE(abbr ->> w, w);
  END LOOP;
  v := array_to_string(out_words, ' ');
  RETURN v
    || ', ' || COALESCE(NULLIF(regexp_replace(lower(btrim(p_city)), '\s+', ' ', 'g'), ''), '?')
    || ' ' || COALESCE(NULLIF(lower(btrim(p_state)), ''), 'ga');
END;
$$;

REVOKE ALL ON FUNCTION public.normalize_listing_address(text, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.normalize_listing_address(text, text, text) TO authenticated, service_role;

-- ----------------------------------------------------------------------------
-- Table
-- ----------------------------------------------------------------------------
CREATE TABLE public.listing_staging (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant           text,
  guarantor_type   text,
  address          text NOT NULL,
  address_norm     text NOT NULL UNIQUE,
  city             text,
  state            text NOT NULL DEFAULT 'GA',
  price            numeric,
  cap_rate         numeric,
  lease_type       text,
  term_left        text,
  source           text,
  source_url       text,
  first_seen       timestamptz NOT NULL DEFAULT now(),
  last_seen        timestamptz NOT NULL DEFAULT now(),
  status           text NOT NULL DEFAULT 'pending_review'
                   CHECK (status IN ('pending_review','reviewed','promoted','rejected','sold')),
  lat              double precision,
  lng              double precision,
  geocode_status   text CHECK (geocode_status IN ('ok','failed')),
  notes            text,
  comp_property_id uuid REFERENCES public.comp_property(id) ON DELETE SET NULL,
  va_task_id       uuid REFERENCES public.task(id) ON DELETE SET NULL,
  created_by_id    uuid REFERENCES public."user"(id) ON DELETE SET NULL,
  updated_at       timestamptz NOT NULL DEFAULT now()
);

COMMENT ON TABLE public.listing_staging IS
  'NNN investment listings captured via the ovis-mcp upsert_listing tool, pending review / promotion to the comp database.';
COMMENT ON COLUMN public.listing_staging.cap_rate IS 'Percent, e.g. 6.25 = 6.25%.';

CREATE INDEX listing_staging_status_idx ON public.listing_staging (status);
CREATE INDEX listing_staging_first_seen_idx ON public.listing_staging (first_seen DESC);

CREATE TRIGGER listing_staging_set_updated_at
  BEFORE UPDATE ON public.listing_staging
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.listing_staging ENABLE ROW LEVEL SECURITY;

CREATE POLICY listing_staging_internal_select ON public.listing_staging
  FOR SELECT TO authenticated USING ((SELECT public.is_internal_user()));
CREATE POLICY listing_staging_internal_update ON public.listing_staging
  FOR UPDATE TO authenticated
  USING ((SELECT public.is_internal_user())) WITH CHECK ((SELECT public.is_internal_user()));

-- Grants: don't inherit the defaults, state what the app uses.
-- UI reads + reviews; inserts come only from the edge function (service_role).
REVOKE ALL ON public.listing_staging FROM anon, authenticated;
GRANT SELECT, UPDATE ON public.listing_staging TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.listing_staging TO service_role;

-- ----------------------------------------------------------------------------
-- upsert_listing — called by ovis-mcp (service_role). Insert, or bump last_seen and
-- refresh any fields the new sighting supplies (a price drop is worth keeping).
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.upsert_listing_staging(
  p_tenant text, p_address text, p_city text, p_state text,
  p_price numeric, p_cap_rate numeric, p_lease_type text, p_term_left text,
  p_source text, p_source_url text, p_guarantor_type text, p_acting_user_id uuid
)
RETURNS TABLE (id uuid, is_new boolean, address_norm text, needs_geocode boolean)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_norm text := public.normalize_listing_address(p_address, p_city, COALESCE(NULLIF(btrim(p_state), ''), 'GA'));
BEGIN
  IF v_norm IS NULL THEN
    RAISE EXCEPTION 'address is required';
  END IF;

  RETURN QUERY
  INSERT INTO public.listing_staging AS ls (
    tenant, guarantor_type, address, address_norm, city, state, price, cap_rate,
    lease_type, term_left, source, source_url, created_by_id
  ) VALUES (
    NULLIF(btrim(p_tenant), ''), NULLIF(btrim(p_guarantor_type), ''), btrim(p_address), v_norm,
    NULLIF(btrim(p_city), ''), upper(COALESCE(NULLIF(btrim(p_state), ''), 'GA')),
    p_price, p_cap_rate, NULLIF(btrim(p_lease_type), ''), NULLIF(btrim(p_term_left), ''),
    NULLIF(btrim(p_source), ''), NULLIF(btrim(p_source_url), ''), p_acting_user_id
  )
  ON CONFLICT ON CONSTRAINT listing_staging_address_norm_key DO UPDATE SET
    last_seen      = now(),
    tenant         = COALESCE(EXCLUDED.tenant, ls.tenant),
    guarantor_type = COALESCE(EXCLUDED.guarantor_type, ls.guarantor_type),
    price          = COALESCE(EXCLUDED.price, ls.price),
    cap_rate       = COALESCE(EXCLUDED.cap_rate, ls.cap_rate),
    lease_type     = COALESCE(EXCLUDED.lease_type, ls.lease_type),
    term_left      = COALESCE(EXCLUDED.term_left, ls.term_left),
    source         = COALESCE(EXCLUDED.source, ls.source),
    source_url     = COALESCE(EXCLUDED.source_url, ls.source_url)
  RETURNING ls.id, (ls.xmax = 0), ls.address_norm, (ls.lat IS NULL AND ls.geocode_status IS DISTINCT FROM 'failed');
END;
$$;

REVOKE ALL ON FUNCTION public.upsert_listing_staging(text,text,text,text,numeric,numeric,text,text,text,text,text,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_listing_staging(text,text,text,text,numeric,numeric,text,text,text,text,text,uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- create_listing_va_task — one task in the assignee's Inbox, checklist in the description.
-- Task System v2 has parent_task_id subtasks in the schema but no UI renders them yet,
-- so child tasks would surface as context-free loose items. The checklist is written
-- as "[ ] item" lines instead.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_listing_va_task(
  p_listing_id uuid, p_assignee_first_name text, p_due date, p_title text,
  p_checklist text[], p_acting_user_id uuid
)
RETURNS TABLE (task_id uuid, assignee_id uuid, checklist_count integer, due_date date)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_listing   public.listing_staging%ROWTYPE;
  v_assignee  uuid;
  v_n         integer;
  v_category  uuid;
  v_due       date := COALESCE(p_due, (now() AT TIME ZONE 'America/New_York')::date);
  v_task      uuid;
  v_items     text[];
  v_desc      text;
BEGIN
  SELECT * INTO v_listing FROM public.listing_staging WHERE id = p_listing_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing % not found', p_listing_id;
  END IF;

  SELECT count(*), min(u.id::text)::uuid INTO v_n, v_assignee
  FROM public."user" u
  WHERE lower(u.first_name) = lower(btrim(COALESCE(NULLIF(p_assignee_first_name, ''), 'Noree')))
    AND u.ovis_role IS NOT NULL;
  IF v_n = 0 THEN
    RAISE EXCEPTION 'no OVIS user with first name %', p_assignee_first_name;
  ELSIF v_n > 1 THEN
    RAISE EXCEPTION 'first name % matches % users; ambiguous', p_assignee_first_name, v_n;
  END IF;

  SELECT id INTO v_category FROM public.task_category WHERE name = 'other' AND scope = 'global';

  SELECT array_agg(btrim(x)) INTO v_items
  FROM unnest(COALESCE(p_checklist, '{}')) x WHERE btrim(x) <> '';

  v_desc := concat_ws(E'\n',
    'NNN listing: ' || COALESCE(v_listing.tenant, '(tenant unknown)'),
    v_listing.address || COALESCE(', ' || v_listing.city, '') || ', ' || v_listing.state,
    CASE WHEN v_listing.price IS NOT NULL THEN 'Asking: $' || to_char(v_listing.price, 'FM999,999,999') END,
    CASE WHEN v_listing.cap_rate IS NOT NULL THEN 'Cap: ' || v_listing.cap_rate || '%' END,
    CASE WHEN v_listing.source_url IS NOT NULL THEN 'Source: ' || v_listing.source_url END,
    'Review: https://ovis.oculusrep.com/listings/review?listing=' || v_listing.id,
    CASE WHEN v_items IS NOT NULL THEN E'\nChecklist:\n'
      || array_to_string(ARRAY(SELECT '[ ] ' || i FROM unnest(v_items) i), E'\n') END
  );

  -- Cross-user assignment lands in the assignee's Inbox (same rule as useTasks.createTask).
  -- Due = local (ET) midnight, matching how the UI stores date-only due dates.
  INSERT INTO public.task (subject, description, status, category, category_id, owner_id,
                           assigned_by_id, created_by_id, due_at, is_inbox)
  VALUES (
    COALESCE(NULLIF(btrim(p_title), ''),
             'NNN listing — ' || COALESCE(v_listing.tenant || ' — ', '') || v_listing.address),
    v_desc, 'open', 'other', v_category, v_assignee,
    p_acting_user_id, p_acting_user_id,
    (v_due::timestamp) AT TIME ZONE 'America/New_York',
    v_assignee IS DISTINCT FROM p_acting_user_id
  )
  RETURNING id INTO v_task;

  UPDATE public.listing_staging SET va_task_id = v_task WHERE id = p_listing_id;

  RETURN QUERY SELECT v_task, v_assignee, COALESCE(array_length(v_items, 1), 0), v_due;
END;
$$;

REVOKE ALL ON FUNCTION public.create_listing_va_task(uuid,text,date,text,text[],uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_listing_va_task(uuid,text,date,text,text[],uuid) TO service_role;

-- ----------------------------------------------------------------------------
-- promote_listing_to_comp — called from the review UI as the signed-in user.
-- SECURITY INVOKER: comp + listing RLS (is_internal_user) applies.
-- Creates comp_property + lease_comp + comp_availability (asking price) and links back.
-- Idempotent: a listing already promoted returns its existing comp.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.promote_listing_to_comp(p_listing_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_l        public.listing_staging%ROWTYPE;
  v_user     uuid;
  v_comp     uuid;
  v_lt       text;
  v_src      text;
  v_lease_nt text;
BEGIN
  SELECT * INTO v_l FROM public.listing_staging WHERE id = p_listing_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'listing % not found or not visible', p_listing_id;
  END IF;
  IF v_l.comp_property_id IS NOT NULL THEN
    RETURN v_l.comp_property_id;
  END IF;

  SELECT id INTO v_user FROM public."user" WHERE auth_user_id = auth.uid();

  v_lt := CASE
    WHEN v_l.lease_type ~* 'ground' THEN 'ground_lease'
    WHEN v_l.lease_type ~* '(^|[^n])nn([^n]|$)' THEN 'bts_nn'
    WHEN v_l.lease_type ~* 'nnn|abs' THEN 'bts_nnn'
    ELSE NULL
  END;
  v_src := CASE
    WHEN v_l.source ~* 'crexi' THEN 'crexi'
    WHEN v_l.source ~* 'costar|loopnet' THEN 'costar'
    ELSE 'ai_agent'
  END;
  v_lease_nt := concat_ws(E'\n',
    CASE WHEN v_l.lease_type IS NOT NULL THEN 'Lease type (as listed): ' || v_l.lease_type END,
    CASE WHEN v_l.term_left IS NOT NULL THEN 'Term remaining (as listed): ' || v_l.term_left END,
    CASE WHEN v_l.guarantor_type IS NOT NULL THEN 'Guarantor: ' || v_l.guarantor_type END,
    'Promoted from NNN listing intake ' || to_char(now() AT TIME ZONE 'America/New_York', 'YYYY-MM-DD')
  );

  INSERT INTO public.comp_property (name, address, city, state, latitude, longitude,
    source_type, source_url, source_reference, source_captured_at, confidence,
    is_available, created_by_id, updated_by_id)
  VALUES (v_l.tenant, v_l.address, v_l.city, v_l.state, v_l.lat, v_l.lng,
    v_src, v_l.source_url, 'listing_staging:' || v_l.id, v_l.first_seen, 'reported',
    v_l.status <> 'sold', v_user, v_user)
  RETURNING id INTO v_comp;

  INSERT INTO public.lease_comp (comp_property_id, tenant_name, lease_type, notes,
    source_type, source_url, source_reference, source_captured_at, confidence,
    created_by_id, updated_by_id)
  VALUES (v_comp, v_l.tenant, v_lt, v_lease_nt,
    v_src, v_l.source_url, 'listing_staging:' || v_l.id, v_l.first_seen, 'reported',
    v_user, v_user);

  IF v_l.price IS NOT NULL OR v_l.cap_rate IS NOT NULL THEN
    INSERT INTO public.comp_availability (comp_property_id, as_of_date, availability_type,
      asking_purchase_price, notes, source_type, source_url, source_reference,
      source_captured_at, confidence, created_by_id, updated_by_id)
    VALUES (v_comp, (v_l.last_seen AT TIME ZONE 'America/New_York')::date, 'for_purchase',
      v_l.price,
      CASE WHEN v_l.cap_rate IS NOT NULL THEN 'Asking cap rate: ' || v_l.cap_rate || '%' END,
      v_src, v_l.source_url, 'listing_staging:' || v_l.id, v_l.first_seen, 'reported',
      v_user, v_user);
  END IF;

  UPDATE public.listing_staging
     SET comp_property_id = v_comp,
         status = CASE WHEN status = 'sold' THEN status ELSE 'promoted' END
   WHERE id = p_listing_id;

  RETURN v_comp;
END;
$$;

REVOKE ALL ON FUNCTION public.promote_listing_to_comp(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.promote_listing_to_comp(uuid) TO authenticated;
