-- Per-field provenance log (piece 2, item 7), wired into upsert_comp_listing.
--   * every value change made by comp_merge_fields writes a comp_field_change row, including a fill
--     of an empty field (old_value null, old_source null). outcome = 'applied'.
--   * a lower-ranked source blocked by a higher-ranked one writes a row ONLY when its value differs
--     from the kept value. outcome = 'blocked': old_value/old_source = what was kept,
--     new_value/new_source/source_url = what was refused. A repeat of the same refusal (same field,
--     source kind, URL, refused value and kept value) is not logged again, so a daily re-sighting
--     doesn't add a row per day.
--   * derived values (rank 99, e.g. expiration from term_left) losing to a stated value are not a
--     source being blocked and are not logged.
--   * comp_field_change gains source_url + outcome; created_at becomes changed_at.
-- Also fixes a live bug in comp_merge_fields: `v_cols || '__prov__'` parsed the literal as text[] and
-- raised "malformed array literal", so ANY upsert where a higher-ranked source restated a value
-- already held by a lower-ranked one failed outright (e.g. Showcase confirming LoopNet's lease type).
-- comp_merge_fields is rebuilt from its live definition (pg_get_functiondef, 2026-11-02) with a new
-- trailing p_source_url param; upsert_comp_listing is its live definition with only the four
-- comp_merge_fields calls changed to pass p_source_url.

ALTER TABLE public.comp_field_change RENAME COLUMN created_at TO changed_at;
ALTER TABLE public.comp_field_change
  ADD COLUMN source_url text,
  ADD COLUMN outcome text NOT NULL DEFAULT 'applied'
    CONSTRAINT comp_field_change_outcome_check CHECK (outcome IN ('applied', 'blocked'));

DROP FUNCTION public.comp_merge_fields(text, uuid, jsonb, text, uuid, text[]);

CREATE FUNCTION public.comp_merge_fields(p_table text, p_id uuid, p_incoming jsonb, p_kind text, p_om uuid,
                                         p_derived text[] DEFAULT '{}'::text[], p_source_url text DEFAULT NULL)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_row    jsonb;
  v_src    jsonb;
  v_basis  jsonb;
  v_set    jsonb := '{}'::jsonb;
  v_cols   text[] := '{}';
  v_applied text[] := '{}';
  v_kept   jsonb := '[]'::jsonb;
  f        text;
  v_in     jsonb;
  v_cur    jsonb;
  r_in     int;
  r_cur    int;
  v_cur_src text;
  v_in_src  text;
BEGIN
  IF p_table NOT IN ('lease_comp','comp_property','operating_memorandum') THEN
    RAISE EXCEPTION 'comp_merge_fields: unsupported table %', p_table;
  END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1', p_table) INTO v_row USING p_id;
  IF v_row IS NULL THEN RETURN jsonb_build_object('applied', '[]'::jsonb, 'kept', '[]'::jsonb); END IF;
  v_src := COALESCE(v_row->'field_source', '{}'::jsonb);
  v_basis := COALESCE(v_row->'field_basis', '{}'::jsonb);
  p_source_url := NULLIF(btrim(p_source_url), '');

  FOR f, v_in IN SELECT key, value FROM jsonb_each(COALESCE(p_incoming, '{}'::jsonb)) LOOP
    IF NOT (v_row ? f) THEN RAISE EXCEPTION 'comp_merge_fields: % has no column %', p_table, f; END IF;
    -- never overwrite with null / blank
    CONTINUE WHEN v_in IS NULL OR jsonb_typeof(v_in) = 'null' OR (jsonb_typeof(v_in) = 'string' AND btrim(v_in #>> '{}') = '');
    r_in := CASE WHEN f = ANY (p_derived) THEN 99 ELSE public.comp_source_rank(p_kind) END;
    v_in_src := CASE WHEN f = ANY (p_derived) THEN 'derived' ELSE p_kind END;
    v_cur := v_row->f;
    v_cur_src := CASE WHEN v_basis->>f = 'derived' THEN 'derived' ELSE COALESCE(v_src->>f, 'manual') END;
    r_cur := CASE WHEN v_cur IS NULL OR jsonb_typeof(v_cur) = 'null' THEN 1000
                  ELSE public.comp_source_rank(v_cur_src) END;

    IF r_cur = 1000 OR (r_in <= r_cur AND v_cur IS DISTINCT FROM v_in) THEN
      v_set := v_set || jsonb_build_object(f, v_in);
      v_cols := v_cols || f;
      v_applied := v_applied || f;
      v_src := v_src || jsonb_build_object(f, p_kind);
      v_basis := CASE WHEN f = ANY (p_derived) THEN v_basis || jsonb_build_object(f, 'derived') ELSE v_basis - f END;
      -- every value change is logged, a fill of an empty field included (old_value/old_source null)
      INSERT INTO comp_field_change (table_name, record_id, operating_memorandum_id, field, old_value, new_value,
                                     old_source, new_source, source_url, outcome)
      VALUES (p_table, p_id, p_om, f, CASE WHEN r_cur = 1000 THEN NULL ELSE v_cur END, v_in,
              CASE WHEN r_cur = 1000 THEN NULL ELSE v_cur_src END, v_in_src, p_source_url, 'applied');
    ELSIF r_in < r_cur AND v_cur = v_in THEN
      -- same value from a better source: upgrade the provenance only (the value didn't change: no row)
      v_src := v_src || jsonb_build_object(f, p_kind);
      IF NOT (f = ANY (p_derived)) THEN v_basis := v_basis - f; END IF;
      v_cols := v_cols || '__prov__'::text;  -- ::text: an untyped literal is read as an array (the live bug)
    ELSIF r_in > r_cur AND v_cur IS DISTINCT FROM v_in THEN
      v_kept := v_kept || jsonb_build_object('field', f, 'held_by', v_cur_src);
      -- a lower-ranked SOURCE refused with a different value; a derived value losing to a stated
      -- one is not a source and isn't logged. The same refusal again (daily re-sighting) isn't re-logged.
      IF NOT (f = ANY (p_derived)) AND NOT EXISTS (
           SELECT 1 FROM comp_field_change c
            WHERE c.table_name = p_table AND c.record_id = p_id AND c.field = f AND c.outcome = 'blocked'
              AND c.new_source = v_in_src AND c.source_url IS NOT DISTINCT FROM p_source_url
              AND c.new_value = v_in AND c.old_value = v_cur) THEN
        INSERT INTO comp_field_change (table_name, record_id, operating_memorandum_id, field, old_value, new_value,
                                       old_source, new_source, source_url, outcome)
        VALUES (p_table, p_id, p_om, f, v_cur, v_in, v_cur_src, v_in_src, p_source_url, 'blocked');
      END IF;
    END IF;
  END LOOP;

  IF array_length(v_cols, 1) > 0 THEN
    PERFORM set_config('ovis.comp_merge', 'on', true);
    EXECUTE format(
      'UPDATE public.%1$I t SET field_source = $2, field_basis = $3%2$s FROM jsonb_populate_record(NULL::public.%1$I, $1) r WHERE t.id = $4',
      p_table,
      COALESCE((SELECT string_agg(format(', %1$I = r.%1$I', c), '') FROM unnest(v_applied) c), ''))
    USING v_set, v_src, v_basis, p_id;
    PERFORM set_config('ovis.comp_merge', 'off', true);
  END IF;

  RETURN jsonb_build_object('applied', to_jsonb(v_applied), 'kept', v_kept);
END;
$function$;

-- Grants: internal helper, called only from upsert_comp_listing (SECURITY DEFINER). Same ACL as before.
REVOKE ALL ON FUNCTION public.comp_merge_fields(text, uuid, jsonb, text, uuid, text[], text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.comp_merge_fields(text, uuid, jsonb, text, uuid, text[], text) TO service_role;

CREATE OR REPLACE FUNCTION public.upsert_comp_listing(p_tenant text, p_address text, p_city text, p_state text, p_zip text, p_apn text, p_price numeric, p_cap_rate numeric, p_noi numeric, p_lease_type text, p_term_left text, p_guarantor_type text, p_guarantor_name text, p_source text, p_source_url text, p_list_date date, p_broker_name text, p_brokerage text, p_acting_auth_id uuid, p_broker_email text DEFAULT NULL::text, p_broker_phone text DEFAULT NULL::text, p_current_rent numeric DEFAULT NULL::numeric, p_lease_start date DEFAULT NULL::date, p_lease_expiration date DEFAULT NULL::date, p_term_years_left numeric DEFAULT NULL::numeric, p_bumps_text text DEFAULT NULL::text, p_escalation_pct numeric DEFAULT NULL::numeric, p_bump_frequency text DEFAULT NULL::text, p_options_text text DEFAULT NULL::text, p_option_count integer DEFAULT NULL::integer, p_option_term_years numeric DEFAULT NULL::numeric, p_building_sf numeric DEFAULT NULL::numeric, p_lot_acres numeric DEFAULT NULL::numeric)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_state   text := upper(COALESCE(NULLIF(btrim(p_state), ''), 'GA'));
  v_norm    text := public.normalize_listing_address(p_address, p_city, v_state);
  v_apn     text := NULLIF(upper(regexp_replace(COALESCE(p_apn, ''), '[^A-Za-z0-9]', '', 'g')), '');
  v_tenant  text := NULLIF(btrim(p_tenant), '');
  v_kind    text := public.comp_source_kind(p_source, p_source_url);
  v_rank    integer;
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
  v_today   date := (now() AT TIME ZONE 'America/New_York')::date;
  v_merge   jsonb;
  v_applied jsonb := '[]'::jsonb;
  v_kept    jsonb := '[]'::jsonb;
  v_new_src boolean := false;
  v_cur_kind text;
  v_conflict boolean := false;
  v_outranked boolean := false;
  v_exp_derived date;
  v_gtype   text := CASE WHEN lower(btrim(p_guarantor_type)) IN ('corporate','franchisee','personal','other')
                         THEN lower(btrim(p_guarantor_type)) END;
  v_freq    text := CASE WHEN p_bump_frequency IN ('annual','every_5_years','other') THEN p_bump_frequency END;
BEGIN
  IF v_norm IS NULL THEN RAISE EXCEPTION 'address is required'; END IF;
  -- Serialize sightings of one address so two concurrent runs can't both insert it.
  PERFORM pg_advisory_xact_lock(hashtext('comp_listing:' || v_norm));
  v_rank := public.comp_source_rank(v_kind);

  -- legacy source_type column (CHECK-constrained); the precedence uses v_kind
  v_src := CASE v_kind WHEN 'crexi' THEN 'crexi' WHEN 'costar' THEN 'costar' WHEN 'loopnet' THEN 'costar'
                       WHEN 'om' THEN 'om' ELSE 'ai_agent' END;
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
    INSERT INTO comp_property (name, address, city, state, source_type, source_url,
      source_reference, source_captured_at, confidence, is_available, review_status,
      created_by_id, updated_by_id)
    VALUES (v_tenant, btrim(p_address), NULLIF(btrim(p_city), ''), v_state,
      v_src, NULLIF(btrim(p_source_url), ''), NULLIF(btrim(p_source), ''), now(),
      'reported', true, 'pending_review', p_acting_auth_id, p_acting_auth_id)
    RETURNING * INTO v_prop;
    v_new_prop := true;
  END IF;
  v_merge := public.comp_merge_fields('comp_property', v_prop.id, jsonb_build_object(
      'zip', NULLIF(btrim(p_zip), ''), 'parcel_id', NULLIF(btrim(p_apn), ''),
      'building_sqft', p_building_sf, 'land_acres', p_lot_acres), v_kind, NULL, p_source_url => NULLIF(btrim(p_source_url), ''));
  v_applied := v_applied || COALESCE((SELECT jsonb_agg('property.' || x) FROM jsonb_array_elements_text(v_merge->'applied') x), '[]');
  v_kept := v_kept || COALESCE((SELECT jsonb_agg(k || jsonb_build_object('field', 'property.' || (k->>'field'))) FROM jsonb_array_elements(v_merge->'kept') k), '[]');

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
    INSERT INTO lease_comp (comp_property_id, tenant_name, merchant_brand_id,
      source_type, source_url, source_reference, source_captured_at,
      confidence, created_by_id, updated_by_id)
    VALUES (v_prop.id, v_tenant, v_brand, v_src, NULLIF(btrim(p_source_url), ''),
      NULLIF(btrim(p_source), ''), now(), 'reported', p_acting_auth_id, p_acting_auth_id)
    RETURNING id INTO v_lease;
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
          AND s.sale_date >= v_today - 90) THEN
    UPDATE operating_memorandum SET last_seen_at = now()
     WHERE id = (SELECT id FROM operating_memorandum WHERE comp_property_id = v_prop.id
                  ORDER BY first_seen_at DESC LIMIT 1);
    RETURN jsonb_build_object('comp_property_id', v_prop.id, 'skipped', 'recently_closed',
                              'is_new', false, 'changed', false, 'review_status', v_prop.review_status);
  END IF;

  IF v_om.id IS NULL THEN
    v_etype := CASE WHEN EXISTS (SELECT 1 FROM operating_memorandum WHERE comp_property_id = v_prop.id)
                    THEN 'relisted' ELSE 'listed' END;
    INSERT INTO operating_memorandum (comp_property_id, lease_comp_id, title, source_type, source_url,
      source_reference, source_captured_at, confidence, created_by_id, updated_by_id)
    VALUES (v_prop.id, v_lease, concat_ws(' — ', v_tenant, btrim(p_address)), v_src,
      NULLIF(btrim(p_source_url), ''), NULLIF(btrim(p_source), ''), now(), 'reported',
      p_acting_auth_id, p_acting_auth_id)
    RETURNING * INTO v_om;
    v_new_om := true;
  ELSE
    UPDATE operating_memorandum SET last_seen_at = now(), lease_comp_id = COALESCE(lease_comp_id, v_lease)
     WHERE id = v_om.id;
  END IF;

  -- ---- sources: add or refresh this one; never touch another source's row ----
  INSERT INTO comp_listing_source (operating_memorandum_id, source_kind, source_label, url)
  VALUES (v_om.id, v_kind, NULLIF(btrim(p_source), ''), NULLIF(btrim(p_source_url), ''))
  ON CONFLICT (operating_memorandum_id, url_key) DO UPDATE
    SET last_seen_at = now(), source_label = COALESCE(EXCLUDED.source_label, comp_listing_source.source_label)
  RETURNING (xmax = 0) INTO v_new_src;
  IF v_new_src AND NOT v_new_om THEN
    PERFORM public.comp_append_listing_task_line(v_om.id,
      'New source — ' || COALESCE(NULLIF(btrim(p_source), ''), v_kind)
      || CASE WHEN v_kind = 'showcase' THEN ' (data only; don''t request the OM)' ELSE '' END
      || ': ' || COALESCE(NULLIF(btrim(p_source_url), ''), '(no link)'));
  END IF;

  -- ---- offering fields under precedence ----
  v_merge := public.comp_merge_fields('operating_memorandum', v_om.id, jsonb_build_object(
      'broker_name', NULLIF(btrim(p_broker_name), ''), 'brokerage', NULLIF(btrim(p_brokerage), ''),
      'broker_email', NULLIF(lower(btrim(p_broker_email)), ''), 'broker_phone', NULLIF(btrim(p_broker_phone), ''),
      'list_date', p_list_date, 'listed_term_remaining', NULLIF(btrim(p_term_left), ''),
      'listed_lease_type', NULLIF(btrim(p_lease_type), '')), v_kind, v_om.id, p_source_url => NULLIF(btrim(p_source_url), ''));
  v_applied := v_applied || COALESCE((SELECT jsonb_agg('listing.' || x) FROM jsonb_array_elements_text(v_merge->'applied') x), '[]');
  v_kept := v_kept || COALESCE((SELECT jsonb_agg(k || jsonb_build_object('field', 'listing.' || (k->>'field'))) FROM jsonb_array_elements(v_merge->'kept') k), '[]');

  -- ---- lease fields under precedence (stated), then a derived expiration from "N years left" ----
  IF v_lease IS NOT NULL THEN
    v_merge := public.comp_merge_fields('lease_comp', v_lease, jsonb_build_object(
        'lease_type', v_lt, 'guarantor_type', v_gtype, 'guarantor_name', NULLIF(btrim(p_guarantor_name), ''),
        'annual_base_rent', p_current_rent, 'lease_commencement_date', p_lease_start,
        'lease_expiration_date', p_lease_expiration,
        'escalation_pct', p_escalation_pct, 'rent_bump_frequency', v_freq,
        'rent_bumps_text', NULLIF(btrim(p_bumps_text), ''),
        'option_count', p_option_count, 'option_term_years', p_option_term_years,
        'option_periods', NULLIF(btrim(p_options_text), '')), v_kind, v_om.id, p_source_url => NULLIF(btrim(p_source_url), ''));
    v_applied := v_applied || COALESCE((SELECT jsonb_agg('lease.' || x) FROM jsonb_array_elements_text(v_merge->'applied') x), '[]');
    v_kept := v_kept || COALESCE((SELECT jsonb_agg(k || jsonb_build_object('field', 'lease.' || (k->>'field'))) FROM jsonb_array_elements(v_merge->'kept') k), '[]');

    IF p_lease_expiration IS NULL AND p_term_years_left > 0 AND p_term_years_left < 100 THEN
      v_exp_derived := (COALESCE(p_list_date, v_today) + make_interval(months => round(p_term_years_left * 12)::int))::date;
      v_merge := public.comp_merge_fields('lease_comp', v_lease,
          jsonb_build_object('lease_expiration_date', v_exp_derived), v_kind, v_om.id, ARRAY['lease_expiration_date'], p_source_url => NULLIF(btrim(p_source_url), ''));
      v_applied := v_applied || COALESCE((SELECT jsonb_agg('lease.' || x || ' (derived)') FROM jsonb_array_elements_text(v_merge->'applied') x), '[]');
    END IF;
  END IF;

  -- ---- pricing events ----
  IF v_new_om THEN
    INSERT INTO comp_listing_event (operating_memorandum_id, event_date, event_type, price, cap_rate, noi,
      source_type, source_url, source_kind, recorded_by_kind, recorded_by_id)
    VALUES (v_om.id, COALESCE(p_list_date, v_today), v_etype,
      p_price, p_cap_rate, p_noi, v_src, NULLIF(btrim(p_source_url), ''), v_kind, 'sweep', p_acting_auth_id);
    v_new := jsonb_build_object('price', p_price, 'cap_rate', p_cap_rate);
  ELSE
    -- the source behind the current ask
    SELECT e.source_kind INTO v_cur_kind FROM comp_listing_event e
     WHERE e.operating_memorandum_id = v_om.id AND NOT e.outranked
       AND e.event_type IN ('listed','relisted','price_change','cap_change','back_on_market')
       AND (e.price IS NOT NULL OR e.cap_rate IS NOT NULL)
     ORDER BY e.event_date DESC, e.created_at DESC LIMIT 1;

    v_old := jsonb_build_object('price', v_om.asking_price, 'cap_rate', v_om.asking_cap_rate);
    v_etype := CASE
      -- Off market and seen listed again → back on market. Under contract is NOT
      -- flipped back: contracted listings often stay posted, and the sweep can't tell.
      WHEN v_om.listing_status = 'off_market' THEN 'back_on_market'
      WHEN p_price IS NOT NULL AND p_price IS DISTINCT FROM v_om.asking_price THEN 'price_change'
      WHEN p_cap_rate IS NOT NULL AND p_cap_rate IS DISTINCT FROM v_om.asking_cap_rate THEN 'cap_change'
      ELSE NULL END;

    -- A different source reporting a different figure while the current one is still live (seen in
    -- the last 14 days) is a CONFLICT, not a price change: keep both, flag, don't silently pick.
    IF v_etype IN ('price_change', 'cap_change') AND v_cur_kind IS NOT NULL AND v_cur_kind <> v_kind
       AND EXISTS (SELECT 1 FROM comp_listing_source s
                    WHERE s.operating_memorandum_id = v_om.id AND s.source_kind = v_cur_kind
                      AND s.last_seen_at > now() - interval '14 days') THEN
      v_conflict := true;
      v_outranked := v_rank > public.comp_source_rank(v_cur_kind);
    END IF;

    IF v_etype IS NOT NULL THEN
      INSERT INTO comp_listing_event (operating_memorandum_id, event_type, price, cap_rate, noi,
        source_type, source_url, source_kind, conflict, outranked, recorded_by_kind, recorded_by_id, note)
      VALUES (v_om.id, v_etype, COALESCE(p_price, v_om.asking_price), COALESCE(p_cap_rate, v_om.asking_cap_rate),
        p_noi, v_src, NULLIF(btrim(p_source_url), ''), v_kind, v_conflict, v_outranked, 'sweep', p_acting_auth_id,
        CASE WHEN v_conflict THEN 'Conflicts with ' || v_cur_kind || ' (' || COALESCE('$' || to_char(v_om.asking_price, 'FM999,999,999'), '?')
             || ' @ ' || COALESCE(v_om.asking_cap_rate::text || '%', '?') || ')'
             || CASE WHEN v_outranked THEN '; outranked, not the current ask' ELSE '' END END);
      v_changed := NOT v_outranked;
      v_new := jsonb_build_object('price', COALESCE(p_price, v_om.asking_price),
                                  'cap_rate', COALESCE(p_cap_rate, v_om.asking_cap_rate));
    END IF;

    IF v_conflict THEN
      UPDATE operating_memorandum SET price_conflict = true, price_conflict_at = now(),
        price_conflict_note = v_cur_kind || ': ' || COALESCE('$' || to_char(v_om.asking_price, 'FM999,999,999'), '?')
          || ' @ ' || COALESCE(v_om.asking_cap_rate::text || '%', '?')
          || ' vs ' || v_kind || ': ' || COALESCE('$' || to_char(COALESCE(p_price, v_om.asking_price), 'FM999,999,999'), '?')
          || ' @ ' || COALESCE(COALESCE(p_cap_rate, v_om.asking_cap_rate)::text || '%', '?')
       WHERE id = v_om.id;
      PERFORM public.comp_append_listing_task_line(v_om.id,
        '[ ] Resolve price/cap conflict between sources: ' ||
        (SELECT price_conflict_note FROM operating_memorandum WHERE id = v_om.id));
    END IF;
  END IF;

  RETURN jsonb_strip_nulls(jsonb_build_object(
    'comp_property_id', v_prop.id,
    'listing_id', v_om.id,
    'is_new', v_new_om,
    'is_new_property', v_new_prop,
    'matched_existing_comp', NOT v_new_prop,
    'review_status', (SELECT review_status FROM comp_property WHERE id = v_prop.id),
    'source_kind', v_kind,
    'new_source', CASE WHEN v_new_src AND NOT v_new_om THEN true END,
    'changed', v_changed,
    'event_type', v_etype,
    'old', CASE WHEN v_etype IN ('price_change','cap_change','back_on_market') THEN v_old END,
    'new', CASE WHEN v_etype IN ('price_change','cap_change','back_on_market') THEN v_new END,
    'price_conflict', CASE WHEN v_conflict THEN true END,
    'conflict_outranked', CASE WHEN v_outranked THEN true END,
    'fields_applied', CASE WHEN jsonb_array_length(v_applied) > 0 THEN v_applied END,
    'fields_kept_higher_source', CASE WHEN jsonb_array_length(v_kept) > 0 THEN v_kept END,
    'ambiguous_match', CASE WHEN v_nmatch > 1 THEN true END,
    'address_norm', v_prop.address_norm,
    'needs_geocode', (SELECT latitude IS NULL AND verified_latitude IS NULL FROM comp_property WHERE id = v_prop.id)
  ));
END;
$function$;
