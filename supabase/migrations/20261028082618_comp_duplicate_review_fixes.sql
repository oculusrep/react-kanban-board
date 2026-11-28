-- Duplicate-comp review fixes (Mike's decisions 2026-10-28; docs/NNN_LISTING_INTAKE_SPEC_v2.md §12)
-- plus the one-off VA task to backfill leases on lease-less sales. Data only.
-- Apply AFTER 20261022105905 (needs comp_property.address_norm / review_status).
-- Audit columns on comp tables are AUTH ids; task columns are "user" ids.

DO $$
DECLARE
  v_mike_auth uuid := 'fe6e516f-11e1-4a3b-b914-910d59d9e8df';   -- auth.users id
  v_mike_user uuid := (SELECT id FROM public."user" WHERE auth_user_id = 'fe6e516f-11e1-4a3b-b914-910d59d9e8df');
  v_noree     uuid := (SELECT id FROM public."user" WHERE first_name = 'Noree' AND ovis_role = 'va');
  v_category  uuid := (SELECT id FROM public.task_category WHERE name = 'other' AND scope = 'global');
  v_n         integer;
  v_lines     text;
BEGIN
  -- 1. Hiram: delete the empty "Hilton / Candlewood Purchase" placeholder — only if it is still empty.
  IF EXISTS (SELECT 1 FROM public.lease_comp WHERE comp_property_id = '8b0e00f5-e3b2-418d-abab-f5da8fb4a5e2')
     OR EXISTS (SELECT 1 FROM public.sale_comp WHERE comp_property_id = '8b0e00f5-e3b2-418d-abab-f5da8fb4a5e2')
     OR EXISTS (SELECT 1 FROM public.operating_memorandum WHERE comp_property_id = '8b0e00f5-e3b2-418d-abab-f5da8fb4a5e2')
     OR EXISTS (SELECT 1 FROM public.comp_availability WHERE comp_property_id = '8b0e00f5-e3b2-418d-abab-f5da8fb4a5e2')
     OR EXISTS (SELECT 1 FROM public.site_submit_comment WHERE comp_property_id = '8b0e00f5-e3b2-418d-abab-f5da8fb4a5e2')
     OR EXISTS (SELECT 1 FROM public.dropbox_mapping WHERE entity_type = 'comp_property' AND entity_id = '8b0e00f5-e3b2-418d-abab-f5da8fb4a5e2') THEN
    RAISE EXCEPTION 'Hilton / Candlewood comp is no longer empty — not deleting';
  END IF;
  DELETE FROM public.comp_property WHERE id = '8b0e00f5-e3b2-418d-abab-f5da8fb4a5e2';

  -- 2. Macon: 7 Brew is a rezoning prospect on a resi lot, not Sonny's 5811 (pin reverse-geocodes to 5890).
  UPDATE public.comp_property SET address = '5890 Zebulon Rd', updated_by_id = v_mike_auth
   WHERE id = '0f3fb39a-970d-4797-a72d-f6ee41ca7b36';

  -- 3. Douglasville: separate comps. Both pins fall inside ONE undivided parcel,
  --    Douglas County PIN 0051015C005 (5955 Hwy 92 - Fairburn Rd, vacant 1.60 ac, CG,
  --    Sahni's Holdings LLC; no split recorded). Per Mike: no shared APN, no shared street
  --    address (would make them a same-address pair) — city/state/ZIP only until split.
  UPDATE public.comp_property SET city = 'Douglasville', state = 'GA', zip = '30134', updated_by_id = v_mike_auth
   WHERE id IN ('1d782056-396a-465a-837f-2fd5580f88b6', 'b182f082-2cda-4d19-854e-1fd52ec18061');

  -- 4. Hoschton Chipotle 3-pad site.
  UPDATE public.comp_property SET address = '3699 Hwy 53', updated_by_id = v_mike_auth
   WHERE id = '6be046ec-2453-4bd5-867d-7aca9575bb8d';

  -- 5. Dutch Bros Macon. (Dutch Bros / Sonny's $950K pair left as-is — decision 6.)
  UPDATE public.comp_property SET address = '5781 Zebulon Rd', updated_by_id = v_mike_auth
   WHERE id = 'aa444493-9000-4f24-90e3-919fa26d5c08';

  -- 6. One VA task: backfill the lease in place for sales on comps with no lease.
  SELECT count(*),
         string_agg(
           '• ' || COALESCE(cp.name, '(unnamed)')
           || ' — ' || concat_ws(', ', cp.address, cp.city)
           || ' — sold ' || COALESCE(to_char(s.sale_date, 'YYYY-MM-DD'), '(no date)')
           || COALESCE(' for $' || to_char(s.sale_price, 'FM999,999,999'), '')
           || ': https://ovis.oculusrep.com/listings/review?comp=' || cp.id,
           E'\n' ORDER BY cp.name)
    INTO v_n, v_lines
    FROM public.sale_comp s JOIN public.comp_property cp ON cp.id = s.comp_property_id
   WHERE NOT EXISTS (SELECT 1 FROM public.lease_comp l WHERE l.comp_property_id = s.comp_property_id);

  IF v_n > 0 THEN
    INSERT INTO public.task (subject, description, status, category, category_id, owner_id,
                             assigned_by_id, created_by_id, is_inbox)
    VALUES (
      'Backfill leases for ' || v_n || ' sales with no lease recorded',
      'These sale comps have no lease recorded, so their cap rates can''t be grouped by tenant, '
      || 'guarantor or term remaining. For each comp: open it (link), Leases tab → Add Lease Comp with '
      || 'the lease in place at the sale (tenant, guarantor + entity, base rent, increases, options, '
      || 'start/expiry), then Sales tab → Edit the sale → set "Lease in Place".' || E'\n'
      || 'If the sale was land or owner-occupied (no lease existed), add a note on the sale saying '
      || '"no lease — land sale" instead of creating a lease.' || E'\n\n'
      || v_lines,
      'open', 'other', v_category, v_noree, v_mike_user, v_mike_user, true
    );
  END IF;
END $$;
