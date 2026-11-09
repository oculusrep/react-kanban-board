-- broker_lite can create and edit the deals on their own deal teams, and work on
-- the site submits they can see. Read policies move to row-based tests so a row
-- written in the same statement passes (the id-array helpers can't see it yet).

CREATE OR REPLACE FUNCTION public.broker_lite_deal_team_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(array_agg(dt.id), '{}'::uuid[])
  FROM deal_team dt
  JOIN "user" u ON u.auth_user_id = auth.uid()
  WHERE u.ovis_role = 'broker_lite'
    AND u.first_name IS NOT NULL
    AND dt.label ~* ('\m' || u.first_name || '\M');
$$;

CREATE OR REPLACE FUNCTION public.broker_lite_client_ids()
RETURNS uuid[] LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
  SELECT COALESCE(array_agg(cb.client_id), '{}'::uuid[])
  FROM client_broker cb
  JOIN "user" u ON u.id = cb.user_id
  WHERE u.auth_user_id = auth.uid()
    AND u.ovis_role = 'broker_lite'
    AND cb.is_active;
$$;

REVOKE ALL ON FUNCTION public.broker_lite_deal_team_ids() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.broker_lite_client_ids() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.broker_lite_deal_team_ids() TO authenticated;
GRANT EXECUTE ON FUNCTION public.broker_lite_client_ids() TO authenticated;

-- A new deal with no team goes on the broker's own solo team, so it stays visible.
CREATE OR REPLACE FUNCTION public.default_broker_lite_deal_team()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public', 'pg_temp'
AS $$
BEGIN
  IF NEW.deal_team_id IS NULL AND get_user_role() = 'broker_lite' THEN
    SELECT dt.id INTO NEW.deal_team_id
    FROM deal_team dt
    JOIN "user" u ON u.auth_user_id = auth.uid()
    WHERE lower(dt.label) = lower(u.first_name)
    LIMIT 1;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.default_broker_lite_deal_team() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER trg_default_broker_lite_deal_team
  BEFORE INSERT ON public.deal
  FOR EACH ROW EXECUTE FUNCTION public.default_broker_lite_deal_team();

ALTER POLICY "Allow operations users to read deals" ON public.deal
  USING (
    (SELECT public.can_manage_operations())
    AND ((SELECT public.restricted_visible_deal_ids()) IS NULL
         OR deal_team_id = ANY ((SELECT public.broker_lite_deal_team_ids())::uuid[]))
  );

CREATE POLICY deal_broker_lite_insert ON public.deal
  FOR INSERT TO authenticated
  WITH CHECK (deal_team_id = ANY ((SELECT public.broker_lite_deal_team_ids())::uuid[]));

CREATE POLICY deal_broker_lite_update ON public.deal
  FOR UPDATE TO authenticated
  USING (deal_team_id = ANY ((SELECT public.broker_lite_deal_team_ids())::uuid[]))
  WITH CHECK (deal_team_id = ANY ((SELECT public.broker_lite_deal_team_ids())::uuid[]));

ALTER POLICY "Allow operations users to read site_submits" ON public.site_submit
  USING (
    (SELECT public.can_manage_operations())
    AND ((SELECT public.restricted_visible_site_submit_ids()) IS NULL
         OR id = ANY ((SELECT public.restricted_visible_site_submit_ids())::uuid[])
         OR client_id = ANY ((SELECT public.broker_lite_client_ids())::uuid[])
         OR created_by_id = (SELECT auth.uid()))
  );

CREATE POLICY site_submit_broker_lite_insert ON public.site_submit
  FOR INSERT TO authenticated
  WITH CHECK (client_id = ANY ((SELECT public.broker_lite_client_ids())::uuid[]));

CREATE POLICY site_submit_broker_lite_update ON public.site_submit
  FOR UPDATE TO authenticated
  USING (
    (SELECT public.get_user_role()) = 'broker_lite'
    AND (id = ANY ((SELECT public.restricted_visible_site_submit_ids())::uuid[])
         OR client_id = ANY ((SELECT public.broker_lite_client_ids())::uuid[]))
  )
  WITH CHECK (
    (SELECT public.get_user_role()) = 'broker_lite'
    AND (id = ANY ((SELECT public.restricted_visible_site_submit_ids())::uuid[])
         OR client_id = ANY ((SELECT public.broker_lite_client_ids())::uuid[]))
  );

-- Greg Bennett: Master Pipeline on, broker on 7-Eleven.
UPDATE public."user"
SET permissions = COALESCE(permissions, '{}'::jsonb) || '{"can_view_master_pipeline": true}'::jsonb
WHERE id = 'f9a7691f-0019-454c-be8f-124434a7deea';

INSERT INTO public.client_broker (client_id, user_id, is_active)
SELECT 'e6088c0d-d57b-485c-a3fd-c8d2c30bff37', 'f9a7691f-0019-454c-be8f-124434a7deea', true
WHERE NOT EXISTS (
  SELECT 1 FROM public.client_broker
  WHERE client_id = 'e6088c0d-d57b-485c-a3fd-c8d2c30bff37'
    AND user_id = 'f9a7691f-0019-454c-be8f-124434a7deea'
);

-- Records saved alongside a deal, on the broker's own deals only.
CREATE POLICY critical_date_broker_lite_write ON public.critical_date
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deal d
                 WHERE d.id = deal_id
                   AND d.deal_team_id = ANY ((SELECT public.broker_lite_deal_team_ids())::uuid[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.deal d
                      WHERE d.id = deal_id
                        AND d.deal_team_id = ANY ((SELECT public.broker_lite_deal_team_ids())::uuid[])));

CREATE POLICY deal_contact_broker_lite_write ON public.deal_contact
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.deal d
                 WHERE d.id = deal_id
                   AND d.deal_team_id = ANY ((SELECT public.broker_lite_deal_team_ids())::uuid[])))
  WITH CHECK (EXISTS (SELECT 1 FROM public.deal d
                      WHERE d.id = deal_id
                        AND d.deal_team_id = ANY ((SELECT public.broker_lite_deal_team_ids())::uuid[])));

-- These triggers keep payments, timelines and stage history in step with a deal.
-- Running as the caller, RLS would make them silently skip rows for broker_lite,
-- leaving payments stale after a fee change. Trigger functions can't be called
-- over the API, so running them as owner adds no new surface.
ALTER FUNCTION public.auto_archive_lost_deal_payments() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION public.auto_update_payment_amounts_on_deal_change() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION public.recalculate_payments_on_deal_change() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION public.record_deal_stage_change() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_deal_stage_to_site_submit() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_loi_date_from_deal() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_loi_date_from_site_submit() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_loi_date_on_site_submit_insert() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION public.sync_site_submit_stage_to_deal() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION public.trigger_create_timeline_critical_dates() SECURITY DEFINER SET search_path = public, pg_temp;
ALTER FUNCTION public.trigger_sync_deal_timeline_to_critical_dates() SECURITY DEFINER SET search_path = public, pg_temp;
