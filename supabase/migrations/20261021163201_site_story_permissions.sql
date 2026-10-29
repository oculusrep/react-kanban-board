-- Site Story gets its own permissions, split from can_run_market_research:
--   can_view_site_story  — UI: see the Site Story section and read stored stories
--   can_run_site_story   — anything that calls ovis-site-research (spends tokens)
-- The edge function's gate moves from user_has_market_research_run_access()
-- to the helper below. Same shape: admin always passes; user override beats role.

CREATE OR REPLACE FUNCTION public.user_has_site_story_run_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT EXISTS (
    SELECT 1
    FROM "user" u
    LEFT JOIN role r ON r.name = u.ovis_role
    WHERE u.auth_user_id = auth.uid()
      AND (
        u.ovis_role = 'admin'
        OR COALESCE(
             (u.permissions ->> 'can_run_site_story')::boolean,
             (r.permissions ->> 'can_run_site_story')::boolean,
             FALSE
           ) = TRUE
      )
  );
$function$;

-- Grants: browser-callable only by signed-in users.
REVOKE ALL ON FUNCTION public.user_has_site_story_run_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_site_story_run_access() TO authenticated;

-- Carry today's access forward: the only holder of can_run_market_research is the
-- admin role, so admin gets both new keys. Every other role stays off until granted
-- in the permissions matrix.
UPDATE role
   SET permissions = permissions || '{"can_view_site_story": true, "can_run_site_story": true}'::jsonb
 WHERE name = 'admin';
