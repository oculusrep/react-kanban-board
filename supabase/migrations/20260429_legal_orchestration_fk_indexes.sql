-- Legal Orchestration V1 — supplementary FK indexes
-- Addresses unindexed_foreign_keys advisories (INFO level) flagged by Supabase
-- performance advisors after the initial schema migration. Cheap insurance
-- against full-table scans on FK lookups; particularly important for
-- negotiation_logs, which gets queried often for the citation engine
-- ("in 3 of 4 deals you accepted P3").

CREATE INDEX IF NOT EXISTS idx_comment_templates_clause_type
  ON comment_templates (clause_type_id);
CREATE INDEX IF NOT EXISTS idx_comment_templates_created_by
  ON comment_templates (created_by);

CREATE INDEX IF NOT EXISTS idx_legal_loi_decision_reviewed_by
  ON legal_loi_decision (reviewed_by);

CREATE INDEX IF NOT EXISTS idx_legal_loi_round_attachment
  ON legal_loi_round (attachment_id);
CREATE INDEX IF NOT EXISTS idx_legal_loi_round_created_by
  ON legal_loi_round (created_by);
CREATE INDEX IF NOT EXISTS idx_legal_loi_round_source_round
  ON legal_loi_round (source_round_id);

CREATE INDEX IF NOT EXISTS idx_legal_loi_session_created_by
  ON legal_loi_session (created_by);

CREATE INDEX IF NOT EXISTS idx_legal_playbook_clause_type
  ON legal_playbook (clause_type_id);

CREATE INDEX IF NOT EXISTS idx_negotiation_logs_clause_type
  ON negotiation_logs (clause_type_id);
CREATE INDEX IF NOT EXISTS idx_negotiation_logs_deal
  ON negotiation_logs (deal_id);
CREATE INDEX IF NOT EXISTS idx_negotiation_logs_decision
  ON negotiation_logs (decision_id);
CREATE INDEX IF NOT EXISTS idx_negotiation_logs_round
  ON negotiation_logs (round_id);
CREATE INDEX IF NOT EXISTS idx_negotiation_logs_session
  ON negotiation_logs (session_id);
