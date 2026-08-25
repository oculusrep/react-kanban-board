-- Starbucks LOI Tool — Clause Library Core, revision 2 (Pass One, proof-of-shape fixes)
-- Created: August 25, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260825170000_loi_tool_clause_library.sql
--
-- Four problems surfaced by a proof-of-shape pass on Exclusive Use + CAM against the
-- national drop (LOI_US__2_.docx) and the Powder Springs LOI. See
-- docs/STARBUCKS_LOI_TOOL_DECISIONS.md (Section "Proof-of-shape revisions").
--
-- 1. One brace code can emit at MULTIPLE insertion points with DIFFERENT bodies, same
--    source+version (intra-source, legitimate — e.g. {NNN}). Canonical body gains a 4th
--    key component (segment_key); a position carries one-to-many bodies via loi_position_body.
-- 2. Chained modifiers (EU2 requires EU1): expressed via applies_when 'position_selection'.
-- 3. (Content) EU1 definitions defect — handled by #1 multi-segment bodies, flagged in a note.
-- 4. Building-type-selected alternatives (CAM0/CAM1/NNN) are NOT a rank ladder:
--    new position_kind 'conditional_alternative', selected by a TYPED enumerated selector
--    with LOAD-TIME exact-partition enforcement (exclusive + exhaustive) so a bad seed fails
--    on load, and the resolver hard-errors on zero match rather than emitting nothing.
--    Plus loi_variant.replaces_base for the Southeast "replace in entirety" instruction.
--
-- No LOI data loaded yet, so column drops are safe.

-- ============================================================================
-- 1. CANONICAL BODY — 4th key component (segment_key / insertion point)
-- ============================================================================

ALTER TABLE loi_canonical_body ADD COLUMN IF NOT EXISTS segment_key TEXT NOT NULL DEFAULT 'main';

ALTER TABLE loi_canonical_body DROP CONSTRAINT IF EXISTS loi_canonical_body_code_source_version_key;
ALTER TABLE loi_canonical_body ADD CONSTRAINT loi_canonical_body_code_source_version_segment_key
  UNIQUE (brace_code, source, version, segment_key);

-- Immutability guard now also covers segment_key.
CREATE OR REPLACE FUNCTION loi_canonical_body_immutable() RETURNS trigger AS $$
BEGIN
  IF NEW.body_text IS DISTINCT FROM OLD.body_text
     OR NEW.brace_code IS DISTINCT FROM OLD.brace_code
     OR NEW.source IS DISTINCT FROM OLD.source
     OR NEW.version IS DISTINCT FROM OLD.version
     OR NEW.segment_key IS DISTINCT FROM OLD.segment_key THEN
    RAISE EXCEPTION 'loi_canonical_body is immutable; create a new version/segment row instead';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- 2. POSITION -> one-to-many BODIES (loi_position_body); drop the single FK
-- ============================================================================

CREATE TABLE IF NOT EXISTS loi_position_body (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  position_id UUID NOT NULL REFERENCES loi_position(id) ON DELETE CASCADE,
  canonical_body_id UUID NOT NULL REFERENCES loi_canonical_body(id) ON DELETE RESTRICT,
  emit_sequence INTEGER NOT NULL DEFAULT 0,   -- deterministic order of a position's own segments
  note TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  UNIQUE (position_id, canonical_body_id),
  UNIQUE (position_id, emit_sequence)
);
CREATE INDEX IF NOT EXISTS idx_loi_position_body_position ON loi_position_body(position_id);
CREATE INDEX IF NOT EXISTS idx_loi_position_body_body ON loi_position_body(canonical_body_id);

ALTER TABLE loi_position_body ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loi_position_body_internal_all" ON loi_position_body;
CREATE POLICY "loi_position_body_internal_all" ON loi_position_body FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_position_body TO authenticated;

-- Retire the single-body FK (superseded by the join). Drops its FK + index too.
ALTER TABLE loi_position DROP COLUMN IF EXISTS canonical_body_id;

-- ============================================================================
-- 3. NEW position_kind 'conditional_alternative' + typed selector columns
-- ============================================================================

ALTER TABLE loi_position ADD COLUMN IF NOT EXISTS selector_value TEXT;
ALTER TABLE loi_variant  ADD COLUMN IF NOT EXISTS selector_field TEXT;
ALTER TABLE loi_variant  ADD COLUMN IF NOT EXISTS replaces_base BOOLEAN NOT NULL DEFAULT false;

-- position_kind now allows a third value.
ALTER TABLE loi_position DROP CONSTRAINT IF EXISTS loi_position_position_kind_check;
ALTER TABLE loi_position ADD CONSTRAINT loi_position_position_kind_check
  CHECK (position_kind IN ('alternative','conditional_alternative','modifier'));

-- Shape integrity across all three kinds (adds the selector_value axis).
ALTER TABLE loi_position DROP CONSTRAINT IF EXISTS loi_position_kind_shape;
ALTER TABLE loi_position ADD CONSTRAINT loi_position_kind_shape CHECK (
  (position_kind = 'alternative'
     AND rank IS NOT NULL AND modifies_clause_id IS NULL AND emit_order IS NULL AND selector_value IS NULL)
  OR
  (position_kind = 'conditional_alternative'
     AND rank IS NULL AND modifies_clause_id IS NULL AND emit_order IS NULL AND selector_value IS NOT NULL)
  OR
  (position_kind = 'modifier'
     AND rank IS NULL AND modifies_clause_id IS NOT NULL AND emit_order IS NOT NULL AND selector_value IS NULL)
);

-- Mutual exclusivity (immediate): no two conditional_alternatives share a selector_value in a variant.
CREATE UNIQUE INDEX IF NOT EXISTS loi_position_variant_selector_uk
  ON loi_position (variant_id, selector_value) WHERE position_kind = 'conditional_alternative';

-- ============================================================================
-- 4. SELECTOR DOMAIN + LOAD-TIME EXACT-PARTITION ENFORCEMENT (deferred)
-- ============================================================================

CREATE TABLE IF NOT EXISTS loi_selector_domain (
  selector_field TEXT NOT NULL,
  value TEXT NOT NULL,
  description TEXT,
  PRIMARY KEY (selector_field, value)
);
ALTER TABLE loi_selector_domain ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loi_selector_domain_internal_all" ON loi_selector_domain;
CREATE POLICY "loi_selector_domain_internal_all" ON loi_selector_domain FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_selector_domain TO authenticated;

-- Controlled vocabulary for the building-type selector. Derived from the national drop
-- labels ("FALLBACK FOR SINGLE TENANT BUILDING / SINGLE TENANT PARCEL"; base = multi-tenant).
-- CONFIRM values with Mike during extraction.
INSERT INTO loi_selector_domain (selector_field, value, description) VALUES
  ('building_type', 'multi_tenant',           'Multi-tenant building (base case)'),
  ('building_type', 'single_tenant_building', 'Single-tenant building fallback'),
  ('building_type', 'single_tenant_parcel',   'Single-tenant parcel fallback')
ON CONFLICT (selector_field, value) DO NOTHING;

-- Deferred constraint trigger: at COMMIT, each variant's conditional_alternatives must form
-- an EXACT partition of its selector domain (exhaustive + in-domain). Exclusivity is already
-- guaranteed immediately by loi_position_variant_selector_uk. A variant with a selector_field
-- but no conditional_alternatives (or vice versa) is also a hard error.
CREATE OR REPLACE FUNCTION loi_variant_partition_check() RETURNS trigger AS $$
DECLARE
  v_variant UUID := COALESCE(NEW.variant_id, OLD.variant_id);
  v_selector TEXT;
  v_domain_count INT;
  v_distinct_used INT;
  v_cond_count INT;
BEGIN
  SELECT selector_field INTO v_selector FROM loi_variant WHERE id = v_variant;
  IF NOT FOUND THEN
    RETURN NULL;  -- variant deleted in this txn
  END IF;

  SELECT count(*) INTO v_cond_count
    FROM loi_position WHERE variant_id = v_variant AND position_kind = 'conditional_alternative';

  IF v_selector IS NULL THEN
    IF v_cond_count > 0 THEN
      RAISE EXCEPTION 'variant % has conditional_alternative positions but no selector_field', v_variant;
    END IF;
    RETURN NULL;
  END IF;

  SELECT count(*) INTO v_domain_count FROM loi_selector_domain WHERE selector_field = v_selector;
  IF v_domain_count = 0 THEN
    RAISE EXCEPTION 'variant % selector_field "%" has no domain in loi_selector_domain', v_variant, v_selector;
  END IF;
  IF v_cond_count = 0 THEN
    RAISE EXCEPTION 'variant % declares selector_field "%" but has no conditional_alternative positions', v_variant, v_selector;
  END IF;

  -- every used value must be in-domain
  IF EXISTS (
    SELECT 1 FROM loi_position p
    WHERE p.variant_id = v_variant AND p.position_kind = 'conditional_alternative'
      AND NOT EXISTS (SELECT 1 FROM loi_selector_domain d
                      WHERE d.selector_field = v_selector AND d.value = p.selector_value)
  ) THEN
    RAISE EXCEPTION 'variant % has a conditional_alternative selector_value outside domain "%"', v_variant, v_selector;
  END IF;

  -- exhaustive: distinct in-domain values used == full domain size (exclusivity guaranteed by index)
  SELECT count(DISTINCT selector_value) INTO v_distinct_used
    FROM loi_position WHERE variant_id = v_variant AND position_kind = 'conditional_alternative';

  IF v_distinct_used <> v_domain_count THEN
    RAISE EXCEPTION 'variant % conditional_alternatives do not cover selector domain "%" exhaustively (have %, need %)',
      v_variant, v_selector, v_distinct_used, v_domain_count;
  END IF;

  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS loi_variant_partition_ck ON loi_position;
CREATE CONSTRAINT TRIGGER loi_variant_partition_ck
  AFTER INSERT OR UPDATE OR DELETE ON loi_position
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION loi_variant_partition_check();

-- ============================================================================
-- 5. APPLIES_WHEN — add 'position_selection' ref_kind + ref_brace_code (chained modifiers)
-- ============================================================================

ALTER TABLE loi_applies_when_condition ADD COLUMN IF NOT EXISTS ref_brace_code TEXT;

ALTER TABLE loi_applies_when_condition DROP CONSTRAINT IF EXISTS loi_applies_when_condition_ref_kind_check;
ALTER TABLE loi_applies_when_condition ADD CONSTRAINT loi_applies_when_condition_ref_kind_check
  CHECK (ref_kind IN ('deal_field','clause_selection','clause_field','position_selection'));

ALTER TABLE loi_applies_when_condition DROP CONSTRAINT IF EXISTS loi_applies_when_ref_shape;
ALTER TABLE loi_applies_when_condition ADD CONSTRAINT loi_applies_when_ref_shape CHECK (
  (ref_kind = 'deal_field'         AND ref_clause_key IS NULL     AND ref_field IS NOT NULL AND ref_brace_code IS NULL)
  OR (ref_kind = 'clause_selection'   AND ref_clause_key IS NOT NULL AND ref_brace_code IS NULL)
  OR (ref_kind = 'clause_field'       AND ref_clause_key IS NOT NULL AND ref_field IS NOT NULL AND ref_brace_code IS NULL)
  OR (ref_kind = 'position_selection' AND ref_clause_key IS NOT NULL AND ref_brace_code IS NOT NULL)
);

CREATE INDEX IF NOT EXISTS idx_loi_applies_when_ref_brace ON loi_applies_when_condition(ref_clause_key, ref_brace_code);

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
