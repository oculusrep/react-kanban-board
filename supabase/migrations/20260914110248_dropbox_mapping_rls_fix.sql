-- dropbox_mapping RLS fix + is_internal_user() role-list repair.
--
-- 1) is_internal_user() hard-codes ('admin','broker_full','broker_limited','assistant').
--    The role table (user.ovis_role FK -> role.name, ON UPDATE CASCADE) now has
--    'va' and 'broker_lite' instead of 'assistant' and 'broker_limited'. The FK cascade
--    renamed the user rows but cannot reach a function body, so the VA has silently
--    failed this helper on every one of its 16 policies. Rebuilt from the LIVE
--    definition (pg_get_functiondef) with only the role list changed. The helper was
--    never in a migration file (drift); this puts it under version control.
--
-- 2) dropbox_mapping has permissive INSERT/UPDATE/DELETE policies USING/CHECK true
--    alongside the is_internal_user() policies. Permissive policies OR together, so
--    the internal-only ones restricted nothing: any authenticated user, including
--    portal clients, could rewrite folder mappings. Dropped. Reads are unchanged
--    (dropbox_mapping_select_all remains; the duplicate permissive read policy is
--    left alone — it grants nothing select_all doesn't).
--
-- Order matters: the helper is fixed BEFORE the permissive policies are dropped, so
-- there is no moment where the VA loses dropbox_mapping write access.

CREATE OR REPLACE FUNCTION public.is_internal_user()
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
AS $function$
DECLARE
  v_result BOOLEAN;
BEGIN
  SELECT EXISTS (
    SELECT 1 FROM "user"
    WHERE auth_user_id = auth.uid()
    AND ovis_role IN ('admin', 'broker_full', 'broker_lite', 'va')
  ) INTO v_result;

  RETURN COALESCE(v_result, FALSE);
END;
$function$;

DROP POLICY "Allow authenticated users to insert dropbox mappings" ON public.dropbox_mapping;
DROP POLICY "Allow authenticated users to update dropbox mappings" ON public.dropbox_mapping;
DROP POLICY "Allow authenticated users to delete dropbox mappings" ON public.dropbox_mapping;
