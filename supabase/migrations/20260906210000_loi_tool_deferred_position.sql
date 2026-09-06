-- Starbucks LOI Tool — POSITION-level deferral, so R1 can load while R0 stays declared-but-absent
-- Created: September 6, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260906200000_loi_tool_sign_type_undecided.sql
--
-- Mike agreed to split the rent deferral: R1 is fully specified (the emission spike plus §1.1-1.5 of
-- the column-insert contract), R0's render shape has NO artifact anywhere — the worked Freestanding
-- carries it unfilled — so inventing an R0 shape to preserve symmetry is how a wrong table ships.
--
-- THE PROBLEM the existing mechanism cannot express. loi_clause.unavailable_kind is CLAUSE-level, and
-- `rent` is one clause holding two positions. Once R1 loads, the clause must go active or R1 can never
-- be selected — at which point R0 becomes SILENTLY absent, which is exactly the failure contract C was
-- amended to prevent. And position-level is_active cannot help: R0 has no row to deactivate. A gap has
-- to be declarable BEFORE the thing exists.
--
-- So: a registry of coded positions that are known-but-not-loaded, mirroring loi_deferred_clause.
-- OVIS intersects a deal's resolved brace codes with it and HALTS on any overlap.

CREATE TABLE IF NOT EXISTS loi_deferred_position (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  clause_key TEXT NOT NULL REFERENCES loi_clause(clause_key) ON DELETE CASCADE,
  brace_code TEXT NOT NULL,

  reason TEXT NOT NULL,          -- why it is not loaded, and what would unblock it
  blocked_on TEXT,               -- the artifact or decision that lifts it

  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  UNIQUE (clause_key, brace_code)
);

COMMENT ON TABLE loi_deferred_position IS
  'Coded positions the library knows it cannot yet supply. A gap must be declarable BEFORE the position exists, which position.is_active cannot do. OVIS halts if a deal resolves to one of these.';

CREATE INDEX IF NOT EXISTS idx_loi_deferred_position_clause ON loi_deferred_position(clause_key);

ALTER TABLE loi_deferred_position ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loi_deferred_position_internal_all" ON loi_deferred_position;
CREATE POLICY "loi_deferred_position_internal_all" ON loi_deferred_position FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_deferred_position TO authenticated;

DROP TRIGGER IF EXISTS update_loi_deferred_position_updated_at ON loi_deferred_position;
CREATE TRIGGER update_loi_deferred_position_updated_at BEFORE UPDATE ON loi_deferred_position
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- A deferred position must NOT already be loaded. If it is, the registry is stale and OVIS would halt
-- on something that works — the mirror image of the stale-allowlist failure rule 4 catches.
CREATE OR REPLACE FUNCTION loi_deferred_position_guard() RETURNS trigger AS $$
BEGIN
  IF EXISTS (SELECT 1
               FROM loi_position p
               JOIN loi_variant v ON v.id = p.variant_id
               JOIN loi_clause  c ON c.id = v.clause_id
              WHERE c.clause_key = NEW.clause_key AND p.brace_code = NEW.brace_code) THEN
    RAISE EXCEPTION 'position %/% is LOADED — it cannot also be registered deferred',
                    NEW.clause_key, NEW.brace_code;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS loi_deferred_position_guard_trg ON loi_deferred_position;
CREATE TRIGGER loi_deferred_position_guard_trg
  BEFORE INSERT OR UPDATE ON loi_deferred_position
  FOR EACH ROW EXECUTE FUNCTION loi_deferred_position_guard();

-- ONE "may I proceed?" query for OVIS, spanning both granularities. Clause-level gaps and
-- position-level gaps are the same question asked at two scopes, and a caller that has to remember to
-- check both will eventually check one.
CREATE OR REPLACE VIEW loi_deferred_item AS
  SELECT 'clause'::text AS scope, clause_key, NULL::text AS brace_code, inactive_reason AS reason
    FROM loi_clause
   WHERE NOT is_active AND unavailable_kind = 'deferred'
  UNION ALL
  SELECT 'position'::text, clause_key, brace_code, reason
    FROM loi_deferred_position;

GRANT SELECT ON loi_deferred_item TO authenticated;

COMMENT ON VIEW loi_deferred_item IS
  'Every gap the library knows about, clause-level and position-level. OVIS intersects a deal''s requirements with this and refuses to build a payload on any overlap.';

-- Register R0. Done NOW, while `rent` is still clause-level deferred, so that the later tranche which
-- loads R1 and flips the clause active cannot leave R0 silently absent — the declaration is already
-- there and does not depend on anyone remembering.
INSERT INTO loi_deferred_position (clause_key, brace_code, reason, blocked_on)
SELECT 'rent', 'R0',
       'R0 (rent as a set annual amount, 3 columns) has no proven render shape. The worked Freestanding LOI carries the R0 block as tab-delimited paragraphs with the $ placeholders still EMPTY - it was never filled in - so no artifact anywhere shows a completed R0 schedule, and whether a filled R0 is a Word table or stays paragraphs is unknown. R1 is proven by the emission spike; R0 is not, and inventing a shape to preserve symmetry is how a wrong table ships.',
       'a worked or executed freestanding LOI carrying a FILLED R0 rent schedule'
 WHERE NOT EXISTS (SELECT 1 FROM loi_deferred_position WHERE clause_key='rent' AND brace_code='R0');

DO $$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n FROM loi_deferred_item WHERE clause_key='rent' AND brace_code='R0';
  IF v_n <> 1 THEN RAISE EXCEPTION 'R0 deferral not registered (found % rows)', v_n; END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
