-- Legal Orchestration V1 — Schema migration
-- Spec: docs/legal-orchestration-spec.md
--
-- Adds Tier 1 fields to deal (rent terms, TIA, rent commencement, use clause,
-- landlord status, landlord name) plus 9 new tables to power the playbook,
-- LOI session/round/decision tracking, override learning loop, and rent schedule.
--
-- All new entity tables include a `client_id` (V2-ready: per-client playbooks)
-- and `created_by` (V2-ready: opens to internal OVIS brokers later).
--
-- DEPARTURE FROM SPEC: spec'd `deal.landlord_entity_id` (FK to a structured
-- landlord entity). V1 implementation uses `deal.landlord_name TEXT` instead
-- to avoid creating a new `landlord` table for a single string field. V2 can
-- migrate to a structured FK if cross-deal landlord analytics become valuable.

-- ============================================================================
-- 1. ADDITIVE deal COLUMNS (Tier 1)
-- ============================================================================

ALTER TABLE deal ADD COLUMN IF NOT EXISTS landlord_name TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS lease_initial_term_years NUMERIC;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS rent_type TEXT
  CHECK (rent_type IS NULL OR rent_type IN ('fixed_annual', 'per_sqft', 'hybrid'));
ALTER TABLE deal ADD COLUMN IF NOT EXISTS tia_amount NUMERIC;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS rent_commencement_type TEXT
  CHECK (rent_commencement_type IS NULL OR rent_commencement_type IN (
    'days_after_opening', 'days_after_possession', 'days_after_later_of_opening_or_possession',
    'lease_execution_date', 'fixed_date', 'other'
  ));
ALTER TABLE deal ADD COLUMN IF NOT EXISTS rent_commencement_days INTEGER;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS use_clause_type TEXT
  CHECK (use_clause_type IS NULL OR use_clause_type IN (
    'broad_retail', 'coffee_or_retail_fallback', 'coffee_only', 'custom'
  ));
ALTER TABLE deal ADD COLUMN IF NOT EXISTS use_clause_notes TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS landlord_lease_status TEXT
  CHECK (landlord_lease_status IS NULL OR landlord_lease_status IN (
    'fee_owner', 'ground_lessee', 'under_contract'
  ));

COMMENT ON COLUMN deal.landlord_name IS 'Landlord entity name as it appears in the LOI. May differ from property owner if landlord is a managing entity.';
COMMENT ON COLUMN deal.lease_initial_term_years IS 'Initial lease term length in years. Excludes options.';
COMMENT ON COLUMN deal.rent_type IS 'Rent structure: fixed annual amount, tied to square footage, or hybrid.';
COMMENT ON COLUMN deal.tia_amount IS 'Tenant Improvement Allowance for the deal. Mirrors site_submit.ti for clarity at deal level.';
COMMENT ON COLUMN deal.rent_commencement_type IS 'Formula for rent commencement (e.g., 120 days after later of opening or possession).';
COMMENT ON COLUMN deal.rent_commencement_days IS 'Day count used by rent_commencement_type.';
COMMENT ON COLUMN deal.use_clause_type IS 'Selected use clause position from the playbook (per LOI Handbook §Use).';
COMMENT ON COLUMN deal.use_clause_notes IS 'Free-text notes for use-clause negotiation.';
COMMENT ON COLUMN deal.landlord_lease_status IS 'Landlord property interest: fee owner, ground lessee, or under contract to purchase.';

-- ============================================================================
-- 2. clause_type — universal taxonomy (Q15 C-relaxed)
-- ============================================================================

CREATE TABLE IF NOT EXISTS clause_type (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL UNIQUE,
  display_name TEXT NOT NULL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  default_confidence_tier TEXT NOT NULL CHECK (default_confidence_tier IN ('HIGH', 'MEDIUM', 'LOW')),
  description TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE clause_type IS 'Universal taxonomy of LOI/lease clause categories (Term, Rent, Use, Exclusive Use, …). Shared across all clients; per-client text lives in legal_playbook.';
COMMENT ON COLUMN clause_type.name IS 'Internal canonical key (e.g., "use", "exclusive_use"). Stable across schema lifetime.';
COMMENT ON COLUMN clause_type.display_name IS 'Human-readable label (e.g., "Use", "Exclusive Use").';
COMMENT ON COLUMN clause_type.default_confidence_tier IS 'Default AI behavior tier: HIGH=aggressive, MEDIUM=conservative, LOW=auto-escalate. Per-client overrides on legal_playbook.';

-- ============================================================================
-- 3. legal_playbook — client × clause_type metadata
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_playbook (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  clause_type_id UUID NOT NULL REFERENCES clause_type(id) ON DELETE CASCADE,
  display_heading TEXT NOT NULL,
  rationale TEXT,
  guidelines TEXT,
  confidence_tier TEXT CHECK (confidence_tier IS NULL OR confidence_tier IN ('HIGH', 'MEDIUM', 'LOW')),
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  source_document TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (client_id, clause_type_id)
);

COMMENT ON TABLE legal_playbook IS 'Per-client × clause-type playbook entries. Contains client-specific rationale, guidelines, and the heading the client uses in their actual LOI document.';
COMMENT ON COLUMN legal_playbook.display_heading IS 'How this client labels this clause in their LOI (e.g., Sbux: "USE", Client X: "PERMITTED USE"). Used by inbound clause-matching pipeline.';
COMMENT ON COLUMN legal_playbook.confidence_tier IS 'Per-client override of clause_type.default_confidence_tier.';
COMMENT ON COLUMN legal_playbook.source_document IS 'Where the playbook content was extracted from (e.g., "LOI Handbook.pdf §Use, p.22-25"). Useful for re-extraction and audit.';

-- ============================================================================
-- 4. legal_playbook_position — ranked positions per playbook entry
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_playbook_position (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  legal_playbook_id UUID NOT NULL REFERENCES legal_playbook(id) ON DELETE CASCADE,
  position_rank INTEGER NOT NULL CHECK (position_rank >= 1),
  position_label TEXT,
  clause_text TEXT NOT NULL,
  default_comment_text TEXT,
  requires_approval TEXT,
  is_floor BOOLEAN NOT NULL DEFAULT FALSE,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (legal_playbook_id, position_rank)
);

COMMENT ON TABLE legal_playbook_position IS 'Ranked fallback positions per playbook entry (P1=preferred, P2=fallback, P3=floor, etc.).';
COMMENT ON COLUMN legal_playbook_position.position_label IS 'Optional human label, e.g., "Preferred", "Fallback 1", "Floor", or handbook-specific tag like "{R0}".';
COMMENT ON COLUMN legal_playbook_position.clause_text IS 'The actual legal language to insert at this position rank.';
COMMENT ON COLUMN legal_playbook_position.default_comment_text IS 'Auto-populated Word comment shown to landlord when AI selects this position. Sourced from handbook Rationale.';
COMMENT ON COLUMN legal_playbook_position.requires_approval IS 'If non-null, this position requires named human approval before applying (e.g., "Director", "VP", "Real Estate Committee").';
COMMENT ON COLUMN legal_playbook_position.is_floor IS 'Marks the lowest acceptable position. AI must auto-escalate rather than dropping below this.';

-- ============================================================================
-- 5. legal_loi_session — one per deal × LOI thread
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_loi_session (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id) ON DELETE RESTRICT,
  deal_id UUID REFERENCES deal(id) ON DELETE CASCADE,
  title TEXT,
  status TEXT NOT NULL DEFAULT 'in_progress'
    CHECK (status IN ('in_progress', 'completed', 'abandoned')),
  is_loose BOOLEAN NOT NULL DEFAULT FALSE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE legal_loi_session IS 'Top-level LOI negotiation thread. One session = one deal''s back-and-forth across all rounds.';
COMMENT ON COLUMN legal_loi_session.deal_id IS 'Nullable to support "loose" mode (LOI work not yet tied to a deal). Set is_loose=TRUE in that case.';
COMMENT ON COLUMN legal_loi_session.is_loose IS 'TRUE for sessions started outside the deal-scoped flow (e.g., friend asks Mike to look at an LOI). Promote to deal-scoped by setting deal_id and is_loose=FALSE.';

-- ============================================================================
-- 6. legal_loi_round — version history powering the negotiation timeline
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_loi_round (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID NOT NULL REFERENCES legal_loi_session(id) ON DELETE CASCADE,
  round_num INTEGER NOT NULL CHECK (round_num >= 0),
  direction TEXT NOT NULL CHECK (direction IN ('outbound', 'inbound')),
  attachment_id UUID REFERENCES attachment(id) ON DELETE SET NULL,
  source_round_id UUID REFERENCES legal_loi_round(id) ON DELETE SET NULL,
  notes TEXT,
  generated_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, round_num, direction)
);

COMMENT ON TABLE legal_loi_round IS 'Per-round artifact in the negotiation timeline. round_num=0 is the initial outbound; inbound/outbound alternate from there.';
COMMENT ON COLUMN legal_loi_round.direction IS 'outbound = we sent this; inbound = landlord sent this.';
COMMENT ON COLUMN legal_loi_round.attachment_id IS 'FK to the .docx artifact in Supabase Storage via the attachment table.';
COMMENT ON COLUMN legal_loi_round.source_round_id IS 'For outbound rounds, points to the inbound round being countered. Powers the "compare against last sent" silent-acceptance check.';

-- ============================================================================
-- 7. legal_loi_decision — per-change AI decisions + Mike's overrides
-- ============================================================================

CREATE TABLE IF NOT EXISTS legal_loi_decision (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  round_id UUID NOT NULL REFERENCES legal_loi_round(id) ON DELETE CASCADE,
  clause_type_id UUID REFERENCES clause_type(id),
  doc_anchor TEXT,
  landlord_text_excerpt TEXT,
  ai_position_rank INTEGER,
  ai_rationale TEXT,
  ai_confidence NUMERIC CHECK (ai_confidence IS NULL OR (ai_confidence >= 0 AND ai_confidence <= 1)),
  ai_model TEXT,
  was_override BOOLEAN NOT NULL DEFAULT FALSE,
  override_source TEXT
    CHECK (override_source IS NULL OR override_source IN (
      'director_approval', 'mike_judgment', 'landlord_pushback_won', 'custom_edit', 'accepted_landlord'
    )),
  final_position_rank INTEGER,
  final_text TEXT,
  final_comment_text TEXT,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'auto_applied', 'reviewed', 'escalated', 'silent_acceptance')),
  severity TEXT
    CHECK (severity IS NULL OR severity IN ('critical', 'high', 'medium', 'low')),
  reviewed_at TIMESTAMPTZ,
  reviewed_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE legal_loi_decision IS 'Per-clause AI decision plus Mike''s review/override. Auto-saves continuously during review (no explicit save button).';
COMMENT ON COLUMN legal_loi_decision.doc_anchor IS 'Stable reference to the location in the .docx (paragraph index, run id, or similar) so the decision can be re-anchored across rounds.';
COMMENT ON COLUMN legal_loi_decision.ai_position_rank IS 'AI''s initial pick (1=Preferred, 2=Fallback, 3=Floor, etc.). NULL if AI accepted landlord text or escalated without picking.';
COMMENT ON COLUMN legal_loi_decision.ai_confidence IS '0.0–1.0 confidence score from AI. Drives Sonnet→Opus escalation decisions.';
COMMENT ON COLUMN legal_loi_decision.was_override IS 'TRUE if final_position_rank or final_text differs from AI''s pick. Feeds the learning loop (Q8 B+C).';
COMMENT ON COLUMN legal_loi_decision.status IS 'Review queue grouping: pending=AI hasn''t decided, auto_applied=AI was confident, reviewed=Mike confirmed, escalated=needs Director, silent_acceptance=landlord accepted prior change without tracked-change marker.';

-- ============================================================================
-- 8. negotiation_logs — analytics + citations for the learning loop
-- ============================================================================

CREATE TABLE IF NOT EXISTS negotiation_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  deal_id UUID REFERENCES deal(id) ON DELETE SET NULL,
  session_id UUID REFERENCES legal_loi_session(id) ON DELETE SET NULL,
  round_id UUID REFERENCES legal_loi_round(id) ON DELETE SET NULL,
  decision_id UUID REFERENCES legal_loi_decision(id) ON DELETE SET NULL,
  clause_type_id UUID REFERENCES clause_type(id),
  position_used INTEGER,
  was_override BOOLEAN NOT NULL DEFAULT FALSE,
  override_source TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE negotiation_logs IS 'Append-only log of clause-level decisions across all sessions. Powers AI suggestion citations ("in 3 of 4 deals you accepted P3") and cross-deal analytics.';

-- ============================================================================
-- 9. comment_templates — Mike's reusable comment snippets
-- ============================================================================

CREATE TABLE IF NOT EXISTS comment_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id UUID NOT NULL REFERENCES client(id) ON DELETE CASCADE,
  clause_type_id UUID REFERENCES clause_type(id) ON DELETE SET NULL,
  template_text TEXT NOT NULL,
  label TEXT,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE comment_templates IS 'User-saved comment snippets surfaced in the per-change panel during review. Tagged by clause_type for context-relevant suggestions.';

-- ============================================================================
-- 10. deal_rent_schedule — multi-step rent rows per deal
-- ============================================================================

CREATE TABLE IF NOT EXISTS deal_rent_schedule (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  deal_id UUID NOT NULL REFERENCES deal(id) ON DELETE CASCADE,
  step_num INTEGER NOT NULL CHECK (step_num >= 1),
  year_start INTEGER NOT NULL,
  year_end INTEGER NOT NULL,
  is_option_period BOOLEAN NOT NULL DEFAULT FALSE,
  annual_amount NUMERIC,
  monthly_amount NUMERIC,
  per_sqft_amount NUMERIC,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (deal_id, step_num),
  CHECK (year_end >= year_start)
);

COMMENT ON TABLE deal_rent_schedule IS 'Multi-step rent rows per deal. Populated manually in V1; will be the canonical writer of the future Rent Calculator (see docs/rent-calculator-spec.md).';
COMMENT ON COLUMN deal_rent_schedule.step_num IS 'Ordering within the schedule (1, 2, 3, …).';
COMMENT ON COLUMN deal_rent_schedule.is_option_period IS 'TRUE if this step is an option-period (years 11-15, 16-20, etc.). FALSE for initial-term steps.';

-- ============================================================================
-- 11. INDEXES
-- ============================================================================

CREATE INDEX IF NOT EXISTS idx_clause_type_sort_order
  ON clause_type (sort_order) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_legal_playbook_client
  ON legal_playbook (client_id, is_active);

CREATE INDEX IF NOT EXISTS idx_legal_playbook_position_playbook
  ON legal_playbook_position (legal_playbook_id, position_rank) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_legal_loi_session_deal
  ON legal_loi_session (deal_id, status) WHERE deal_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_legal_loi_session_client
  ON legal_loi_session (client_id, status);

CREATE INDEX IF NOT EXISTS idx_legal_loi_round_session
  ON legal_loi_round (session_id, round_num);

CREATE INDEX IF NOT EXISTS idx_legal_loi_decision_round
  ON legal_loi_decision (round_id, status);

CREATE INDEX IF NOT EXISTS idx_legal_loi_decision_clause
  ON legal_loi_decision (clause_type_id, was_override);

CREATE INDEX IF NOT EXISTS idx_negotiation_logs_lookup
  ON negotiation_logs (client_id, clause_type_id, was_override, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_comment_templates_lookup
  ON comment_templates (client_id, clause_type_id) WHERE is_active = TRUE;

CREATE INDEX IF NOT EXISTS idx_deal_rent_schedule_deal
  ON deal_rent_schedule (deal_id, step_num);

-- ============================================================================
-- 12. ROW LEVEL SECURITY
-- ============================================================================
-- V1 follows OVIS's prevailing pattern: enable RLS, allow authenticated users
-- full access. Tighter policies (e.g., per-user ownership) can be added when
-- the tool opens up to multiple brokers in V2.

ALTER TABLE clause_type ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access to clause_type"
  ON clause_type FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

ALTER TABLE legal_playbook ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access to legal_playbook"
  ON legal_playbook FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

ALTER TABLE legal_playbook_position ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access to legal_playbook_position"
  ON legal_playbook_position FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

ALTER TABLE legal_loi_session ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access to legal_loi_session"
  ON legal_loi_session FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

ALTER TABLE legal_loi_round ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access to legal_loi_round"
  ON legal_loi_round FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

ALTER TABLE legal_loi_decision ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access to legal_loi_decision"
  ON legal_loi_decision FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

ALTER TABLE negotiation_logs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access to negotiation_logs"
  ON negotiation_logs FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

ALTER TABLE comment_templates ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access to comment_templates"
  ON comment_templates FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);

ALTER TABLE deal_rent_schedule ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users full access to deal_rent_schedule"
  ON deal_rent_schedule FOR ALL TO authenticated USING (TRUE) WITH CHECK (TRUE);
