-- Portal / role authorization fix.
--
-- ROOT CAUSE (verified 2026-09-21, production, read-only impersonation):
--
--   get_user_role() = COALESCE((SELECT ovis_role FROM "user" WHERE id = auth.uid()),
--                              'broker_full')
--
-- It matched user.id (the OVIS primary key) against auth.uid() (the auth
-- identity). Those are equal for exactly ONE account — the admin — so every other
-- caller fell through to the 'broker_full' default: the VA, the external coach,
-- and every client-portal login. One portal login could read 5,923 contacts,
-- 4,775 properties, 772 deals and 7,883 critical dates, and write most of them.
--
-- TWO BUGS WERE CANCELLING OUT. The helpers and 19 policies still use role names
-- from before the ovis_role rename ('assistant' → 'va', 'broker_limited' →
-- 'broker_lite'): the FK rename cascaded to rows, never to function bodies or
-- policy text. The broken default is what kept the VA working. Fixing only the
-- lookup would have removed ALL of the VA's write access (measured: 3,219 site
-- submits → 0). So this migration fixes the lookup AND the role names together.
--
-- Decisions (2026-09-21):
--   * No match returns NULL, and NULL means no access. The helpers COALESCE to
--     false so a NULL can never be inverted into access by NOT / <> in a policy.
--   * VA is treated exactly like broker_full everywhere — including payments and
--     commission splits — preserving what the VA can do today (and matching the
--     VA role's own can_manage_payments permission).
--   * Coach: no access. Rob Report / Goal Dashboard / Scorecard will be empty.
--   * broker_lite: mapped from broker_limited wherever the old name appeared. No
--     broker_lite login exists today, so nobody's access changes.
--
-- NOT changed, deliberately: finalize_thread_run and
-- recompute_research_thread_state contain the string 'assistant' — it is an LLM
-- message role in site research, not an OVIS role.

-- ===========================================================================
-- 1. The lookup
-- ===========================================================================
CREATE OR REPLACE FUNCTION public.get_user_role()
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  -- auth_user_id, not id. No default: a caller with no OVIS user row (a portal
  -- login, anon) has no role, and NULL is no access.
  SELECT ovis_role FROM "user" WHERE auth_user_id = auth.uid() LIMIT 1;
$function$;

-- ===========================================================================
-- 2. Helpers: current role names, and NULL-safe (COALESCE to false)
-- ===========================================================================
-- Attributes (LANGUAGE sql, STABLE, search_path) copied from the live
-- definitions via pg_get_functiondef, not from an older migration file.
CREATE OR REPLACE FUNCTION public.can_manage_operations()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(public.get_user_role() IN ('admin', 'broker_full', 'broker_lite', 'va', 'testing'), false);
$function$;

CREATE OR REPLACE FUNCTION public.has_full_access()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(public.get_user_role() IN ('admin', 'testing'), false);
$function$;

CREATE OR REPLACE FUNCTION public.is_admin()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(public.get_user_role() = 'admin', false);
$function$;

CREATE OR REPLACE FUNCTION public.is_assistant()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(public.get_user_role() = 'va', false);
$function$;

CREATE OR REPLACE FUNCTION public.is_broker()
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(public.get_user_role() IN ('admin', 'broker_full', 'broker_lite'), false);
$function$;

-- ===========================================================================
-- 3. Policies with hardcoded stale role names
-- ===========================================================================
-- GENERATED from pg_policies (live definitions), then reviewed. Transformations,
-- and nothing else: 'assistant' → 'va', 'broker_limited' → 'broker_lite', and
-- 'va' added wherever 'broker_full' appears without it (the VA parity decision).
-- Command, roles, PERMISSIVE and both USING and WITH CHECK are carried over.
-- get_user_role() = ANY(...) is NULL-safe on its own: NULL = ANY yields NULL,
-- which a policy treats as false.

-- assignment.Allow operations users to modify assignments  (ALL)
DROP POLICY "Allow operations users to modify assignments" ON public.assignment;
CREATE POLICY "Allow operations users to modify assignments" ON public.assignment AS PERMISSIVE FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- client.Allow operations users to modify clients  (ALL)
DROP POLICY "Allow operations users to modify clients" ON public.client;
CREATE POLICY "Allow operations users to modify clients" ON public.client AS PERMISSIVE FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- commission_split.Allow only admins and full brokers to modify commissions  (ALL)
DROP POLICY "Allow only admins and full brokers to modify commissions" ON public.commission_split;
CREATE POLICY "Allow only admins and full brokers to modify commissions" ON public.commission_split AS PERMISSIVE FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- contact.Allow operations users to modify contacts  (ALL)
DROP POLICY "Allow operations users to modify contacts" ON public.contact;
CREATE POLICY "Allow operations users to modify contacts" ON public.contact AS PERMISSIVE FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- contact_client_relation.Allow operations users to delete contact_client_relation  (DELETE)
DROP POLICY "Allow operations users to delete contact_client_relation" ON public.contact_client_relation;
CREATE POLICY "Allow operations users to delete contact_client_relation" ON public.contact_client_relation AS PERMISSIVE FOR DELETE TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- contact_client_relation.Allow operations users to insert contact_client_relation  (INSERT)
DROP POLICY "Allow operations users to insert contact_client_relation" ON public.contact_client_relation;
CREATE POLICY "Allow operations users to insert contact_client_relation" ON public.contact_client_relation AS PERMISSIVE FOR INSERT TO authenticated
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- contact_client_relation.Allow operations users to update contact_client_relation  (UPDATE)
DROP POLICY "Allow operations users to update contact_client_relation" ON public.contact_client_relation;
CREATE POLICY "Allow operations users to update contact_client_relation" ON public.contact_client_relation AS PERMISSIVE FOR UPDATE TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- contact_lead_list.Allow operations to modify contact_lead_list  (ALL)
DROP POLICY "Allow operations to modify contact_lead_list" ON public.contact_lead_list;
CREATE POLICY "Allow operations to modify contact_lead_list" ON public.contact_lead_list AS PERMISSIVE FOR ALL TO public
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- critical_date.Allow operations users to modify critical_date  (ALL)
DROP POLICY "Allow operations users to modify critical_date" ON public.critical_date;
CREATE POLICY "Allow operations users to modify critical_date" ON public.critical_date AS PERMISSIVE FOR ALL TO public
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- deal.Allow operations users to modify deals  (ALL)
DROP POLICY "Allow operations users to modify deals" ON public.deal;
CREATE POLICY "Allow operations users to modify deals" ON public.deal AS PERMISSIVE FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- deal_contact.Allow operations users to modify deal_contact  (ALL)
DROP POLICY "Allow operations users to modify deal_contact" ON public.deal_contact;
CREATE POLICY "Allow operations users to modify deal_contact" ON public.deal_contact AS PERMISSIVE FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- deal_team.Allow operations users to modify deal_team  (ALL)
DROP POLICY "Allow operations users to modify deal_team" ON public.deal_team;
CREATE POLICY "Allow operations users to modify deal_team" ON public.deal_team AS PERMISSIVE FOR ALL TO public
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- payment.Allow only admins and full brokers to modify payments  (ALL)
DROP POLICY "Allow only admins and full brokers to modify payments" ON public.payment;
CREATE POLICY "Allow only admins and full brokers to modify payments" ON public.payment AS PERMISSIVE FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- payment_split.Allow only admins and full brokers to modify payment_splits  (ALL)
DROP POLICY "Allow only admins and full brokers to modify payment_splits" ON public.payment_split;
CREATE POLICY "Allow only admins and full brokers to modify payment_splits" ON public.payment_split AS PERMISSIVE FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- portal_activity_log.Admins can view all portal activity  (SELECT)
-- EXCLUDED from the VA-parity rule: this policy checks ovis_role directly and
-- was never broken, so the VA has never had this access. Adding 'va' here would
-- WIDEN the VA (harness: 0 -> 886 rows), not preserve it. Only the stale
-- 'broker_limited' name is renamed.
DROP POLICY "Admins can view all portal activity" ON public.portal_activity_log;
CREATE POLICY "Admins can view all portal activity" ON public.portal_activity_log AS PERMISSIVE FOR SELECT TO authenticated
  USING ((EXISTS ( SELECT 1
   FROM "user" u
  WHERE ((u.auth_user_id = auth.uid()) AND (u.ovis_role = ANY (ARRAY['admin'::text, 'broker_full'::text, 'broker_lite'::text]))))));

-- property.Allow operations users to modify properties  (ALL)
DROP POLICY "Allow operations users to modify properties" ON public.property;
CREATE POLICY "Allow operations users to modify properties" ON public.property AS PERMISSIVE FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- property_contact.Allow operations users to modify property_contact  (ALL)
DROP POLICY "Allow operations users to modify property_contact" ON public.property_contact;
CREATE POLICY "Allow operations users to modify property_contact" ON public.property_contact AS PERMISSIVE FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- property_special_layer.Allow operations to modify property_special_layer  (ALL)
DROP POLICY "Allow operations to modify property_special_layer" ON public.property_special_layer;
CREATE POLICY "Allow operations to modify property_special_layer" ON public.property_special_layer AS PERMISSIVE FOR ALL TO public
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- property_unit.Allow operations users to modify property_units  (ALL)
DROP POLICY "Allow operations users to modify property_units" ON public.property_unit;
CREATE POLICY "Allow operations users to modify property_units" ON public.property_unit AS PERMISSIVE FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));

-- site_submit.Allow operations users to modify site_submits  (ALL)
DROP POLICY "Allow operations users to modify site_submits" ON public.site_submit;
CREATE POLICY "Allow operations users to modify site_submits" ON public.site_submit AS PERMISSIVE FOR ALL TO authenticated
  USING ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])))
  WITH CHECK ((get_user_role() = ANY (ARRAY['admin'::text, 'broker_full'::text, 'va'::text, 'testing'::text])));


-- ===========================================================================
-- 4. site_submit_comment — portal users see client-visible comments only
-- ===========================================================================
-- The portal read policy checked tenancy but never `visibility`, so 95 internal
-- broker comments were readable by portal users; the .eq('visibility','client')
-- in PortalChatTab is a client-side filter that a direct API call skips.
-- portal_user_can_access_site_submit() is SECURITY DEFINER and keyed on the
-- contact's portal_auth_user_id, so it is correct for portal logins.
DROP POLICY IF EXISTS "Portal users can read comments for accessible clients" ON public.site_submit_comment;
CREATE POLICY "Portal users can read comments for accessible clients" ON public.site_submit_comment
  FOR SELECT TO authenticated
  USING (visibility = 'client' AND public.portal_user_can_access_site_submit(site_submit_id, auth.uid()));

-- Same rule on write: a portal user creating an 'internal' comment could not then
-- read it, and should not be able to plant one in the broker channel.
DROP POLICY IF EXISTS "Portal users can create comments for accessible clients" ON public.site_submit_comment;
CREATE POLICY "Portal users can create comments for accessible clients" ON public.site_submit_comment
  FOR INSERT TO authenticated
  WITH CHECK (visibility = 'client' AND public.portal_user_can_access_site_submit(site_submit_id, auth.uid()));
-- comment_internal_select / comment_internal_insert / comment_self_update /
-- comment_admin_delete are unchanged.

-- ===========================================================================
-- 5. site_submit_activity — portal reads client_visible rows only, never writes
-- ===========================================================================
-- Was: authenticated read USING (true) and authenticated ALL USING (true) — every
-- portal user read all 1,556 rows for every client, including client_visible =
-- false, and could write them. The capture_* triggers that populate this table
-- are SECURITY DEFINER, so removing portal write does not break portal comments.
DROP POLICY IF EXISTS "Authenticated read site_submit_activity" ON public.site_submit_activity;
DROP POLICY IF EXISTS "Authenticated write site_submit_activity" ON public.site_submit_activity;

CREATE POLICY site_submit_activity_internal_all ON public.site_submit_activity
  FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

-- Tenancy through the same DEFINER helper the comment policy uses: an inline
-- subquery on contact would be filtered by contact's own RLS, which portal users
-- no longer pass.
CREATE POLICY site_submit_activity_portal_select ON public.site_submit_activity
  FOR SELECT TO authenticated
  USING (client_visible = true AND public.portal_user_can_access_site_submit(site_submit_id, auth.uid()));

-- ===========================================================================
-- 6. Internal-only tables
-- ===========================================================================
-- deal_synopsis: generated by deal-synopsis FROM email-derived activity
-- (subject + snippet). Empty today; refills the moment the function runs.
DROP POLICY IF EXISTS deal_synopsis_select ON public.deal_synopsis;
CREATE POLICY deal_synopsis_select ON public.deal_synopsis
  FOR SELECT TO authenticated USING (public.is_internal_user());

-- portal_email_send: full rendered HTML of every digest/alert, every client —
-- 56,150 rows were readable by any portal login. Written only by the send-portal-*
-- functions (service_role), so authenticated gets read, internal only.
DROP POLICY IF EXISTS "Authenticated read portal_email_send" ON public.portal_email_send;
DROP POLICY IF EXISTS "Authenticated write portal_email_send" ON public.portal_email_send;
CREATE POLICY portal_email_send_internal_select ON public.portal_email_send
  FOR SELECT TO authenticated USING (public.is_internal_user());

-- hunter_outreach_draft: outbound subject, body, contact email and phone.
DROP POLICY IF EXISTS hunter_outreach_draft_select ON public.hunter_outreach_draft;
DROP POLICY IF EXISTS hunter_outreach_draft_insert ON public.hunter_outreach_draft;
DROP POLICY IF EXISTS hunter_outreach_draft_update ON public.hunter_outreach_draft;
DROP POLICY IF EXISTS hunter_outreach_draft_delete ON public.hunter_outreach_draft;
CREATE POLICY hunter_outreach_draft_internal_all ON public.hunter_outreach_draft
  FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

-- property_activity / prospecting_activity: empty or near-empty, but their
-- email_subject columns would be portal-readable the moment anything writes
-- them. Being internal is ADDED to the existing ownership rules, never replacing
-- them, so nobody gains update/delete on rows they don't own.
DROP POLICY IF EXISTS "Users can view property activities" ON public.property_activity;
DROP POLICY IF EXISTS "Users can insert property activities" ON public.property_activity;
DROP POLICY IF EXISTS "Users can update their own property activities" ON public.property_activity;
DROP POLICY IF EXISTS "Users can delete their own property activities" ON public.property_activity;
CREATE POLICY property_activity_select ON public.property_activity
  FOR SELECT TO authenticated USING (public.is_internal_user());
CREATE POLICY property_activity_insert ON public.property_activity
  FOR INSERT TO authenticated WITH CHECK (public.is_internal_user());
CREATE POLICY property_activity_update ON public.property_activity
  FOR UPDATE TO authenticated USING (public.is_internal_user() AND created_by = auth.uid());
CREATE POLICY property_activity_delete ON public.property_activity
  FOR DELETE TO authenticated USING (public.is_internal_user() AND created_by = auth.uid());

DROP POLICY IF EXISTS prospecting_activity_select ON public.prospecting_activity;
DROP POLICY IF EXISTS prospecting_activity_insert ON public.prospecting_activity;
DROP POLICY IF EXISTS prospecting_activity_update ON public.prospecting_activity;
DROP POLICY IF EXISTS prospecting_activity_delete ON public.prospecting_activity;
CREATE POLICY prospecting_activity_select ON public.prospecting_activity
  FOR SELECT TO authenticated USING (public.is_internal_user());
CREATE POLICY prospecting_activity_insert ON public.prospecting_activity
  FOR INSERT TO authenticated WITH CHECK (public.is_internal_user() AND auth.uid() = created_by);
CREATE POLICY prospecting_activity_update ON public.prospecting_activity
  FOR UPDATE TO authenticated USING (public.is_internal_user() AND auth.uid() = created_by);
CREATE POLICY prospecting_activity_delete ON public.prospecting_activity
  FOR DELETE TO authenticated USING (public.is_internal_user() AND auth.uid() = created_by);

-- thread_message: six overlapping policies, the permissive USING (true) ones
-- making the "own messages" ones moot. Empty; collapsed to internal-only.
DROP POLICY IF EXISTS "Users can insert thread messages" ON public.thread_message;
DROP POLICY IF EXISTS "Users can read their own thread messages" ON public.thread_message;
DROP POLICY IF EXISTS "Users can update their own thread messages" ON public.thread_message;
DROP POLICY IF EXISTS insert_thread_message ON public.thread_message;
DROP POLICY IF EXISTS select_thread_message ON public.thread_message;
DROP POLICY IF EXISTS update_thread_message ON public.thread_message;
CREATE POLICY thread_message_select ON public.thread_message
  FOR SELECT TO authenticated USING (public.is_internal_user());
CREATE POLICY thread_message_insert ON public.thread_message
  FOR INSERT TO authenticated WITH CHECK (public.is_internal_user() AND created_by = auth.uid());
CREATE POLICY thread_message_update ON public.thread_message
  FOR UPDATE TO authenticated USING (public.is_internal_user() AND created_by = auth.uid());

-- ===========================================================================
-- 7. Grants — surplus defaults revoked on every step-3 table
-- ===========================================================================
-- ALTER DEFAULT PRIVILEGES in this database grants anon and authenticated ALL on
-- every new public table. Revoke, then grant back only what the app uses; the
-- policies above then decide rows. service_role is untouched.
REVOKE ALL ON public.site_submit_comment, public.site_submit_activity, public.deal_synopsis,
  public.portal_email_send, public.hunter_outreach_draft, public.property_activity,
  public.prospecting_activity, public.thread_message
  FROM anon, authenticated;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_submit_comment TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.site_submit_activity TO authenticated;
GRANT SELECT ON public.deal_synopsis TO authenticated;           -- written by deal-synopsis (service_role)
GRANT SELECT ON public.portal_email_send TO authenticated;       -- written by send-portal-* (service_role)
GRANT SELECT, INSERT, UPDATE, DELETE ON public.hunter_outreach_draft TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.property_activity TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.prospecting_activity TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.thread_message TO authenticated;

-- ===========================================================================
-- 8. INTERIM portal read access — TEMPORARY
-- ===========================================================================
-- Until this migration, the client portal had NO policies of its own on these
-- tables: every portal page worked only because get_user_role() mistakenly
-- treated clients as broker_full. Fixing that alone would show every client an
-- empty portal, so these read-only, own-clients-only policies keep the portal
-- working while ending cross-client visibility today (measured: 3,219 site
-- submits and 564 clients visible to one portal login, down to their own).
--
-- REPLACE THESE in feature/portal-field-control: that branch routes portal reads
-- through a portal-only function/view driven by the User Management matrix, with
-- no direct SELECT on these base tables. Delete this section then.
--
-- portal_user_client_ids() is the existing SECURITY DEFINER helper (returns
-- uuid[]), so these policies do not depend on the portal being able to read
-- contact or portal_user_client_access — which it no longer can.
--
-- SELECT only, and additive: they cannot widen internal access, and no portal
-- write path is created. Stage visibility is deliberately NOT enforced here --
-- is_portal_visible_stage() is broken (it selects submit_stage.stage_name, which
-- does not exist) and is dead code; the UI's own stage filter still applies.
CREATE POLICY client_portal_select ON public.client
  FOR SELECT TO authenticated
  USING (id = ANY (public.portal_user_client_ids()));

CREATE POLICY site_submit_portal_select ON public.site_submit
  FOR SELECT TO authenticated
  USING (client_id = ANY (public.portal_user_client_ids()));

-- Deals reach the portal sidebar through deal.site_submit_id, not deal.client_id
-- (PortalDetailSidebar queries .eq('site_submit_id', …)), so scope by both.
CREATE POLICY deal_portal_select ON public.deal
  FOR SELECT TO authenticated
  USING (
    client_id = ANY (public.portal_user_client_ids())
    OR site_submit_id IN (
      SELECT ss.id FROM public.site_submit ss
      WHERE ss.client_id = ANY (public.portal_user_client_ids())
    )
  );

-- The portal user's OWN contact row, and nothing else. PortalContext,
-- PortalRoute and PortalNavbar all read it — without this the portal cannot even
-- finish loading, since it resolves the signed-in contact before anything else.
-- portal_user_contact_id() is SECURITY DEFINER, so this does not require the
-- portal to be able to read contact in the first place.
CREATE POLICY contact_portal_select_self ON public.contact
  FOR SELECT TO authenticated
  USING (id = public.portal_user_contact_id());

-- The properties (and their units) behind those site submits, nothing else.
CREATE POLICY property_portal_select ON public.property
  FOR SELECT TO authenticated
  USING (id IN (
    SELECT ss.property_id FROM public.site_submit ss
    WHERE ss.property_id IS NOT NULL
      AND ss.client_id = ANY (public.portal_user_client_ids())
  ));

CREATE POLICY property_unit_portal_select ON public.property_unit
  FOR SELECT TO authenticated
  USING (property_id IN (
    SELECT ss.property_id FROM public.site_submit ss
    WHERE ss.property_id IS NOT NULL
      AND ss.client_id = ANY (public.portal_user_client_ids())
  ));
