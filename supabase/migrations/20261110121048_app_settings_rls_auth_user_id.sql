-- app_settings RLS: match the other admin tables.
-- The old policies compared "user".id = auth.uid(); every other table compares
-- "user".auth_user_id = auth.uid(). They only worked for an admin whose user.id happens to equal
-- their auth id. Also replaces the inherited anon/authenticated ALL grants with what the app uses
-- (browser reads + upserts from FinanceSettingsPage / PortalEmailSettingsPage; no deletes).

DROP POLICY IF EXISTS "Admins can view settings" ON public.app_settings;
DROP POLICY IF EXISTS "Admins can modify settings" ON public.app_settings;

CREATE POLICY app_settings_admin_select ON public.app_settings
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public."user" u
                 WHERE u.auth_user_id = (SELECT auth.uid()) AND u.ovis_role = 'admin'));

CREATE POLICY app_settings_admin_insert ON public.app_settings
  FOR INSERT TO authenticated
  WITH CHECK (EXISTS (SELECT 1 FROM public."user" u
                      WHERE u.auth_user_id = (SELECT auth.uid()) AND u.ovis_role = 'admin'));

CREATE POLICY app_settings_admin_update ON public.app_settings
  FOR UPDATE TO authenticated
  USING (EXISTS (SELECT 1 FROM public."user" u
                 WHERE u.auth_user_id = (SELECT auth.uid()) AND u.ovis_role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public."user" u
                      WHERE u.auth_user_id = (SELECT auth.uid()) AND u.ovis_role = 'admin'));

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON public.app_settings FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON public.app_settings TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.app_settings TO service_role;
