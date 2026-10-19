-- The last two caller-blind tables that needed no design decision.
--
-- 20261003113119 left both permissive on the assumption the portal read them.
-- Checked, and it does not:
--
--   property_note (3,308 rows of internal notes on every property)
--     PortalChatTab only INSERTs, mirroring a client comment into a note, and
--     INSERT is a separate policy ("Users can insert property notes", WITH CHECK
--     true) that this migration does not touch. The only reader,
--     usePropertyTimeline, is used by PropertyActivityTab - an internal property
--     page, not a portal route.
--
--   role (7 rows: role names + the permissions JSON, i.e. the authz model)
--     Read by hooks/usePermissions.tsx, which no portal page or component calls.
--
-- Still deliberately permissive, pending a decision: dropbox_mapping and
-- map_layer / map_layer_shape / map_layer_client_share. See
-- docs/SUPABASE_ANON_EXPOSURE_AUDIT.md.

BEGIN;

ALTER POLICY "Users can view property notes"
  ON public.property_note USING ((select is_internal_user()));

ALTER POLICY "Allow all authenticated users to read role"
  ON public.role USING ((select is_internal_user()));

COMMIT;

-- Verify by impersonation, and specifically prove the portal can still INSERT a
-- property note - a read-only check would miss a broken chat tab.
