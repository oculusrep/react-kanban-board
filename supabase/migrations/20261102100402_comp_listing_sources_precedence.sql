-- NNN listing intake, piece 2 (docs/NNN_LISTING_LEASE_FINANCIALS_PLAN.md §2 + Mike's rules 6–8, 2026-11-02):
--
--  6. Multi-source listings: comp_listing_source keeps EVERY source (kind, label, url, first/last seen) per
--     offering. Each upsert adds or refreshes its own row and never replaces another source's URL.
--  7. Field precedence, highest wins:  1 manual (entered in OVIS)  2 OM  3 Showcase
--     4 Crexi / LoopNet / CoStar  5 aggregators (and anything unrecognised).  A derived value ranks below all (99).
--     - lower rank may fill an empty field, never overwrite a higher-ranked value;
--     - equal-or-higher rank may update, and the change is logged in comp_field_change;
--     - null/blank never overwrites;
--     - field_source (jsonb, per row) records each value's source kind, beside field_basis (stated/derived).
--     - Price/cap conflicts between sources: both kept as events tagged by source_kind; the listing is flagged
--       (operating_memorandum.price_conflict) and a checklist line goes on Noree's open task. A lower-ranked
--       conflicting figure is stored but `outranked`, so it never becomes the current ask.
--  8. Noree's task lists OM links CoStar → Crexi → LoopNet → others, Showcase last (data only).
--
-- Legacy values: a non-null field with no field_source key counts as MANUAL (rank 1), so nothing a person
-- typed can be overwritten. The backfill below tags only the fields the sweep itself writes, on rows the
-- sweep created, with that listing's source. (Every sweep row is stamped created_by = Mike's auth id, so a
-- hand edit of one of those specific fields before today can't be told apart; it is treated as sweep data.)

-- ---------------------------------------------------------------- columns
ALTER TABLE public.lease_comp
  ADD COLUMN IF NOT EXISTS field_source jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS rent_bumps_text text;
ALTER TABLE public.comp_property
  ADD COLUMN IF NOT EXISTS field_source jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS field_basis jsonb NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.operating_memorandum
  ADD COLUMN IF NOT EXISTS field_source jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS field_basis jsonb NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS broker_email text,
  ADD COLUMN IF NOT EXISTS broker_phone text,
  ADD COLUMN IF NOT EXISTS price_conflict boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS price_conflict_note text,
  ADD COLUMN IF NOT EXISTS price_conflict_at timestamptz;
ALTER TABLE public.comp_listing_event
  ADD COLUMN IF NOT EXISTS source_kind text,
  ADD COLUMN IF NOT EXISTS conflict boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS outranked boolean NOT NULL DEFAULT false;

-- ---------------------------------------------------------------- source kind + rank
CREATE OR REPLACE FUNCTION public.comp_source_kind(p_source text, p_url text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE
    WHEN p_url ~* '://([^/]*\.)?costar\.com'    THEN 'costar'
    WHEN p_url ~* '://([^/]*\.)?crexi\.com'     THEN 'crexi'
    WHEN p_url ~* '://([^/]*\.)?loopnet\.com'   THEN 'loopnet'
    WHEN p_url ~* '://([^/]*\.)?showcase\.com'  THEN 'showcase'
    WHEN p_url ~* '\.pdf(\?|$)'                 THEN 'om'
    WHEN p_source ~* 'costar'   THEN 'costar'
    WHEN p_source ~* 'crexi'    THEN 'crexi'
    WHEN p_source ~* 'loopnet'  THEN 'loopnet'
    WHEN p_source ~* 'showcase' THEN 'showcase'
    WHEN p_source ~* '(^|\W)om(\W|$)|offering memo' THEN 'om'
    ELSE 'aggregator' END   -- BuyNNN, Net Lease World, InvestmentGrade, broker sites, unknown
$$;
-- 'manual' is never returned: only a person editing in OVIS (comp_mark_manual_fields) makes a value manual.

CREATE OR REPLACE FUNCTION public.comp_source_rank(p_kind text)
RETURNS integer LANGUAGE sql IMMUTABLE SET search_path = public, pg_temp AS $$
  SELECT CASE p_kind
    WHEN 'manual' THEN 1 WHEN 'om' THEN 2 WHEN 'showcase' THEN 3
    WHEN 'crexi' THEN 4 WHEN 'loopnet' THEN 4 WHEN 'costar' THEN 4
    WHEN 'aggregator' THEN 5 WHEN 'derived' THEN 99
    ELSE 5 END
$$;

ALTER TABLE public.comp_listing_event
  DROP CONSTRAINT IF EXISTS comp_listing_event_source_kind_check,
  ADD CONSTRAINT comp_listing_event_source_kind_check
    CHECK (source_kind IN ('manual','om','showcase','crexi','loopnet','costar','aggregator'));

-- ---------------------------------------------------------------- tables
CREATE TABLE IF NOT EXISTS public.comp_listing_source (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  operating_memorandum_id uuid NOT NULL REFERENCES public.operating_memorandum(id) ON DELETE CASCADE,
  source_kind text NOT NULL CHECK (source_kind IN ('manual','om','showcase','crexi','loopnet','costar','aggregator')),
  source_label text,                  -- as the caller named it, e.g. "Crexi", "BuyNNN"
  url text,
  url_key text GENERATED ALWAYS AS (COALESCE(lower(btrim(url)), 'nourl:' || source_kind || ':' || lower(COALESCE(btrim(source_label), '')))) STORED,
  first_seen_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (operating_memorandum_id, url_key)
);
CREATE INDEX IF NOT EXISTS comp_listing_source_om_idx ON public.comp_listing_source (operating_memorandum_id);
ALTER TABLE public.comp_listing_source ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS comp_listing_source_internal_read ON public.comp_listing_source;
CREATE POLICY comp_listing_source_internal_read ON public.comp_listing_source
  FOR SELECT TO authenticated USING ((SELECT public.is_internal_user()));

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON public.comp_listing_source FROM anon, authenticated;
GRANT SELECT ON public.comp_listing_source TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comp_listing_source TO service_role;

CREATE TABLE IF NOT EXISTS public.comp_field_change (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  table_name text NOT NULL CHECK (table_name IN ('lease_comp','comp_property','operating_memorandum')),
  record_id uuid NOT NULL,
  operating_memorandum_id uuid REFERENCES public.operating_memorandum(id) ON DELETE SET NULL,
  field text NOT NULL,
  old_value jsonb,
  new_value jsonb,
  old_source text,
  new_source text,
  changed_by_id uuid,                 -- auth id for manual edits; NULL for the sweep
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS comp_field_change_record_idx ON public.comp_field_change (table_name, record_id, created_at DESC);
ALTER TABLE public.comp_field_change ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS comp_field_change_internal_read ON public.comp_field_change;
CREATE POLICY comp_field_change_internal_read ON public.comp_field_change
  FOR SELECT TO authenticated USING ((SELECT public.is_internal_user()));

-- Grants: written only by the definer functions below (and their triggers).
REVOKE ALL ON public.comp_field_change FROM anon, authenticated;
GRANT SELECT ON public.comp_field_change TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.comp_field_change TO service_role;

-- ---------------------------------------------------------------- precedence merge
-- Merge p_incoming {column: value} into one row of lease_comp / comp_property / operating_memorandum
-- under the precedence rules. p_derived lists incoming fields that are derived (rank 99), e.g. an
-- expiration computed from "14 years left". Returns {"applied":[...], "kept":[{field, held_by}]}.
CREATE OR REPLACE FUNCTION public.comp_merge_fields(
  p_table text, p_id uuid, p_incoming jsonb, p_kind text, p_om uuid, p_derived text[] DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
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
BEGIN
  IF p_table NOT IN ('lease_comp','comp_property','operating_memorandum') THEN
    RAISE EXCEPTION 'comp_merge_fields: unsupported table %', p_table;
  END IF;
  EXECUTE format('SELECT to_jsonb(t) FROM public.%I t WHERE id = $1', p_table) INTO v_row USING p_id;
  IF v_row IS NULL THEN RETURN jsonb_build_object('applied', '[]'::jsonb, 'kept', '[]'::jsonb); END IF;
  v_src := COALESCE(v_row->'field_source', '{}'::jsonb);
  v_basis := COALESCE(v_row->'field_basis', '{}'::jsonb);

  FOR f, v_in IN SELECT key, value FROM jsonb_each(COALESCE(p_incoming, '{}'::jsonb)) LOOP
    IF NOT (v_row ? f) THEN RAISE EXCEPTION 'comp_merge_fields: % has no column %', p_table, f; END IF;
    -- never overwrite with null / blank
    CONTINUE WHEN v_in IS NULL OR jsonb_typeof(v_in) = 'null' OR (jsonb_typeof(v_in) = 'string' AND btrim(v_in #>> '{}') = '');
    r_in := CASE WHEN f = ANY (p_derived) THEN 99 ELSE public.comp_source_rank(p_kind) END;
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
      IF r_cur <> 1000 THEN
        INSERT INTO comp_field_change (table_name, record_id, operating_memorandum_id, field, old_value, new_value, old_source, new_source)
        VALUES (p_table, p_id, p_om, f, v_cur, v_in, v_cur_src,
                CASE WHEN f = ANY (p_derived) THEN 'derived' ELSE p_kind END);
      END IF;
    ELSIF r_in < r_cur AND v_cur = v_in THEN
      -- same value from a better source: upgrade the provenance only
      v_src := v_src || jsonb_build_object(f, p_kind);
      IF NOT (f = ANY (p_derived)) THEN v_basis := v_basis - f; END IF;
      v_cols := v_cols || '__prov__';
    ELSIF r_in > r_cur AND v_cur IS DISTINCT FROM v_in THEN
      v_kept := v_kept || jsonb_build_object('field', f, 'held_by', v_cur_src);
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
$$;

-- ---------------------------------------------------------------- manual edits in OVIS
-- A person changing a tracked field in the UI makes it manual (rank 1) and stated, and logs the change.
-- Skipped for the merge function, the event sync and any non-user session (sweep / service role / psql).
CREATE OR REPLACE FUNCTION public.comp_mark_manual_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  f text; v_new jsonb; v_old jsonb; v_om uuid;
BEGIN
  IF current_setting('ovis.comp_merge', true) = 'on'
     OR current_setting('ovis.listing_event_sync', true) = 'on'
     OR auth.uid() IS NULL THEN
    RETURN NEW;
  END IF;
  v_new := to_jsonb(NEW); v_old := to_jsonb(OLD);
  v_om := CASE TG_TABLE_NAME WHEN 'operating_memorandum' THEN NEW.id ELSE NULL END;
  FOREACH f IN ARRAY TG_ARGV LOOP
    IF v_new->f IS DISTINCT FROM v_old->f THEN
      NEW.field_source := COALESCE(NEW.field_source, '{}'::jsonb) || jsonb_build_object(f, 'manual');
      NEW.field_basis := COALESCE(NEW.field_basis, '{}'::jsonb) - f;
      INSERT INTO comp_field_change (table_name, record_id, operating_memorandum_id, field, old_value, new_value,
                                     old_source, new_source, changed_by_id)
      VALUES (TG_TABLE_NAME, NEW.id, v_om, f, v_old->f, v_new->f,
              CASE WHEN OLD.field_basis->>f = 'derived' THEN 'derived' ELSE COALESCE(OLD.field_source->>f, 'manual') END,
              'manual', auth.uid());
    END IF;
  END LOOP;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS comp_mark_manual_fields ON public.lease_comp;
CREATE TRIGGER comp_mark_manual_fields BEFORE UPDATE ON public.lease_comp
  FOR EACH ROW EXECUTE FUNCTION public.comp_mark_manual_fields(
    'lease_type','guarantor_type','guarantor_name','annual_base_rent','lease_commencement_date',
    'lease_expiration_date','escalation_pct','rent_bump_frequency','rent_bumps_text','option_count',
    'option_term_years','option_periods','tenant_sqft');
DROP TRIGGER IF EXISTS comp_mark_manual_fields ON public.comp_property;
CREATE TRIGGER comp_mark_manual_fields BEFORE UPDATE ON public.comp_property
  FOR EACH ROW EXECUTE FUNCTION public.comp_mark_manual_fields('zip','parcel_id','building_sqft','land_acres');
DROP TRIGGER IF EXISTS comp_mark_manual_fields ON public.operating_memorandum;
CREATE TRIGGER comp_mark_manual_fields BEFORE UPDATE ON public.operating_memorandum
  FOR EACH ROW EXECUTE FUNCTION public.comp_mark_manual_fields(
    'broker_name','brokerage','broker_email','broker_phone','list_date','listed_term_remaining','listed_lease_type');

-- ---------------------------------------------------------------- derived rent must not read as manual
-- (Rebuilt from the live definition, 20261102100040; adds the merge flag around its UPDATE.)
CREATE OR REPLACE FUNCTION public.comp_sync_lease_rent_from_noi(p_om_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_noi numeric;
BEGIN
  SELECT e.noi INTO v_noi FROM comp_listing_event e
   WHERE e.operating_memorandum_id = p_om_id AND e.noi IS NOT NULL AND NOT e.outranked
   ORDER BY e.event_date DESC, e.created_at DESC LIMIT 1;
  IF v_noi IS NULL THEN RETURN; END IF;
  PERFORM set_config('ovis.comp_merge', 'on', true);
  UPDATE lease_comp l
     SET annual_base_rent = v_noi,
         field_basis = l.field_basis || '{"annual_base_rent": "derived"}'::jsonb
    FROM operating_memorandum o
   WHERE o.id = p_om_id AND l.id = o.lease_comp_id
     AND l.lease_type IN ('bts_nnn', 'ground_lease')
     AND (l.annual_base_rent IS NULL OR l.field_basis->>'annual_base_rent' = 'derived')
     AND l.annual_base_rent IS DISTINCT FROM v_noi;
  PERFORM set_config('ovis.comp_merge', 'off', true);
END;
$$;

-- ---------------------------------------------------------------- current ask ignores outranked figures
-- (Rebuilt from the live definition; only the two `NOT outranked` filters are new.)
CREATE OR REPLACE FUNCTION public.refresh_offering_from_events(p_om_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_price  numeric;
  v_cap    numeric;
  v_status text;
  v_prop   uuid;
BEGIN
  SELECT price INTO v_price FROM comp_listing_event
   WHERE operating_memorandum_id = p_om_id AND price IS NOT NULL AND NOT outranked
     AND event_type IN ('listed','relisted','price_change','cap_change','back_on_market')
   ORDER BY event_date DESC, created_at DESC LIMIT 1;
  SELECT cap_rate INTO v_cap FROM comp_listing_event
   WHERE operating_memorandum_id = p_om_id AND cap_rate IS NOT NULL AND NOT outranked
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
$function$;

-- ---------------------------------------------------------------- listing task helpers
-- Lines appended to the listing's OPEN VA task (tasks carry the listing link in their description).
CREATE OR REPLACE FUNCTION public.comp_append_listing_task_line(p_om uuid, p_line text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE v_n integer;
BEGIN
  UPDATE task SET description = COALESCE(description, '') || E'\n' || p_line
   WHERE status = 'open'
     AND description LIKE '%listings/review?listing=' || p_om::text || '%'
     AND position(p_line IN COALESCE(description, '')) = 0;   -- don't repeat a line
  GET DIAGNOSTICS v_n = ROW_COUNT;
  RETURN v_n;
END;
$$;

-- OM links for the task, ordered CoStar → Crexi → LoopNet → others → Showcase (data only, last).
CREATE OR REPLACE FUNCTION public.comp_listing_source_lines(p_om uuid)
RETURNS text
LANGUAGE sql STABLE
SET search_path = public, pg_temp
AS $$
  SELECT string_agg(
           CASE s.source_kind
             WHEN 'costar' THEN 'CoStar' WHEN 'crexi' THEN 'Crexi' WHEN 'loopnet' THEN 'LoopNet'
             WHEN 'showcase' THEN 'Showcase' WHEN 'om' THEN 'OM'
             ELSE COALESCE(NULLIF(btrim(s.source_label), ''), 'Other') END
           || CASE WHEN s.source_kind = 'showcase' THEN ' (data only: do NOT request the OM from Showcase brokers)' ELSE '' END
           || ': ' || COALESCE(s.url, '(no link)'),
           E'\n'
           ORDER BY CASE s.source_kind WHEN 'costar' THEN 1 WHEN 'crexi' THEN 2 WHEN 'loopnet' THEN 3
                                       WHEN 'om' THEN 4 WHEN 'aggregator' THEN 5 WHEN 'showcase' THEN 9 ELSE 6 END,
                    s.first_seen_at)
    FROM comp_listing_source s WHERE s.operating_memorandum_id = p_om
$$;

-- Rebuilt from the live definition: the single "Source:" line becomes the ordered OM-link list,
-- and an open price conflict is a checklist line.
CREATE OR REPLACE FUNCTION public.create_comp_va_task(p_listing_id uuid, p_assignee_first_name text, p_due date, p_title text, p_checklist text[], p_acting_auth_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
  v_sources  text;
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
  IF v_om.price_conflict THEN
    v_items := COALESCE(v_items, '{}') || ('Resolve price/cap conflict between sources: ' || COALESCE(v_om.price_conflict_note, 'see listing'));
  END IF;
  v_sources := COALESCE(public.comp_listing_source_lines(v_om.id),
                        CASE WHEN v_om.source_url IS NOT NULL THEN 'Source: ' || v_om.source_url END);

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
      CASE WHEN v_sources IS NOT NULL THEN E'\nOM links (CoStar → Crexi → LoopNet; Showcase last, data only):\n' || v_sources END,
      E'\nListing: https://ovis.oculusrep.com/listings/review?listing=' || v_om.id,
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
$function$;

-- ---------------------------------------------------------------- upsert (new signature)
-- Rebuilt from the live definition (20261028082618 + later). Matching, the rejected / recently-closed
-- guards and event typing are unchanged; field writes go through comp_merge_fields; sources are kept
-- per offering; price/cap conflicts are flagged. New params all default NULL, so a call with the old
-- named arguments still resolves.
DROP FUNCTION IF EXISTS public.upsert_comp_listing(text, text, text, text, text, text, numeric, numeric, numeric,
  text, text, text, text, text, text, date, text, text, uuid);

CREATE OR REPLACE FUNCTION public.upsert_comp_listing(
  p_tenant text, p_address text, p_city text, p_state text, p_zip text, p_apn text,
  p_price numeric, p_cap_rate numeric, p_noi numeric, p_lease_type text, p_term_left text,
  p_guarantor_type text, p_guarantor_name text, p_source text, p_source_url text, p_list_date date,
  p_broker_name text, p_brokerage text, p_acting_auth_id uuid,
  p_broker_email text DEFAULT NULL, p_broker_phone text DEFAULT NULL,
  p_current_rent numeric DEFAULT NULL, p_lease_start date DEFAULT NULL, p_lease_expiration date DEFAULT NULL,
  p_term_years_left numeric DEFAULT NULL,
  p_bumps_text text DEFAULT NULL, p_escalation_pct numeric DEFAULT NULL, p_bump_frequency text DEFAULT NULL,
  p_options_text text DEFAULT NULL, p_option_count integer DEFAULT NULL, p_option_term_years numeric DEFAULT NULL,
  p_building_sf numeric DEFAULT NULL, p_lot_acres numeric DEFAULT NULL)
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
      'building_sqft', p_building_sf, 'land_acres', p_lot_acres), v_kind, NULL);
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
      'listed_lease_type', NULLIF(btrim(p_lease_type), '')), v_kind, v_om.id);
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
        'option_periods', NULLIF(btrim(p_options_text), '')), v_kind, v_om.id);
    v_applied := v_applied || COALESCE((SELECT jsonb_agg('lease.' || x) FROM jsonb_array_elements_text(v_merge->'applied') x), '[]');
    v_kept := v_kept || COALESCE((SELECT jsonb_agg(k || jsonb_build_object('field', 'lease.' || (k->>'field'))) FROM jsonb_array_elements(v_merge->'kept') k), '[]');

    IF p_lease_expiration IS NULL AND p_term_years_left > 0 AND p_term_years_left < 100 THEN
      v_exp_derived := (COALESCE(p_list_date, v_today) + make_interval(months => round(p_term_years_left * 12)::int))::date;
      v_merge := public.comp_merge_fields('lease_comp', v_lease,
          jsonb_build_object('lease_expiration_date', v_exp_derived), v_kind, v_om.id, ARRAY['lease_expiration_date']);
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

-- ---------------------------------------------------------------- review view: + conflict, sources, broker contact
-- (Live definition with five columns appended; security_invoker kept.)
CREATE OR REPLACE VIEW public.comp_listing_facts WITH (security_invoker = true) AS
 WITH ev AS (
         SELECT e.id, e.operating_memorandum_id, e.event_date, e.event_type, e.price, e.cap_rate, e.noi,
            e.sale_comp_id, e.source_type, e.source_url, e.verification_method, e.recorded_by_kind,
            e.recorded_by_id, e.note, e.created_at,
            row_number() OVER (PARTITION BY e.operating_memorandum_id ORDER BY e.event_date, e.created_at) AS rn
           FROM comp_listing_event e
        ), orig AS (
         SELECT DISTINCT ON (ev.operating_memorandum_id) ev.operating_memorandum_id, ev.price, ev.cap_rate, ev.event_date
           FROM ev
          WHERE (ev.event_type = ANY (ARRAY['listed'::text, 'relisted'::text]))
          ORDER BY ev.operating_memorandum_id, ev.event_date, ev.created_at
        ), first_ev AS (
         SELECT ev.operating_memorandum_id,
            min(ev.event_date) AS first_event_date,
            count(*) FILTER (WHERE (ev.event_type = 'price_change'::text)) AS price_change_count,
            max(ev.event_date) FILTER (WHERE (ev.event_type = 'off_market'::text)) AS last_off_market_date,
            bool_or((ev.recorded_by_kind = 'sweep'::text)) AS tracked_by_sweep
           FROM ev
          GROUP BY ev.operating_memorandum_id
        )
 SELECT o.id AS listing_id,
    o.comp_property_id,
    cp.name AS property_name,
    cp.address,
    cp.city,
    cp.state,
    cp.address_norm,
    COALESCE(cp.verified_latitude, cp.latitude) AS lat,
    COALESCE(cp.verified_longitude, cp.longitude) AS lng,
    cp.review_status,
    cp.created_at AS property_created_at,
    o.lease_comp_id,
    lc.tenant_name AS tenant,
    lc.guarantor_type,
    lc.guarantor_name,
    o.listing_status,
    o.first_seen_at,
    o.last_seen_at,
    COALESCE(o.list_date, fe.first_event_date) AS list_date,
    orig.price AS original_ask,
    orig.cap_rate AS original_cap,
    o.asking_price AS current_ask,
    o.asking_cap_rate AS current_cap,
        CASE
            WHEN ((orig.price > (0)::numeric) AND (o.asking_price IS NOT NULL)) THEN round((((orig.price - o.asking_price) / orig.price) * (100)::numeric), 2)
            ELSE NULL::numeric
        END AS total_reduction_pct,
    COALESCE(fe.price_change_count, (0)::bigint) AS price_change_count,
    s.sale_price AS closed_price,
    s.cap_rate AS closed_cap,
    s.sale_date AS close_date,
    (COALESCE(s.sale_date,
        CASE
            WHEN (o.listing_status = 'off_market'::text) THEN fe.last_off_market_date
            ELSE NULL::date
        END, ((now() AT TIME ZONE 'America/New_York'::text))::date) - COALESCE(o.list_date, fe.first_event_date)) AS days_on_market,
        CASE
            WHEN ((s.sale_price IS NOT NULL) AND (o.asking_price > (0)::numeric)) THEN round((((s.sale_price - o.asking_price) / o.asking_price) * (100)::numeric), 2)
            ELSE NULL::numeric
        END AS ask_to_close_price_pct,
        CASE
            WHEN ((s.cap_rate IS NOT NULL) AND (o.asking_cap_rate IS NOT NULL)) THEN round(((s.cap_rate - o.asking_cap_rate) * (100)::numeric))
            ELSE NULL::numeric
        END AS ask_to_close_cap_spread_bps,
    COALESCE(fe.tracked_by_sweep, false) AS tracked_by_sweep,
    ((o.listing_status = 'active'::text) AND COALESCE(fe.tracked_by_sweep, false) AND (o.last_seen_at < (now() - '21 days'::interval))) AS possibly_off_market,
    o.listed_term_remaining,
    o.listed_lease_type,
    o.source_type,
    o.source_url,
    o.broker_name,
    o.brokerage,
    o.price_conflict,
    o.price_conflict_note,
    (SELECT count(*) FROM comp_listing_source cls WHERE cls.operating_memorandum_id = o.id) AS source_count,
    o.broker_email,
    o.broker_phone
   FROM (((((operating_memorandum o
     JOIN comp_property cp ON ((cp.id = o.comp_property_id)))
     LEFT JOIN lease_comp lc ON ((lc.id = o.lease_comp_id)))
     LEFT JOIN sale_comp s ON ((s.id = o.sale_comp_id)))
     LEFT JOIN orig ON ((orig.operating_memorandum_id = o.id)))
     LEFT JOIN first_ev fe ON ((fe.operating_memorandum_id = o.id)));

-- Grants: views need their own (re-stated; CREATE OR REPLACE keeps them, this makes it explicit).
REVOKE ALL ON public.comp_listing_facts FROM anon;
GRANT SELECT ON public.comp_listing_facts TO authenticated;

-- ---------------------------------------------------------------- function grants
REVOKE ALL ON FUNCTION public.upsert_comp_listing(text, text, text, text, text, text, numeric, numeric, numeric,
  text, text, text, text, text, text, date, text, text, uuid, text, text, numeric, date, date, numeric, text, numeric,
  text, text, integer, numeric, numeric, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_comp_listing(text, text, text, text, text, text, numeric, numeric, numeric,
  text, text, text, text, text, text, date, text, text, uuid, text, text, numeric, date, date, numeric, text, numeric,
  text, text, integer, numeric, numeric, numeric) TO service_role;
REVOKE ALL ON FUNCTION public.create_comp_va_task(uuid, text, date, text, text[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_comp_va_task(uuid, text, date, text, text[], uuid) TO service_role;
REVOKE ALL ON FUNCTION public.comp_merge_fields(text, uuid, jsonb, text, uuid, text[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comp_mark_manual_fields() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comp_append_listing_task_line(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comp_listing_source_lines(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.comp_sync_lease_rent_from_noi(uuid) FROM PUBLIC, anon, authenticated;
-- pure helpers, harmless and handy in the UI / SQL
GRANT EXECUTE ON FUNCTION public.comp_source_kind(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.comp_source_rank(text) TO authenticated;
REVOKE ALL ON FUNCTION public.comp_source_kind(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.comp_source_rank(text) FROM PUBLIC, anon;

-- ---------------------------------------------------------------- backfill
DO $$
DECLARE v_src int; v_ev int; v_fs int;
BEGIN
  -- sources: every distinct url the offering's events carry, plus the offering's own source_url
  INSERT INTO comp_listing_source (operating_memorandum_id, source_kind, source_label, url, first_seen_at, last_seen_at)
  SELECT x.om, public.comp_source_kind(x.label, x.url), x.label, x.url, x.first_seen, x.last_seen
    FROM (
      SELECT o.id AS om, o.source_reference AS label, o.source_url AS url,
             o.first_seen_at AS first_seen, o.last_seen_at AS last_seen
        FROM operating_memorandum o
       WHERE o.source_url IS NOT NULL OR o.source_reference IS NOT NULL
      UNION ALL
      SELECT e.operating_memorandum_id, o.source_reference, e.source_url, min(e.created_at), max(e.created_at)
        FROM comp_listing_event e JOIN operating_memorandum o ON o.id = e.operating_memorandum_id
       WHERE e.source_url IS NOT NULL AND e.source_url IS DISTINCT FROM o.source_url
       GROUP BY e.operating_memorandum_id, o.source_reference, e.source_url
    ) x
  ON CONFLICT (operating_memorandum_id, url_key) DO NOTHING;
  GET DIAGNOSTICS v_src = ROW_COUNT;

  -- event source_kind: manual for user-recorded events, else from the event's url / the offering's label
  UPDATE comp_listing_event e
     SET source_kind = CASE WHEN e.recorded_by_kind = 'user' THEN 'manual'
                            ELSE public.comp_source_kind(o.source_reference, COALESCE(e.source_url, o.source_url)) END
    FROM operating_memorandum o
   WHERE o.id = e.operating_memorandum_id AND e.source_kind IS NULL;
  GET DIAGNOSTICS v_ev = ROW_COUNT;

  -- field_source for the fields the sweep itself writes, on rows the sweep created
  PERFORM set_config('ovis.comp_merge', 'on', true);
  UPDATE operating_memorandum o
     SET field_source = o.field_source || (
           SELECT COALESCE(jsonb_object_agg(f, public.comp_source_kind(o.source_reference, o.source_url)), '{}'::jsonb)
             FROM unnest(ARRAY['broker_name','brokerage','list_date','listed_term_remaining','listed_lease_type']) f
            WHERE to_jsonb(o)->>f IS NOT NULL AND NOT (o.field_source ? f))
   WHERE o.source_type <> 'manual';
  UPDATE lease_comp l
     SET field_source = l.field_source || (
           SELECT COALESCE(jsonb_object_agg(f, public.comp_source_kind(l.source_reference, l.source_url)), '{}'::jsonb)
             FROM unnest(ARRAY['lease_type','guarantor_type','guarantor_name']) f
            WHERE to_jsonb(l)->>f IS NOT NULL AND NOT (l.field_source ? f))
   WHERE l.source_type <> 'manual';
  UPDATE comp_property p
     SET field_source = p.field_source || (
           SELECT COALESCE(jsonb_object_agg(f, public.comp_source_kind(p.source_reference, p.source_url)), '{}'::jsonb)
             FROM unnest(ARRAY['zip','parcel_id']) f
            WHERE to_jsonb(p)->>f IS NOT NULL AND NOT (p.field_source ? f))
   WHERE p.source_type <> 'manual' AND p.id <> ALL (ARRAY['aa444493-9000-4f24-90e3-919fa26d5c08','6be046ec-2453-4bd5-867d-7aca9575bb8d']::uuid[]);
  -- (the two comps whose ZIP Mike corrected on 2026-10-30 keep that ZIP as manual)
  PERFORM set_config('ovis.comp_merge', 'off', true);
  SELECT count(*) INTO v_fs FROM lease_comp WHERE field_source <> '{}'::jsonb;

  RAISE NOTICE 'backfill: % source rows, % events tagged, % leases with field provenance', v_src, v_ev, v_fs;
END $$;
