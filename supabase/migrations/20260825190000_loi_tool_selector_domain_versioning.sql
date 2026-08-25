-- Starbucks LOI Tool — Selector Domain Versioning + Staleness (Pass One)
-- Created: August 25, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260825180000_loi_tool_clause_library_v2.sql
--
-- Requirement (Mike): domain changes are VERSIONED, not edits. Adding a value later must
-- make existing variants FAIL LOUDLY (non-exhaustive), never be silently backfilled.
-- Enforcement point for staleness: ASSEMBLY + LRM FREEZE hard-error (documented resolver
-- rule), surfaced by a queryable work-list view. Write-time validates a variant against the
-- domain version it PINS, so unrelated edits to a not-yet-reconciled variant still succeed.
--
-- Pre-seed the domain is free to correct as v1 (nothing pins it yet); versioning only bites
-- once records reference it. See docs/STARBUCKS_LOI_TOOL_DECISIONS.md.

-- ============================================================================
-- 1. SELECTOR — per-selector current_version pointer
-- ============================================================================

CREATE TABLE IF NOT EXISTS loi_selector (
  selector_field TEXT PRIMARY KEY,
  current_version INTEGER NOT NULL DEFAULT 1,
  note TEXT,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);
ALTER TABLE loi_selector ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loi_selector_internal_all" ON loi_selector;
CREATE POLICY "loi_selector_internal_all" ON loi_selector FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_selector TO authenticated;

DROP TRIGGER IF EXISTS update_loi_selector_updated_at ON loi_selector;
CREATE TRIGGER update_loi_selector_updated_at BEFORE UPDATE ON loi_selector
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

INSERT INTO loi_selector (selector_field, current_version, note) VALUES
  ('building_type', 1, 'PROVISIONAL v1 — confirm values against all clauses during extraction before seeding.')
ON CONFLICT (selector_field) DO NOTHING;

-- ============================================================================
-- 2. DOMAIN gains a version; PK becomes (selector_field, version, value)
-- ============================================================================

ALTER TABLE loi_selector_domain ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

ALTER TABLE loi_selector_domain DROP CONSTRAINT IF EXISTS loi_selector_domain_pkey;
ALTER TABLE loi_selector_domain ADD PRIMARY KEY (selector_field, version, value);

ALTER TABLE loi_selector_domain DROP CONSTRAINT IF EXISTS loi_selector_domain_selector_fk;
ALTER TABLE loi_selector_domain ADD CONSTRAINT loi_selector_domain_selector_fk
  FOREIGN KEY (selector_field) REFERENCES loi_selector(selector_field) ON DELETE CASCADE;

-- ============================================================================
-- 3. VARIANT pins the domain version it was partitioned against
-- ============================================================================

ALTER TABLE loi_variant ADD COLUMN IF NOT EXISTS selector_version INTEGER;

ALTER TABLE loi_variant DROP CONSTRAINT IF EXISTS loi_variant_selector_shape;
ALTER TABLE loi_variant ADD CONSTRAINT loi_variant_selector_shape CHECK (
  (selector_field IS NULL AND selector_version IS NULL)
  OR (selector_field IS NOT NULL AND selector_version IS NOT NULL)
);

ALTER TABLE loi_variant DROP CONSTRAINT IF EXISTS loi_variant_selector_fk;
ALTER TABLE loi_variant ADD CONSTRAINT loi_variant_selector_fk
  FOREIGN KEY (selector_field) REFERENCES loi_selector(selector_field) ON DELETE RESTRICT;

-- ============================================================================
-- 4. PARTITION CHECK — validate against the variant's PINNED version
--    (helper + two deferred constraint-trigger wrappers: on loi_position and loi_variant)
-- ============================================================================

CREATE OR REPLACE FUNCTION loi_assert_variant_partition(v_variant UUID) RETURNS void AS $$
DECLARE
  v_selector TEXT;
  v_version INTEGER;
  v_domain_count INTEGER;
  v_distinct_used INTEGER;
  v_cond_count INTEGER;
BEGIN
  SELECT selector_field, selector_version INTO v_selector, v_version
    FROM loi_variant WHERE id = v_variant;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT count(*) INTO v_cond_count
    FROM loi_position WHERE variant_id = v_variant AND position_kind = 'conditional_alternative';

  IF v_selector IS NULL THEN
    IF v_cond_count > 0 THEN
      RAISE EXCEPTION 'variant % has conditional_alternative positions but no selector_field', v_variant;
    END IF;
    RETURN;
  END IF;

  SELECT count(*) INTO v_domain_count
    FROM loi_selector_domain WHERE selector_field = v_selector AND version = v_version;
  IF v_domain_count = 0 THEN
    RAISE EXCEPTION 'variant % selector "%" v% has no domain rows', v_variant, v_selector, v_version;
  END IF;
  IF v_cond_count = 0 THEN
    RAISE EXCEPTION 'variant % declares selector "%" but has no conditional_alternatives', v_variant, v_selector;
  END IF;

  IF EXISTS (
    SELECT 1 FROM loi_position p
    WHERE p.variant_id = v_variant AND p.position_kind = 'conditional_alternative'
      AND NOT EXISTS (SELECT 1 FROM loi_selector_domain d
                      WHERE d.selector_field = v_selector AND d.version = v_version AND d.value = p.selector_value)
  ) THEN
    RAISE EXCEPTION 'variant % has a conditional_alternative selector_value outside domain "% v%"',
      v_variant, v_selector, v_version;
  END IF;

  SELECT count(DISTINCT selector_value) INTO v_distinct_used
    FROM loi_position WHERE variant_id = v_variant AND position_kind = 'conditional_alternative';
  IF v_distinct_used <> v_domain_count THEN
    RAISE EXCEPTION 'variant % does not exhaustively cover domain "% v%" (have %, need %)',
      v_variant, v_selector, v_version, v_distinct_used, v_domain_count;
  END IF;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION loi_variant_partition_from_position() RETURNS trigger AS $$
BEGIN
  PERFORM loi_assert_variant_partition(COALESCE(NEW.variant_id, OLD.variant_id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION loi_variant_partition_from_variant() RETURNS trigger AS $$
BEGIN
  PERFORM loi_assert_variant_partition(COALESCE(NEW.id, OLD.id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

-- Replace the v2 trigger (which used the pre-versioning function).
DROP TRIGGER IF EXISTS loi_variant_partition_ck ON loi_position;
CREATE CONSTRAINT TRIGGER loi_variant_partition_ck
  AFTER INSERT OR UPDATE OR DELETE ON loi_position
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION loi_variant_partition_from_position();

DROP TRIGGER IF EXISTS loi_variant_partition_self_ck ON loi_variant;
CREATE CONSTRAINT TRIGGER loi_variant_partition_self_ck
  AFTER INSERT OR UPDATE ON loi_variant
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION loi_variant_partition_from_variant();

DROP FUNCTION IF EXISTS loi_variant_partition_check();  -- retired v2 function

-- ============================================================================
-- 5. STALENESS WORK-LIST VIEW — variants pinned to a non-current domain version.
--    Assembly and the LRM freeze MUST hard-error on any row here (resolver rule).
-- ============================================================================

CREATE OR REPLACE VIEW loi_stale_selector_variant AS
SELECT v.id AS variant_id,
       c.clause_key,
       v.variant_key,
       v.selector_field,
       v.selector_version AS pinned_version,
       s.current_version
FROM loi_variant v
JOIN loi_selector s ON s.selector_field = v.selector_field
JOIN loi_clause c   ON c.id = v.clause_id
WHERE v.selector_field IS NOT NULL
  AND v.selector_version <> s.current_version;

GRANT SELECT ON loi_stale_selector_variant TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
