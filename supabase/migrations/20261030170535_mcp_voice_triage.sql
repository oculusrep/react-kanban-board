-- Voice-triage tools on the OVIS MCP server: the two tables the tools need.
--
-- Everything else they do goes through objects that already exist (commitment,
-- deal, note, contact, deal_contact, the commitment-action and
-- extract-commitments functions). These two are new because nothing in OVIS
-- recorded them before:
--
--   mcp_audit_log    — every WRITE an agent makes, with the tool, the caller and
--                      the arguments. A voice agent acts without a screen, so
--                      "what did it do, as whom" has to be answerable afterwards
--                      from the database alone.
--   mcp_thread_watch — "tell me when they reply". A watch is a row, not a
--                      subscription: a reply is detected by comparing the
--                      thread's mail against the watch's baseline when the
--                      agent asks. Nothing fires on its own, so nothing can be
--                      silently lost when a cron job is paused.

CREATE TABLE IF NOT EXISTS public.mcp_audit_log (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at    timestamptz NOT NULL DEFAULT now(),
  tool          text NOT NULL,
  -- 'user' (OAuth caller, user_id set) or 'static' (script token, no person).
  caller        text NOT NULL CHECK (caller IN ('user', 'static')),
  -- Plain uuid, not a FK: auth.users is not readable by the authenticated role,
  -- and a FK here would make this log undeletable alongside an auth user.
  auth_user_id  uuid,
  user_id       uuid REFERENCES public."user"(id) ON DELETE SET NULL,
  args          jsonb NOT NULL DEFAULT '{}'::jsonb,
  ok            boolean NOT NULL,
  result        jsonb,
  error         text
);

CREATE INDEX IF NOT EXISTS idx_mcp_audit_created ON public.mcp_audit_log (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_mcp_audit_tool ON public.mcp_audit_log (tool, created_at DESC);

COMMENT ON TABLE public.mcp_audit_log IS
  'One row per write performed by an MCP tool. Reads are not logged; writes always are, before the caller is told it succeeded.';

CREATE TABLE IF NOT EXISTS public.mcp_thread_watch (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES public."user"(id) ON DELETE CASCADE,
  gmail_connection_id uuid NOT NULL REFERENCES public.gmail_connection(id) ON DELETE CASCADE,
  -- The thread the agent named, plus the rest of the conversation. 23% of
  -- replies are stored under a different thread_id than the message they
  -- answer, so a watch on one id alone would miss the reply it was set for.
  thread_id           text NOT NULL,
  thread_ids          text[] NOT NULL DEFAULT '{}',
  commitment_id       uuid REFERENCES public.commitment(id) ON DELETE SET NULL,
  -- What is being waited for, in the owner's own words, so the answer can be
  -- read back to them.
  label               text,
  -- Replies count strictly after this instant: the newest message at the moment
  -- the watch was set.
  baseline_at         timestamptz NOT NULL,
  status              text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'fired', 'cancelled')),
  fired_at            timestamptz,
  fired_email_id      uuid REFERENCES public.emails(id) ON DELETE SET NULL,
  fired_sender        text,
  fired_subject       text,
  created_at          timestamptz NOT NULL DEFAULT now(),
  cancelled_at        timestamptz
);

-- One live watch per thread per person. A voice agent asked twice ("watch that
-- one" / "let me know if he replies") must not end up reporting one reply twice.
CREATE UNIQUE INDEX IF NOT EXISTS uq_mcp_watch_active
  ON public.mcp_thread_watch (user_id, thread_id) WHERE status = 'active';
CREATE INDEX IF NOT EXISTS idx_mcp_watch_user_status
  ON public.mcp_thread_watch (user_id, status, created_at DESC);

COMMENT ON TABLE public.mcp_thread_watch IS
  'A standing question about a Gmail thread: has anyone replied since baseline_at. Evaluated on read (list_watches), never by a trigger.';

-- Grants: don't inherit the defaults, state what the app uses. Both tables are
-- written only by the MCP function with the secret key; the authenticated role
-- reads them (a future panel showing watches and an audit trail).
REVOKE ALL ON public.mcp_audit_log FROM anon, authenticated;
REVOKE ALL ON public.mcp_thread_watch FROM anon, authenticated;
GRANT SELECT ON public.mcp_audit_log TO authenticated;
GRANT SELECT ON public.mcp_thread_watch TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_audit_log TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.mcp_thread_watch TO service_role;

ALTER TABLE public.mcp_audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mcp_thread_watch ENABLE ROW LEVEL SECURITY;

-- (select ...) on every policy: an unwrapped predicate is re-evaluated per row
-- and keeps the table slow for exactly the role that fails it.
DROP POLICY IF EXISTS mcp_audit_select_internal ON public.mcp_audit_log;
CREATE POLICY mcp_audit_select_internal ON public.mcp_audit_log
  FOR SELECT TO authenticated USING ((select public.is_internal_user()));

-- A watch is personal: internal, and your own rows only.
DROP POLICY IF EXISTS mcp_watch_select_own ON public.mcp_thread_watch;
CREATE POLICY mcp_watch_select_own ON public.mcp_thread_watch
  FOR SELECT TO authenticated
  USING ((select public.is_internal_user()) AND user_id = (select auth.uid()));
