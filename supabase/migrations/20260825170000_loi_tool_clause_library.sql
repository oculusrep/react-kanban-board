-- Starbucks LOI Tool — Clause Library Core (Pass One)
-- Created: August 25, 2026
-- Branch: feature/starbucks-loi-tool
-- Description: Foundation schema for the Starbucks LOI Assembler. Stores the clause
--   library, the immutable versioned canonical body text, the position ladders /
--   modifiers, the director-question tracker, the approval-label lookup, and config.
--
--   See docs/STARBUCKS_LOI_TOOL_DECISIONS.md for the full locked design (Section 8).
--
-- Model (clause -> variant -> position, per the clause-as-object briefing):
--   loi_clause                  -- stable semantic ID (NEVER a section number) + bucket tag
--   loi_variant                 -- deal-type-conditioned grouping under a clause
--   loi_canonical_body          -- IMMUTABLE versioned text; keyed (brace_code, source, version)
--   loi_position                -- ranked alternative OR conditional modifier; carries brace code
--   loi_applies_when_condition  -- normalized structured trigger for a position (no JSONB in the library)
--   loi_director_question       -- first-class blocked-on-Director tracker; positions FK to it
--   loi_approval_label          -- swappable "approval required" label, keyed by authority
--   loi_config                  -- named, versioned config values (e.g. exit_strategy_threshold)
--
-- Locked principles enforced here:
--   * RIGID SPINE / SOFT EDGES — anything counted/filtered/asserted is a typed column;
--     everything else is prose (note fields). JSONB is NOT used in the clause library.
--   * COLLISION GUARD is a DB CONSTRAINT, not a to-do — canonical body keys on
--     (brace_code, source, version); a second distinct body under the same tuple FAILS
--     at load time (catches the national-vs-Southeast CO1 class of problem).
--   * TWO PROVISIONAL AXES — code_status (identity; marks the docx) vs rule_status
--     (behavior; audit-only). Kept as separate columns so "confirmed code, unconfirmed
--     sanctioning" (Southeast CO1) is representable.
--   * source (document-of-origin) is DISTINCT from authority (governance).
--   * Modifiers (NNN -> CAM) via position_kind = alternative|modifier, not a 2nd table.
--
-- Additive only (new tables). Internal-only data:
--   RLS = public.is_internal_user() full access. updated_at via update_updated_at_column().
--   Conventions: uuid PKs, snake_case, TEXT+CHECK enums (evolvable), TIMESTAMPTZ.

-- ============================================================================
-- 1. LOI_CLAUSE — stable semantic clause + three-bucket tag
-- ============================================================================

CREATE TABLE IF NOT EXISTS loi_clause (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  clause_key TEXT NOT NULL UNIQUE,   -- stable semantic ID (e.g. 'continuous_operation'); NEVER a section number
  title TEXT NOT NULL,

  -- Three-bucket model (7A): drives preload-vs-prompt at assembly.
  bucket TEXT NOT NULL
    CHECK (bucket IN ('custom-owned','coded-position','standing-default')),

  -- Prose / soft edges — NEVER emitted into a document.
  description TEXT,
  guidance_note TEXT,   -- Southeast "how-to-think" prose (rationale), stored, never rendered

  created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 2. LOI_VARIANT — deal-type-conditioned grouping under a clause
--    (deal-type scope only for now; geography deferred until multi-state content exists)
-- ============================================================================

CREATE TABLE IF NOT EXISTS loi_variant (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clause_id UUID NOT NULL REFERENCES loi_clause(id) ON DELETE CASCADE,

  variant_key TEXT NOT NULL,   -- unique within the clause
  deal_type_scope TEXT[] NOT NULL DEFAULT ARRAY['end-cap-drive-thru'],
  description TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE (clause_id, variant_key)
);

CREATE INDEX IF NOT EXISTS idx_loi_variant_clause ON loi_variant(clause_id);
CREATE INDEX IF NOT EXISTS idx_loi_variant_deal_type ON loi_variant USING GIN (deal_type_scope);

-- ============================================================================
-- 3. LOI_CANONICAL_BODY — IMMUTABLE, versioned baseline text
--    Word-for-word-vs-modified computes against this. THE COLLISION GUARD LIVES HERE.
-- ============================================================================

CREATE TABLE IF NOT EXISTS loi_canonical_body (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  brace_code TEXT,             -- NULL only for custom-owned clauses (no Starbucks code)
  -- source = document-of-origin. DISTINCT from authority (governance).
  source TEXT NOT NULL
    CHECK (source IN ('national-template-drop','national-handbook','southeast-doc','oculus-authored')),
  version TEXT NOT NULL DEFAULT 'v1',

  body_text TEXT NOT NULL,     -- byte-fidelity baseline (brace codes, brackets, line structure preserved)
  body_sha256 TEXT,            -- optional integrity hash of body_text

  created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- COLLISION CONSTRAINT: one canonical text per (code, source, version).
  -- A second distinct CO1 body under the SAME source+version fails here, not at audit time.
  -- (National CO1 and Southeast CO1 differ by SOURCE, so both are legitimately allowed.)
  CONSTRAINT loi_canonical_body_code_source_version_key UNIQUE (brace_code, source, version)
);

CREATE INDEX IF NOT EXISTS idx_loi_canonical_body_code ON loi_canonical_body(brace_code);

-- Immutability guard: once written, body identity/text cannot change. New version = new row.
CREATE OR REPLACE FUNCTION loi_canonical_body_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.body_text IS DISTINCT FROM OLD.body_text
     OR NEW.brace_code IS DISTINCT FROM OLD.brace_code
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.version IS DISTINCT FROM OLD.version THEN
    RAISE EXCEPTION 'loi_canonical_body is immutable; create a new version row instead';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS loi_canonical_body_immutable_trg ON loi_canonical_body;
CREATE TRIGGER loi_canonical_body_immutable_trg
  BEFORE UPDATE ON loi_canonical_body
  FOR EACH ROW EXECUTE FUNCTION loi_canonical_body_immutable();

-- ============================================================================
-- 4. LOI_DIRECTOR_QUESTION — first-class blocked-on-Director tracker
--    (created before loi_position because positions FK to it)
-- ============================================================================

CREATE TABLE IF NOT EXISTS loi_director_question (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  question_key TEXT NOT NULL UNIQUE,
  question_text TEXT NOT NULL,

  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','answered')),
  date_asked DATE,
  date_answered DATE,
  answer_text TEXT,

  -- Preserve the authority behind the question (corporate vs regional) — do not collapse.
  authority TEXT CHECK (authority IN ('national-handbook','southeast-regional','self-authored')),

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================================================
-- 5. LOI_POSITION — a ranked alternative OR a conditional modifier
--    Every SELECTABLE coded position carries a brace code (no coded gaps).
-- ============================================================================

CREATE TABLE IF NOT EXISTS loi_position (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  variant_id UUID NOT NULL REFERENCES loi_variant(id) ON DELETE CASCADE,
  canonical_body_id UUID REFERENCES loi_canonical_body(id) ON DELETE RESTRICT,  -- baseline text

  position_kind TEXT NOT NULL CHECK (position_kind IN ('alternative','modifier')),
  brace_code TEXT,          -- position identifier; NULL only for custom-owned clauses
  rank INTEGER,             -- required for 'alternative' (0 = preferred); NULL for 'modifier'
  emit_order INTEGER,       -- required for 'modifier' (deterministic emission); NULL for 'alternative'
  modifies_clause_id UUID REFERENCES loi_clause(id) ON DELETE RESTRICT,  -- non-null iff modifier

  -- The Oculus standing default preloaded into Position 1 (distinct from Starbucks rank 0).
  is_default BOOLEAN NOT NULL DEFAULT false,

  -- Provenance / governance (rigid spine)
  code_status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (code_status IN ('confirmed','provisional')),
  rule_status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (rule_status IN ('confirmed','provisional-pending-director')),
  authority TEXT NOT NULL
    CHECK (authority IN ('national-handbook','southeast-regional','self-authored')),

  -- Approval flag = boolean + authority + (label resolved via loi_approval_label lookup).
  approval_required BOOLEAN NOT NULL DEFAULT false,
  approval_authority TEXT
    CHECK (approval_authority IN ('national-handbook','southeast-regional','self-authored')),
  -- How the flag presents: fires fresh per deal, or a once-decided owned deviation (e.g. ETR omission).
  firing_mode TEXT NOT NULL DEFAULT 'per-deal'
    CHECK (firing_mode IN ('per-deal','standing-acknowledged')),

  director_question_id UUID REFERENCES loi_director_question(id) ON DELETE SET NULL,

  -- Prose / soft edges — distinct note channels (Section 7).
  internal_note TEXT,          -- internal explanatory note
  deviation_rationale TEXT,    -- Starbucks-facing deviation explanation (audit record)
  landlord_fill_prompt TEXT,   -- landlord fill-in prompt
  provisional_note TEXT,       -- ambiguity captured for provisional codes

  created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Kind integrity: alternatives are ranked ladder rungs; modifiers ride a clause with emit order.
  CONSTRAINT loi_position_kind_shape CHECK (
    (position_kind = 'alternative'
       AND rank IS NOT NULL AND modifies_clause_id IS NULL AND emit_order IS NULL)
    OR
    (position_kind = 'modifier'
       AND rank IS NULL AND modifies_clause_id IS NOT NULL AND emit_order IS NOT NULL)
  ),

  -- Approval integrity: authority present iff approval required.
  CONSTRAINT loi_position_approval_shape CHECK (
    (approval_required = false AND approval_authority IS NULL)
    OR (approval_required = true AND approval_authority IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_loi_position_variant ON loi_position(variant_id);
CREATE INDEX IF NOT EXISTS idx_loi_position_body ON loi_position(canonical_body_id);
CREATE INDEX IF NOT EXISTS idx_loi_position_modifies ON loi_position(modifies_clause_id);
CREATE INDEX IF NOT EXISTS idx_loi_position_director_q ON loi_position(director_question_id);
-- "What's unconfirmed?" and "what's blocked on the Director?" must be one-query cheap.
CREATE INDEX IF NOT EXISTS idx_loi_position_code_status ON loi_position(code_status) WHERE code_status = 'provisional';
CREATE INDEX IF NOT EXISTS idx_loi_position_rule_status ON loi_position(rule_status) WHERE rule_status = 'provisional-pending-director';

-- Ranks unique on the ladder only (modifiers are not on it).
CREATE UNIQUE INDEX IF NOT EXISTS loi_position_variant_rank_uk
  ON loi_position (variant_id, rank) WHERE position_kind = 'alternative';
-- Co-riding modifiers on one clause emit in a fixed, unique order.
CREATE UNIQUE INDEX IF NOT EXISTS loi_position_modifier_emit_uk
  ON loi_position (modifies_clause_id, emit_order) WHERE position_kind = 'modifier';
-- At most one Oculus standing default per variant.
CREATE UNIQUE INDEX IF NOT EXISTS loi_position_default_uk
  ON loi_position (variant_id) WHERE is_default;
-- No duplicate brace codes among a variant's alternatives.
CREATE UNIQUE INDEX IF NOT EXISTS loi_position_variant_brace_uk
  ON loi_position (variant_id, brace_code) WHERE brace_code IS NOT NULL;

-- Brace-code completeness: coded positions must carry a code; custom-owned must not.
-- (Cross-table with clause.bucket, so enforced by trigger rather than CHECK.)
CREATE OR REPLACE FUNCTION loi_position_brace_code_guard() RETURNS trigger AS $$
DECLARE
  v_bucket TEXT;
BEGIN
  SELECT c.bucket INTO v_bucket
  FROM loi_variant v
  JOIN loi_clause c ON c.id = v.clause_id
  WHERE v.id = NEW.variant_id;

  IF v_bucket = 'custom-owned' THEN
    IF NEW.brace_code IS NOT NULL THEN
      RAISE EXCEPTION 'custom-owned clause positions must not carry a brace code (variant %)', NEW.variant_id;
    END IF;
  ELSE
    IF NEW.brace_code IS NULL THEN
      RAISE EXCEPTION 'selectable coded position must carry a brace code — no coded gaps (variant %)', NEW.variant_id;
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS loi_position_brace_code_guard_trg ON loi_position;
CREATE TRIGGER loi_position_brace_code_guard_trg
  BEFORE INSERT OR UPDATE ON loi_position
  FOR EACH ROW EXECUTE FUNCTION loi_position_brace_code_guard();

-- ============================================================================
-- 6. LOI_APPLIES_WHEN_CONDITION — normalized structured trigger (NO JSONB)
--    Rows in the same condition_group AND together; groups OR together.
--    Cross-clause dependencies become a plain indexed join.
-- ============================================================================

CREATE TABLE IF NOT EXISTS loi_applies_when_condition (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES loi_position(id) ON DELETE CASCADE,

  condition_group INTEGER NOT NULL DEFAULT 0,

  ref_kind TEXT NOT NULL
    CHECK (ref_kind IN ('deal_field','clause_selection','clause_field')),
  -- Cross-clause reference by stable key (FK to loi_clause.clause_key). NULL for deal_field.
  ref_clause_key TEXT REFERENCES loi_clause(clause_key) ON DELETE RESTRICT,
  ref_field TEXT,   -- deal field name (e.g. 'scheduled_delivery_date') or clause field

  operator TEXT NOT NULL
    CHECK (operator IN ('eq','neq','lt','lte','gt','gte','within_days_of',
                        'is_selected','not_selected','exists','not_exists')),
  compare_value TEXT,
  compare_unit TEXT,   -- e.g. 'days'
  note TEXT,

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Shape integrity per ref_kind.
  CONSTRAINT loi_applies_when_ref_shape CHECK (
    (ref_kind = 'deal_field'       AND ref_clause_key IS NULL     AND ref_field IS NOT NULL)
    OR (ref_kind = 'clause_selection' AND ref_clause_key IS NOT NULL)
    OR (ref_kind = 'clause_field'     AND ref_clause_key IS NOT NULL AND ref_field IS NOT NULL)
  )
);

CREATE INDEX IF NOT EXISTS idx_loi_applies_when_position ON loi_applies_when_condition(position_id);
-- "Which positions depend on clause X?" — the cross-clause dependency query.
CREATE INDEX IF NOT EXISTS idx_loi_applies_when_ref_clause ON loi_applies_when_condition(ref_clause_key);
CREATE INDEX IF NOT EXISTS idx_loi_applies_when_ref_field ON loi_applies_when_condition(ref_field);

-- ============================================================================
-- 7. LOI_APPROVAL_LABEL — swappable label keyed by authority (ONE place)
--    Drives LIVE projections only; the frozen LRM snapshots the resolved string.
-- ============================================================================

CREATE TABLE IF NOT EXISTS loi_approval_label (
  authority TEXT PRIMARY KEY
    CHECK (authority IN ('national-handbook','southeast-regional','self-authored')),
  display_label TEXT NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Placeholder today; swap to Starbucks' real acronym(s) here in one place when known.
INSERT INTO loi_approval_label (authority, display_label) VALUES
  ('national-handbook',   'approval required'),
  ('southeast-regional',  'approval required')
ON CONFLICT (authority) DO NOTHING;

-- ============================================================================
-- 8. LOI_CONFIG — named, versioned config values (no magic numbers in code)
-- ============================================================================

CREATE TABLE IF NOT EXISTS loi_config (
  config_key TEXT PRIMARY KEY,
  config_value TEXT,
  value_type TEXT NOT NULL DEFAULT 'string'
    CHECK (value_type IN ('string','int','bool','json')),
  rule_status TEXT NOT NULL DEFAULT 'confirmed'
    CHECK (rule_status IN ('confirmed','provisional-pending-director')),
  version INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Exit-strategy threshold ships PROVISIONAL pending the Director (1-of vs 2-of, ETR off the table).
INSERT INTO loi_config (config_key, config_value, value_type, rule_status, note) VALUES
  ('exit_strategy_threshold', NULL, 'int', 'provisional-pending-director',
   'With ETR permanently unavailable: is exit satisfied by A&S alone, or must A&S AND no-min-ops both hold? Pending Southeast Director.')
ON CONFLICT (config_key) DO NOTHING;

-- ============================================================================
-- 9. updated_at TRIGGERS
-- ============================================================================

DROP TRIGGER IF EXISTS update_loi_clause_updated_at ON loi_clause;
CREATE TRIGGER update_loi_clause_updated_at BEFORE UPDATE ON loi_clause
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_loi_variant_updated_at ON loi_variant;
CREATE TRIGGER update_loi_variant_updated_at BEFORE UPDATE ON loi_variant
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_loi_position_updated_at ON loi_position;
CREATE TRIGGER update_loi_position_updated_at BEFORE UPDATE ON loi_position
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_loi_director_question_updated_at ON loi_director_question;
CREATE TRIGGER update_loi_director_question_updated_at BEFORE UPDATE ON loi_director_question
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_loi_approval_label_updated_at ON loi_approval_label;
CREATE TRIGGER update_loi_approval_label_updated_at BEFORE UPDATE ON loi_approval_label
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS update_loi_config_updated_at ON loi_config;
CREATE TRIGGER update_loi_config_updated_at BEFORE UPDATE ON loi_config
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 10. RLS — internal users full access (LOI data is internal-only)
-- ============================================================================

ALTER TABLE loi_clause ENABLE ROW LEVEL SECURITY;
ALTER TABLE loi_variant ENABLE ROW LEVEL SECURITY;
ALTER TABLE loi_canonical_body ENABLE ROW LEVEL SECURITY;
ALTER TABLE loi_position ENABLE ROW LEVEL SECURITY;
ALTER TABLE loi_applies_when_condition ENABLE ROW LEVEL SECURITY;
ALTER TABLE loi_director_question ENABLE ROW LEVEL SECURITY;
ALTER TABLE loi_approval_label ENABLE ROW LEVEL SECURITY;
ALTER TABLE loi_config ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "loi_clause_internal_all" ON loi_clause;
CREATE POLICY "loi_clause_internal_all" ON loi_clause FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

DROP POLICY IF EXISTS "loi_variant_internal_all" ON loi_variant;
CREATE POLICY "loi_variant_internal_all" ON loi_variant FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

DROP POLICY IF EXISTS "loi_canonical_body_internal_all" ON loi_canonical_body;
CREATE POLICY "loi_canonical_body_internal_all" ON loi_canonical_body FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

DROP POLICY IF EXISTS "loi_position_internal_all" ON loi_position;
CREATE POLICY "loi_position_internal_all" ON loi_position FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

DROP POLICY IF EXISTS "loi_applies_when_condition_internal_all" ON loi_applies_when_condition;
CREATE POLICY "loi_applies_when_condition_internal_all" ON loi_applies_when_condition FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

DROP POLICY IF EXISTS "loi_director_question_internal_all" ON loi_director_question;
CREATE POLICY "loi_director_question_internal_all" ON loi_director_question FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

DROP POLICY IF EXISTS "loi_approval_label_internal_all" ON loi_approval_label;
CREATE POLICY "loi_approval_label_internal_all" ON loi_approval_label FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

DROP POLICY IF EXISTS "loi_config_internal_all" ON loi_config;
CREATE POLICY "loi_config_internal_all" ON loi_config FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());

-- ============================================================================
-- 11. GRANTS
-- ============================================================================

GRANT SELECT, INSERT, UPDATE, DELETE ON loi_clause TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_variant TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_canonical_body TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_position TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_applies_when_condition TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_director_question TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_approval_label TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_config TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
