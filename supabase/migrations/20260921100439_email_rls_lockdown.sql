-- Email RLS lockdown.
--
-- Measured problem (2026-09-20/21, production, read-only impersonation):
-- an EXTERNAL coach account could read 12,828 full email bodies and a client
-- PORTAL login 12,769, none of which were their own mail. Cause: the emails
-- SELECT policy had two branches that never referenced the caller —
--
--   OR (id IN (SELECT email_id FROM email_object_link))
--   OR (id IN (SELECT email_id FROM activity WHERE email_id IS NOT NULL))
--
-- so any authenticated principal of any kind saw every linked email. On top of
-- that, email_object_link allowed INSERT/UPDATE/DELETE to anyone authenticated,
-- and email_attachments SELECT was USING (true).
--
-- The visibility rule this migration implements (decided 2026-09-21):
--   * your own mailbox  — email_visibility rows for auth.uid()
--   * PLUS any email linked to an OVIS record, for internal users only
--   * unlinked email stays private to its mailbox owner
--   * coach, portal and anon users see no email at all
--
-- service_role bypasses RLS, so gmail-sync and email-triage are unaffected.

-- ---------------------------------------------------------------------------
-- 1. emails — own mailbox, plus linked mail for internal users
-- ---------------------------------------------------------------------------
-- TO authenticated (not `public`): anon is excluded by the role list as well as
-- by the grants below, so this does not depend on one mechanism alone.
DROP POLICY IF EXISTS emails_select ON public.emails;
CREATE POLICY emails_select ON public.emails
  FOR SELECT TO authenticated
  USING (
    -- Your own mailbox. Unlinked mail is visible ONLY through this branch.
    id IN (
      SELECT v.email_id FROM public.email_visibility v
      JOIN public."user" u ON u.id = v.user_id
      WHERE u.auth_user_id = auth.uid()
    )
    -- Linked mail is company knowledge, but only inside the company. The
    -- is_internal_user() test is what a coach or portal login now fails.
    OR (
      public.is_internal_user()
      AND id IN (SELECT l.email_id FROM public.email_object_link l)
    )
  );

-- The old policy's third branch (any email with an activity row) is deliberately
-- gone. MEASURED cost of removing it: 49 emails have an activity row but no link
-- row. After this migration those 49 are visible only to their mailbox owner
-- (admin loses 9, broker_full 29, a mailbox-less internal user 49). They are
-- reachable again the moment anyone links them to a record, and the activity row
-- itself — subject plus a 201-char snippet — stays visible to internal users.

-- ---------------------------------------------------------------------------
-- 2. email_object_link — internal users only, for reads AND writes
-- ---------------------------------------------------------------------------
-- NOTE, deliberate deviation from "remove INSERT/UPDATE/DELETE from
-- authenticated": writes are scoped to internal users rather than removed.
-- Removing them entirely would break manual linking for admins — the "Add tag"
-- action in EmailDetailModal, Add Link / Correct / Remove in
-- /admin/email-review, and the queue pages all insert or delete these rows as
-- the logged-in user, not via service_role. Scoping to is_internal_user() closes
-- the portal/coach hole (the actual finding) while leaving staff workflows
-- intact. Tighten to admin-only later if that is the intent.
DROP POLICY IF EXISTS email_object_link_select ON public.email_object_link;
DROP POLICY IF EXISTS email_object_link_insert ON public.email_object_link;
DROP POLICY IF EXISTS email_object_link_update ON public.email_object_link;
DROP POLICY IF EXISTS email_object_link_delete ON public.email_object_link;

CREATE POLICY email_object_link_select ON public.email_object_link
  FOR SELECT TO authenticated USING (public.is_internal_user());
CREATE POLICY email_object_link_insert ON public.email_object_link
  FOR INSERT TO authenticated WITH CHECK (public.is_internal_user());
CREATE POLICY email_object_link_update ON public.email_object_link
  FOR UPDATE TO authenticated USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());
CREATE POLICY email_object_link_delete ON public.email_object_link
  FOR DELETE TO authenticated USING (public.is_internal_user());

-- ---------------------------------------------------------------------------
-- 3. email_attachments — internal users only (was USING (true))
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can view email attachments" ON public.email_attachments;
DROP POLICY IF EXISTS email_attachments_select_internal ON public.email_attachments;
CREATE POLICY email_attachments_select_internal ON public.email_attachments
  FOR SELECT TO authenticated USING (public.is_internal_user());
-- The three service_role write policies are left exactly as they are.

-- ---------------------------------------------------------------------------
-- 4. Grants — stop relying on policies alone
-- ---------------------------------------------------------------------------
-- This database's ALTER DEFAULT PRIVILEGES hands anon, authenticated and
-- service_role ALL privileges on every new public table, so each of these five
-- tables carried INSERT/UPDATE/DELETE/TRUNCATE for anon. RLS was the only thing
-- in the way. Revoke, then grant back exactly what the app uses.
REVOKE ALL ON public.emails FROM anon, authenticated;
REVOKE ALL ON public.email_visibility FROM anon, authenticated;
REVOKE ALL ON public.email_object_link FROM anon, authenticated;
REVOKE ALL ON public.email_attachments FROM anon, authenticated;
REVOKE ALL ON public.activity FROM anon, authenticated;

-- emails / email_visibility / email_attachments: the app only ever reads these;
-- every write is service_role (gmail-sync, email-triage).
GRANT SELECT ON public.emails TO authenticated;
GRANT SELECT ON public.email_visibility TO authenticated;
GRANT SELECT ON public.email_attachments TO authenticated;

-- email_object_link: the review UI links and unlinks as the logged-in user.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.email_object_link TO authenticated;

-- activity is a core app table (logging calls, tasks, editing and deleting
-- activities all run as the user). Its own RLS policies are untouched here; this
-- only removes TRUNCATE/REFERENCES/TRIGGER and anon's access.
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity TO authenticated;

-- ---------------------------------------------------------------------------
-- 5. Leftovers
-- ---------------------------------------------------------------------------
-- processed_message_ids_snapshot_20260907: a migration backup from 2026-09-07
-- with RLS DISABLED and no policies, granted to anon — 23,025 Gmail message ids
-- and 71 sender addresses were readable with the public key, no login. Nothing
-- in the codebase reads it; the live table it was copied from is intact.
DROP TABLE IF EXISTS public.processed_message_ids_snapshot_20260907;

-- agent_rules had ONE policy: FOR ALL USING (true) TO public, plus anon grants —
-- anon could read and rewrite the classifier's exclusion rules. Admin only now.
-- (email-triage reads them as service_role, which bypasses RLS.)
DROP POLICY IF EXISTS agent_rules_all ON public.agent_rules;
CREATE POLICY agent_rules_admin_all ON public.agent_rules
  FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public."user" u
    WHERE u.auth_user_id = auth.uid() AND u.ovis_role = 'admin'
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public."user" u
    WHERE u.auth_user_id = auth.uid() AND u.ovis_role = 'admin'
  ));

REVOKE ALL ON public.agent_rules FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.agent_rules TO authenticated;

-- ---------------------------------------------------------------------------
-- 6. activity — email-derived rows are internal-only
-- ---------------------------------------------------------------------------
-- The old activity_select_policy read:
--   admin OR activity.owner_id = me OR activity.email_id IS NOT NULL
-- That last branch is unscoped, so every user row in "user" — a coach included —
-- could read all 13,070 email-derived activity rows, each carrying the email's
-- subject and a 201-char snippet. Portal users were already excluded (they have
-- no public."user" row at all), but the rule should not depend on that accident.
--
-- An activity row counts as email-derived when it carries an email_id OR its type
-- is an email type ('Email', 'ListEmail' — 21,266 rows, many migrated from
-- Salesforce with no email_id but a real subject and body in `description`).
-- Those require is_internal_user(). Non-email activity keeps exactly the
-- visibility it had: admin, or the rows you own.
DROP POLICY IF EXISTS activity_select_policy ON public.activity;
CREATE POLICY activity_select_policy ON public.activity
  FOR SELECT TO authenticated
  USING (
    -- The ORIGINAL visibility expression, unchanged. Written as an AND with the
    -- clause below rather than adding an OR branch: an OR would have WIDENED
    -- internal access, letting any internal user read the 21,267 email-type rows
    -- instead of the 13,071 they could already see (measured). Being internal is
    -- now a REQUIREMENT for email rows, not a new grant.
    EXISTS (
      SELECT 1 FROM public."user" u
      WHERE u.auth_user_id = auth.uid()
        AND (
          u.ovis_role = 'admin'
          OR public.activity.owner_id = u.id
          OR public.activity.email_id IS NOT NULL
        )
    )
    AND (
      -- Non-email activity: nothing extra required.
      (
        public.activity.email_id IS NULL
        AND public.activity.activity_type_id NOT IN (
          SELECT t.id FROM public.activity_type t WHERE t.name ILIKE '%email%'
        )
      )
      -- Email-derived activity (an email_id, or an Email/ListEmail type — many
      -- Salesforce rows have no email_id but carry a real subject and body in
      -- `description`): internal users only.
      OR public.is_internal_user()
    )
  );

COMMENT ON POLICY activity_select_policy ON public.activity IS
  'Non-email activity: admin or owner. Email-derived activity (email_id set, or an Email/ListEmail type): is_internal_user() only.';

COMMENT ON POLICY emails_select ON public.emails IS
  'Own mailbox via email_visibility, plus link-carrying email for is_internal_user(). Coach/portal/anon see nothing.';
