-- Broker Lite visibility: seed explicit map-layer defaults, and add user-to-user
-- sharing of custom map layers (map_layer_client_share only covers clients).

CREATE TABLE public.map_layer_user_share (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  layer_id     uuid NOT NULL REFERENCES public.map_layer(id) ON DELETE CASCADE,
  user_id      uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  shared_by_id uuid DEFAULT auth.uid(),
  shared_at    timestamptz NOT NULL DEFAULT now(),
  UNIQUE (layer_id, user_id)
);

CREATE INDEX map_layer_user_share_user_id_idx ON public.map_layer_user_share (user_id);

ALTER TABLE public.map_layer_user_share ENABLE ROW LEVEL SECURITY;

CREATE POLICY map_layer_user_share_select ON public.map_layer_user_share
  FOR SELECT TO authenticated
  USING ((SELECT public.is_internal_user()));

-- Only the layer's creator or a non-lite internal role may share or unshare.
CREATE POLICY map_layer_user_share_insert ON public.map_layer_user_share
  FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT public.get_user_role()) IN ('admin', 'broker_full', 'va')
    OR EXISTS (SELECT 1 FROM public.map_layer l
               WHERE l.id = layer_id AND l.created_by_id = (SELECT auth.uid()))
  );

CREATE POLICY map_layer_user_share_delete ON public.map_layer_user_share
  FOR DELETE TO authenticated
  USING (
    (SELECT public.get_user_role()) IN ('admin', 'broker_full', 'va')
    OR EXISTS (SELECT 1 FROM public.map_layer l
               WHERE l.id = layer_id AND l.created_by_id = (SELECT auth.uid()))
  );

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON public.map_layer_user_share FROM anon, authenticated;
GRANT SELECT, INSERT, DELETE ON public.map_layer_user_share TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.map_layer_user_share TO service_role;

-- Page toggles default off by being absent; layers need explicit values.
UPDATE public.role
SET permissions = COALESCE(permissions, '{}'::jsonb) || jsonb_build_object(
  'can_view_layer_properties', true,
  'can_view_layer_restaurants', true,
  'can_view_layer_cached_demographics', true,
  'can_view_layer_comp_database', true,
  'can_view_layer_merchants', true,
  'can_view_layer_municipal_projects', false,
  'can_view_all_custom_layers', false
)
WHERE name = 'broker_lite';

-- Record-level scope for restricted roles. deal.deal_team labels name brokers,
-- so a broker_lite user's deals are the teams whose label contains their first name.
CREATE OR REPLACE FUNCTION public.current_user_has_permission(p_key text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE((u.permissions ->> p_key)::boolean, (r.permissions ->> p_key)::boolean, false)
  FROM "user" u LEFT JOIN role r ON r.name = u.ovis_role
  WHERE u.auth_user_id = auth.uid()
  LIMIT 1;
$$;

-- NULL means unrestricted; an array (possibly empty) is the complete visible set.
CREATE OR REPLACE FUNCTION public.restricted_visible_deal_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN get_user_role() IS DISTINCT FROM 'broker_lite' OR current_user_has_permission('can_view_all_deals') THEN NULL
    ELSE COALESCE((
      SELECT array_agg(d.id)
      FROM deal d
      JOIN deal_team dt ON dt.id = d.deal_team_id
      JOIN "user" u ON u.auth_user_id = auth.uid()
      WHERE u.first_name IS NOT NULL
        AND dt.label ~* ('\m' || u.first_name || '\M')
    ), '{}'::uuid[])
  END;
$$;

CREATE OR REPLACE FUNCTION public.restricted_visible_site_submit_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT CASE
    WHEN get_user_role() IS DISTINCT FROM 'broker_lite' OR current_user_has_permission('can_view_site_submits') THEN NULL
    ELSE COALESCE((
      -- Separate branches, with the deal list computed once: OR-ing these across
      -- site_submit re-evaluates the deal function per row (~9s when tested).
      WITH my_deals AS MATERIALIZED (
        SELECT COALESCE(restricted_visible_deal_ids(), '{}'::uuid[]) AS ids
      ), me AS MATERIALIZED (
        SELECT id, auth_user_id FROM "user" WHERE auth_user_id = auth.uid() LIMIT 1
      ), visible AS (
        SELECT ss.id FROM site_submit ss, me WHERE ss.created_by_id = me.auth_user_id
        UNION
        SELECT ss.id FROM site_submit ss
          JOIN client_broker cb ON cb.client_id = ss.client_id AND cb.is_active
          JOIN me ON me.id = cb.user_id
        UNION
        SELECT ss.id FROM site_submit ss, my_deals WHERE ss.deal_id = ANY (my_deals.ids)
        UNION
        SELECT d.site_submit_id FROM deal d, my_deals
          WHERE d.id = ANY (my_deals.ids) AND d.site_submit_id IS NOT NULL
      )
      SELECT array_agg(id) FROM visible
    ), '{}'::uuid[])
  END;
$$;

REVOKE ALL ON FUNCTION public.current_user_has_permission(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restricted_visible_deal_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.restricted_visible_site_submit_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_user_has_permission(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.restricted_visible_deal_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.restricted_visible_site_submit_ids() TO authenticated;

ALTER POLICY "Allow operations users to read deals" ON public.deal
  USING (
    (SELECT public.can_manage_operations())
    AND ((SELECT public.restricted_visible_deal_ids()) IS NULL
         OR id = ANY ((SELECT public.restricted_visible_deal_ids())::uuid[]))
  );

ALTER POLICY "Allow operations users to read site_submits" ON public.site_submit
  USING (
    (SELECT public.can_manage_operations())
    AND ((SELECT public.restricted_visible_site_submit_ids()) IS NULL
         OR id = ANY ((SELECT public.restricted_visible_site_submit_ids())::uuid[]))
  );
