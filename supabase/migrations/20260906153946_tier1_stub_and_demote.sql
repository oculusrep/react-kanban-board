-- ============================================================================
-- Email triage dependency (a): tier-1 stub columns + delete-to-demote.
--
-- TWO INDEPENDENT CHANGES, deliberately in one migration because both are
-- additive and neither changes existing behaviour on its own:
--
--   1. processed_message_ids gains sender_email + tier1_reason, so a filtered
--      or demoted message leaves a content-free record instead of vanishing.
--   2. emails gains is_relevant / demoted_at / demoted_reason so email-triage
--      can DEMOTE instead of DELETE.
--
-- WHY THE STUB COLUMNS MATTER (not incidental -- this is the fix):
-- processed_message_ids currently stores only id, message_id,
-- gmail_connection_id, action, processed_at, created_at. No sender, no
-- subject, no headers. That is why the 2,534 emails deleted in the last 30
-- days cannot be analysed retrospectively, and why the tier-1 cost projection
-- is a RANGE (45-68% reduction) rather than a number. The delete-based design
-- destroyed the evidence needed to size its own replacement. Widening this
-- table is the correction, not a nice-to-have.
--
-- PRIVACY (spec section 3, decided 2026-09-06):
--   bulk     -> full stub: message_id + sender_email + tier1_reason
--   personal -> message_id + action='tier1_personal' ONLY.
--               NO sender_email, NO tier1_reason.
--               A sender+timestamp stub for personal mail is a log of an
--               employee's personal correspondents sitting in a business
--               database. At the volume that reaches this path the audit value
--               does not justify it. Enforced by CHECK below, not by convention
--               -- application bugs must not be able to write it.
--   Applies to every connected account, not just Mike's.
--
-- action values after this migration:
--   'deleted'        legacy rows, pre-2026-09-06. No longer written.
--   'tier1_bulk'     filtered pre-insert as bulk (full stub)
--   'tier1_personal' filtered pre-insert as personal (message_id only)
--   'demoted'        reached the agent, judged non-business, row KEPT
--
-- ROLLBACK:
--   ALTER TABLE processed_message_ids
--     DROP CONSTRAINT IF EXISTS pmi_personal_stub_carries_no_sender,
--     DROP COLUMN IF EXISTS sender_email,
--     DROP COLUMN IF EXISTS tier1_reason;
--   ALTER TABLE emails
--     DROP COLUMN IF EXISTS is_relevant,
--     DROP COLUMN IF EXISTS demoted_at,
--     DROP COLUMN IF EXISTS demoted_reason;
--   DROP INDEX IF EXISTS idx_pmi_action_processed_at;
--   DROP INDEX IF EXISTS idx_emails_is_relevant;
-- ============================================================================

-- 1. Stub columns -----------------------------------------------------------

ALTER TABLE processed_message_ids
  ADD COLUMN IF NOT EXISTS sender_email  varchar(255),
  ADD COLUMN IF NOT EXISTS tier1_reason  text;

COMMENT ON COLUMN processed_message_ids.sender_email IS
  'Bulk stubs only. NULL for tier1_personal by CHECK constraint -- see migration header.';
COMMENT ON COLUMN processed_message_ids.tier1_reason IS
  'Which tier-1 rule fired, e.g. A1:list-unsubscribe. NULL for tier1_personal.';

-- Personal stubs must never carry identifying detail. Enforced, not conventional.
ALTER TABLE processed_message_ids
  DROP CONSTRAINT IF EXISTS pmi_personal_stub_carries_no_sender;
ALTER TABLE processed_message_ids
  ADD CONSTRAINT pmi_personal_stub_carries_no_sender
  CHECK (
    action <> 'tier1_personal'
    OR (sender_email IS NULL AND tier1_reason IS NULL)
  );

CREATE INDEX IF NOT EXISTS idx_pmi_action_processed_at
  ON processed_message_ids (action, processed_at DESC);

-- 2. Demote instead of delete ----------------------------------------------

ALTER TABLE emails
  ADD COLUMN IF NOT EXISTS is_relevant     boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS demoted_at      timestamptz,
  ADD COLUMN IF NOT EXISTS demoted_reason  text;

COMMENT ON COLUMN emails.is_relevant IS
  'false = agent judged non-business. Row is KEPT so the call can be corrected '
  'and measured; previously these rows were hard-DELETEd (~84/day). '
  'Queue and UI must filter on this.';

-- Partial index: the demoted set is the minority and is queried on its own.
CREATE INDEX IF NOT EXISTS idx_emails_is_relevant
  ON emails (is_relevant, received_at DESC)
  WHERE is_relevant = false;
