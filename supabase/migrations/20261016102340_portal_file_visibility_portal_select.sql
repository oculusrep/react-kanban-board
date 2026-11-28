-- Portal users could not see any shared deal files.
--
-- 20261003113119_internal_only_caller_blind_policies locked
-- portal_file_visibility_select_all to internal users. The portal reads overrides
-- through get_portal_file_visibility_overrides(), which is SECURITY INVOKER, so a
-- portal user got zero rows and every file fell back to its default: deal files
-- hidden (nothing a broker shared showed up), property files visible (files a
-- broker explicitly hid showed up).
--
-- Portal users need both visible AND hidden overrides for their own entities: a
-- hidden child under a shared folder is only hidden if the hidden row is readable.
-- Scope is delegated to the existing deal / site_submit portal policies -- the
-- subqueries run under the caller's RLS, so a portal user only matches deals and
-- properties already visible to them.

CREATE POLICY portal_file_visibility_portal_select ON public.portal_file_visibility
  FOR SELECT TO authenticated
  USING (
    (entity_type = 'deal'     AND entity_id IN (SELECT d.id FROM public.deal d))
    OR
    (entity_type = 'property' AND entity_id IN (SELECT ss.property_id FROM public.site_submit ss))
  );
