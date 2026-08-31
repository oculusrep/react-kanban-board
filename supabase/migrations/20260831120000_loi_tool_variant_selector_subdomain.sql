-- Starbucks LOI Tool — deal-type-restricted selector subdomain (Pass One)
-- Created: August 31, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260825190000_loi_tool_selector_domain_versioning.sql
--
-- CAM axis resolved: it's LEASE STRUCTURE, not building type. A derived composite selector cam_basis
-- partitions {nn_multi_tenant -> CAM0, nn_single_tenant_building -> CAM1, nnn -> NNN}. But an end-cap
-- drive-thru is ALWAYS nn_multi_tenant (CAM0); CAM1/NNN belong to the freestanding deal type. So the
-- ECDT CAM variant must be valid covering ONLY {nn_multi_tenant} without being forced to include
-- CAM1/NNN just to satisfy exhaustiveness.
--
-- Mechanism: a variant may declare a SUBDOMAIN (a subset of its selector's domain, reachable for that
-- variant's deal type). Exhaustiveness is then checked against the subdomain. No subdomain declared =>
-- full-domain coverage (unchanged for rent_structure / landlord_work_structure).
--
-- Also retires the empty provisional building_type SELECTOR (it must not linger as an unresolved
-- partition); building_type stays a deal FIELD feeding the cam_basis derivation (wizard logic).

-- ============================================================================
-- 1. Retire the empty provisional building_type selector (idempotent)
-- ============================================================================
DELETE FROM loi_selector_domain WHERE selector_field = 'building_type';
DELETE FROM loi_selector        WHERE selector_field = 'building_type';

-- ============================================================================
-- 2. Per-variant subdomain
-- ============================================================================
CREATE TABLE IF NOT EXISTS loi_variant_selector_value (
  variant_id UUID NOT NULL REFERENCES loi_variant(id) ON DELETE CASCADE,
  value TEXT NOT NULL,
  PRIMARY KEY (variant_id, value)
);
CREATE INDEX IF NOT EXISTS idx_loi_variant_selector_value_variant ON loi_variant_selector_value(variant_id);

ALTER TABLE loi_variant_selector_value ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loi_variant_selector_value_internal_all" ON loi_variant_selector_value;
CREATE POLICY "loi_variant_selector_value_internal_all" ON loi_variant_selector_value FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_variant_selector_value TO authenticated;

-- ============================================================================
-- 3. Partition check validates against the SUBDOMAIN when declared, else the full domain
-- ============================================================================
CREATE OR REPLACE FUNCTION loi_assert_variant_partition(v_variant UUID) RETURNS void AS $$
DECLARE
  v_selector TEXT;
  v_version INTEGER;
  v_domain_count INTEGER;
  v_sub_count INTEGER;
  v_effective_count INTEGER;
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

  SELECT count(*) INTO v_sub_count FROM loi_variant_selector_value WHERE variant_id = v_variant;

  IF v_sub_count > 0 THEN
    -- declared subdomain must be a subset of the selector's versioned domain
    IF EXISTS (
      SELECT 1 FROM loi_variant_selector_value s
      WHERE s.variant_id = v_variant
        AND NOT EXISTS (SELECT 1 FROM loi_selector_domain d
                        WHERE d.selector_field = v_selector AND d.version = v_version AND d.value = s.value)
    ) THEN
      RAISE EXCEPTION 'variant % subdomain has a value outside domain "% v%"', v_variant, v_selector, v_version;
    END IF;
    v_effective_count := v_sub_count;
    -- every conditional_alternative value must be in the SUBDOMAIN
    IF EXISTS (
      SELECT 1 FROM loi_position p
      WHERE p.variant_id = v_variant AND p.position_kind = 'conditional_alternative'
        AND NOT EXISTS (SELECT 1 FROM loi_variant_selector_value s
                        WHERE s.variant_id = v_variant AND s.value = p.selector_value)
    ) THEN
      RAISE EXCEPTION 'variant % has a conditional_alternative selector_value outside its declared subdomain', v_variant;
    END IF;
  ELSE
    v_effective_count := v_domain_count;
    -- every conditional_alternative value must be in the full domain
    IF EXISTS (
      SELECT 1 FROM loi_position p
      WHERE p.variant_id = v_variant AND p.position_kind = 'conditional_alternative'
        AND NOT EXISTS (SELECT 1 FROM loi_selector_domain d
                        WHERE d.selector_field = v_selector AND d.version = v_version AND d.value = p.selector_value)
    ) THEN
      RAISE EXCEPTION 'variant % has a conditional_alternative selector_value outside domain "% v%"',
        v_variant, v_selector, v_version;
    END IF;
  END IF;

  SELECT count(DISTINCT selector_value) INTO v_distinct_used
    FROM loi_position WHERE variant_id = v_variant AND position_kind = 'conditional_alternative';
  IF v_distinct_used <> v_effective_count THEN
    RAISE EXCEPTION 'variant % does not exhaustively cover its % (have %, need %)',
      v_variant, CASE WHEN v_sub_count > 0 THEN 'subdomain' ELSE 'selector domain' END,
      v_distinct_used, v_effective_count;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Fire the partition check when a variant's subdomain changes, too.
CREATE OR REPLACE FUNCTION loi_variant_partition_from_subdomain() RETURNS trigger AS $$
BEGIN
  PERFORM loi_assert_variant_partition(COALESCE(NEW.variant_id, OLD.variant_id));
  RETURN NULL;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS loi_variant_partition_subdomain_ck ON loi_variant_selector_value;
CREATE CONSTRAINT TRIGGER loi_variant_partition_subdomain_ck
  AFTER INSERT OR UPDATE OR DELETE ON loi_variant_selector_value
  DEFERRABLE INITIALLY DEFERRED
  FOR EACH ROW EXECUTE FUNCTION loi_variant_partition_from_subdomain();

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
