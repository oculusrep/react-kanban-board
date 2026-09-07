-- ============================================================================
-- Email triage dependency (b): backfill the readable correction table.
--
-- agent_corrections is the table getRelevantCorrections() reads and injects
-- into the Gemini prompt. ai_correction_log is read by nothing except
-- EmailClassificationReviewPage's "already reviewed" dedupe filter. Six UI and
-- edge paths wrote only the log, so agent_corrections took its last row on
-- 2026-01-30 while corrections kept arriving through 2026-08-12.
--
-- The write sites are fixed in code (src/lib/logCorrection.ts and an inline
-- equivalent in email-correction/index.ts). This migration recovers what can
-- be recovered from the 191 rows already in ai_correction_log.
--
-- YIELD -- 15 rows, not 191. Verified composition:
--   removed_tag   12  -> mappable (object_type + incorrect_object_id present)
--   added_tag      3  -> mappable (object_type + correct_object_id present)
--   feedback      50  -> NOT mappable: no object_type, no object ids at all.
--                        These are free-text instructions ("CCIM advertisements
--                        should be ignored", "Anytime subject line contains
--                        Steeplechase Plaza and JBR, tag deal JBR - ..."). 14 of
--                        the 50 are positive confirmations, not corrections.
--                        agent_corrections.correct_object_type/_id are NOT NULL
--                        so they physically cannot be stored here. Left in place
--                        pending a decision -- they are rule/guidance material.
--   reviewed      83  -> NOT a correction. Dedupe marker for the review UI.
--   not_business  43  -> NOT a link correction. These are labelled tier-1
--                        training data (spec section 7). Left in place
--                        deliberately for the tier-1 work, not forced in here.
--
-- Overlap check: 0 of the 15 share an email_id with any existing
-- agent_corrections row, so nothing is deduped away. 0 reference a deleted
-- email. 0 have a null email_id or sender_email.
--
-- Sentinels match src/lib/logCorrection.ts and the existing rows exactly --
-- formatCorrectionsForPrompt() in gemini-agent.ts branches on 'none' and the
-- zero UUID, so these values are load-bearing.
--
-- Idempotent: the NOT EXISTS guard matches on (email_id, incorrect_object_id,
-- correct_object_id), so re-running inserts nothing.
--
-- ROLLBACK:
--   DELETE FROM agent_corrections
--   WHERE feedback_text LIKE '%[backfilled from ai_correction_log %';
-- ============================================================================

-- removed_tag -> "AI should not have linked this"
INSERT INTO agent_corrections (
  email_id, incorrect_link_id, incorrect_object_type, incorrect_object_id,
  correct_object_type, correct_object_id, feedback_text,
  sender_email, email_subject, created_by_user_id, created_at
)
SELECT
  l.email_id,
  NULL,
  l.object_type,
  l.incorrect_object_id,
  'none',
  '00000000-0000-0000-0000-000000000000'::uuid,
  COALESCE(l.reasoning_hint, 'AI incorrectly linked to ' || l.object_type)
    || ' [backfilled from ai_correction_log ' || l.id::text || ']',
  l.sender_email,
  e.subject,
  l.user_id,
  l.created_at            -- preserve original timing; retrieval orders by this
FROM ai_correction_log l
LEFT JOIN emails e ON e.id = l.email_id
WHERE l.correction_type = 'removed_tag'
  AND l.object_type IS NOT NULL
  AND l.incorrect_object_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agent_corrections c
    WHERE c.email_id = l.email_id
      AND c.incorrect_object_id = l.incorrect_object_id
      AND c.correct_object_type = 'none'
  );

-- added_tag -> "AI missed this link"
INSERT INTO agent_corrections (
  email_id, incorrect_link_id, incorrect_object_type, incorrect_object_id,
  correct_object_type, correct_object_id, feedback_text,
  sender_email, email_subject, created_by_user_id, created_at
)
SELECT
  l.email_id,
  NULL,
  'none',
  '00000000-0000-0000-0000-000000000000'::uuid,
  l.object_type,
  l.correct_object_id,
  COALESCE(l.reasoning_hint, 'AI missed linking to ' || l.object_type)
    || ' [backfilled from ai_correction_log ' || l.id::text || ']',
  l.sender_email,
  e.subject,
  l.user_id,
  l.created_at
FROM ai_correction_log l
LEFT JOIN emails e ON e.id = l.email_id
WHERE l.correction_type = 'added_tag'
  AND l.object_type IS NOT NULL
  AND l.correct_object_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM agent_corrections c
    WHERE c.email_id = l.email_id
      AND c.correct_object_id = l.correct_object_id
      AND c.incorrect_object_type = 'none'
  );
