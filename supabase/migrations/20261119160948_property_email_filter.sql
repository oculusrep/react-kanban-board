-- property_email_filter — OVIS/Property state filter (Phase 1).
-- Spec: docs/PROPERTY_EMAIL_INTAKE_SPEC.md (sections 1.8, 1.10, 1.11).
--
-- One row per OVIS/Property message: what the classifier decided, why, and
-- whether Gmail has been brought into line. Keyed on the RFC Message-ID so a
-- message is classified once; re-running the backlog is a no-op.
--
-- Decisions:
--   in_state      a listing with at least one GA/SC property -> stays
--   unknown       state could not be shown with certainty    -> stays
--   out_of_state  every property certainly outside GA/SC     -> OVIS/Property-OOS, archived
--   not_listing   not a listing                              -> back to normal routing
--   owner_restored the owner undid one of the two above       -> OVIS/Property, never re-moved

CREATE TABLE IF NOT EXISTS public.property_email_filter (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id          text NOT NULL UNIQUE,
  gmail_id            text NOT NULL,
  gmail_connection_id uuid NOT NULL REFERENCES public.gmail_connection(id) ON DELETE CASCADE,
  email_id            uuid REFERENCES public.emails(id) ON DELETE SET NULL,

  decision            text NOT NULL CHECK (decision IN
                        ('not_listing','out_of_state','in_state','unknown','owner_restored')),
  model_decision      text,
  downgrade_reason    text,
  is_listing          boolean,
  states_found        text[] NOT NULL DEFAULT '{}',
  properties          jsonb  NOT NULL DEFAULT '[]',
  evidence            text,
  evidence_in_source  boolean,
  text_scan_hits      text[] NOT NULL DEFAULT '{}',
  inputs              jsonb  NOT NULL DEFAULT '{}',
  model               text NOT NULL,
  prompt_version      text NOT NULL,
  input_tokens        int,
  output_tokens       int,

  gmail_sync_state    text NOT NULL DEFAULT 'pending'
                        CHECK (gmail_sync_state IN ('pending','synced','failed')),
  gmail_synced_at     timestamptz,
  -- When the filter's own INBOX removal was confirmed. label-watcher matches an
  -- INBOX 'removed' event against this, so the archive is credited to OVIS.
  archived_at         timestamptz,
  attempts            int NOT NULL DEFAULT 0,
  next_attempt_at     timestamptz,
  last_error          text,

  restored_at         timestamptz,
  restored_by         text CHECK (restored_by IN ('gmail_relabel','restore_action')),
  prior_decision      text,

  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_pef_sync_due
  ON public.property_email_filter (gmail_sync_state, next_attempt_at)
  WHERE gmail_sync_state <> 'synced';
CREATE INDEX IF NOT EXISTS idx_pef_decision
  ON public.property_email_filter (decision, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pef_gmail
  ON public.property_email_filter (gmail_connection_id, gmail_id);

-- Grants: don't inherit the defaults, state what the app uses.
REVOKE ALL ON public.property_email_filter FROM anon, authenticated;
GRANT SELECT ON public.property_email_filter TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.property_email_filter TO service_role;

ALTER TABLE public.property_email_filter ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS property_email_filter_select_internal ON public.property_email_filter;
CREATE POLICY property_email_filter_select_internal ON public.property_email_filter
  FOR SELECT TO authenticated
  USING (public.is_internal_user());

COMMENT ON TABLE public.property_email_filter IS
  'OVIS/Property state filter: one decision per listing email (GA/SC kept, out-of-state moved to OVIS/Property-OOS and archived, non-listings re-routed). See docs/PROPERTY_EMAIL_INTAKE_SPEC.md.';
