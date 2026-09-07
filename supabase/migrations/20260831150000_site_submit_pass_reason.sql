-- ============================================================================
-- Starbucks Deal Board — Pass action support on site_submit
--
-- See docs/STARBUCKS_DEAL_BOARD_DECISIONS.md §2.22 / §2.23.
--
-- "Pass on this site" writes a structured pass reason to site_submit (mirroring
-- deal.loss_reason for the Lost path) so the client site report can break down
-- passes by category, plus a narrative note on the deal (written by the app).
-- NOT the generic site_submit.notes — the report needs a dedicated field.
--
-- pass_reason_category is a short enumerated bucket so the report can show a
-- distribution rather than 40 unique sentences.
-- ============================================================================

ALTER TABLE site_submit
  ADD COLUMN IF NOT EXISTS pass_reason TEXT,
  ADD COLUMN IF NOT EXISTS pass_reason_category TEXT
    CHECK (pass_reason_category IS NULL OR pass_reason_category IN (
      'pricing', 'site_control', 'traffic', 'client_declined', 'competition', 'other'
    ));

COMMENT ON COLUMN site_submit.pass_reason IS
  'Free-text reason a site was passed on (mirror of deal.loss_reason). Written by the Starbucks board Pass action; surfaced in the client site report.';
COMMENT ON COLUMN site_submit.pass_reason_category IS
  'Structured pass-reason bucket for report breakdowns: pricing | site_control | traffic | client_declined | competition | other.';
