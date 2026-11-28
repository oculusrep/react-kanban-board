-- portal_file_visibility: allow site_submit rows.
--
-- site_submit became a Dropbox entity (its own folder under /Site Submits) but this
-- table's CHECK still only allowed 'property' and 'deal'. Every broker "share" toggle
-- on a site submit file failed the CHECK (the RPC error was swallowed client-side), so
-- the client got a "shared a file" chat notice for a file they could not open. Zero
-- site_submit rows existed in prod as of 2026-11-17.
--
-- Also lets portal users read site_submit overrides for site submits portal RLS shows
-- them, the same pattern as the deal/property branches.

ALTER TABLE public.portal_file_visibility
  DROP CONSTRAINT portal_file_visibility_entity_type_check;
ALTER TABLE public.portal_file_visibility
  ADD CONSTRAINT portal_file_visibility_entity_type_check
  CHECK (entity_type::text = ANY (ARRAY['property', 'deal', 'site_submit']::text[]));

DROP POLICY portal_file_visibility_portal_select ON public.portal_file_visibility;
CREATE POLICY portal_file_visibility_portal_select ON public.portal_file_visibility
  FOR SELECT TO authenticated
  USING (
       (entity_type::text = 'deal'        AND entity_id IN (SELECT d.id FROM public.deal d))
    OR (entity_type::text = 'property'    AND entity_id IN (SELECT ss.property_id FROM public.site_submit ss))
    OR (entity_type::text = 'site_submit' AND entity_id IN (SELECT ss.id FROM public.site_submit ss))
  );
