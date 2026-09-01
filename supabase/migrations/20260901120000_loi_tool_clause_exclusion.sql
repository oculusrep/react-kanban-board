-- Starbucks LOI Tool — clause/position exclusion + library de-activation
-- Created: September 1, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260831150000_loi_tool_tranche6_restructure.sql (and the tranche 6/7 loads)
--
-- Closes the modeling gap recorded in docs/STARBUCKS_LOI_TOOL_DECISIONS.md ("Clause supersession +
-- loi_clause_exclusion"): the schema could express "modifier requires position" (applies_when
-- position_selection) and "alternatives are mutually exclusive within a variant" (rank / selector
-- partition), but NOT "these two independently selectable things are substitutes and must never both
-- emit." Nothing stopped a deal selecting both Transfer of the Property and Sale of Property —
-- exactly what the Powder Springs LOI did.
--
-- Two things ship here:
--   1. loi_clause_exclusion — pairwise exclusion, ENFORCED AT ASSEMBLY (not by a DB constraint; the
--      library is legal, a particular SELECTION is what can be illegal).
--   2. is_active / inactive_reason on loi_clause + loi_position — de-activate library content without
--      deleting it. Canonical body text is immutable and must be RETAINED for provenance and for
--      Phase-2 redline matching (Phase 2 has to recognise a superseded clause if a landlord proposes
--      it), so "retire" can never mean "delete".
--
-- SCOPE (Mike, 2026-09-01): TWO exclusions, not three.
--   * transfer_of_property SUPERSEDES sale_of_property — confirmed. The national template carries
--     TRANSFER OF THE PROPERTY only. Douglasville emits TRANSFER; Powder Springs emits SALE OF
--     PROPERTY. sale_of_property is de-activated here.
--   * The pylon-panel pair is MUTUALLY EXCLUSIVE — confirmed. "PANEL ON EXISTING pylon or monument"
--     vs "PANEL ON to-be-constructed pylon or monument": they differ on who pays fabrication and
--     installation, and the second adds a Landlord construction obligation. A pylon either exists or
--     it does not. (Powder Springs used the to-be-constructed variant.)
--   * ROFR vs ROFO is NOT an exclusion and is deliberately NOT built. ROFO appears nowhere in the
--     template or either send; ROFR appears only in Douglasville, where it sits ADJACENT TO Transfer
--     of the Property with BOTH emitted. They are companions, not alternatives.
--
-- Additive only. Internal-only data: RLS = public.is_internal_user() full access.

-- ============================================================================
-- 1. is_active / inactive_reason — retire library content without deleting it
-- ============================================================================
-- Two levels, because retirement happens at both: a whole clause can be superseded (sale_of_property),
-- or a single position within a live clause can be retired while its siblings keep emitting.
-- ASSEMBLER CONTRACT: a position is selectable only when BOTH its own is_active AND its clause's
-- is_active are true. Use the loi_selectable_position view below rather than re-deriving that join.

ALTER TABLE loi_clause   ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE loi_clause   ADD COLUMN IF NOT EXISTS inactive_reason TEXT;
ALTER TABLE loi_position ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE loi_position ADD COLUMN IF NOT EXISTS inactive_reason TEXT;

-- De-activation always carries its reason (this is an audit record, not a feature flag).
ALTER TABLE loi_clause DROP CONSTRAINT IF EXISTS loi_clause_inactive_shape;
ALTER TABLE loi_clause ADD CONSTRAINT loi_clause_inactive_shape
  CHECK (is_active OR inactive_reason IS NOT NULL);

ALTER TABLE loi_position DROP CONSTRAINT IF EXISTS loi_position_inactive_shape;
ALTER TABLE loi_position ADD CONSTRAINT loi_position_inactive_shape
  CHECK (is_active OR inactive_reason IS NOT NULL);

CREATE INDEX IF NOT EXISTS idx_loi_clause_inactive   ON loi_clause(clause_key) WHERE NOT is_active;
CREATE INDEX IF NOT EXISTS idx_loi_position_inactive ON loi_position(variant_id) WHERE NOT is_active;

COMMENT ON COLUMN loi_clause.is_active IS
  'False = retired from assembly. Content is RETAINED (immutable bodies, provenance, Phase-2 redline matching), it just never emits.';
COMMENT ON COLUMN loi_position.is_active IS
  'False = never offered or emitted by the assembler. Retained for provenance and Phase-2 redline matching.';

-- ============================================================================
-- 2. LOI_CLAUSE_EXCLUSION — pairwise "these must not both emit"
-- ============================================================================
-- Members are HOMOGENEOUS: a pair is clause-vs-clause or position-vs-position, never mixed. Both
-- confirmed members are homogeneous, and a mixed pair has no coherent meaning ("this clause excludes
-- that one position of itself" is an applies_when gate, not an exclusion).
--
-- Direction is carried by the A/B ordering plus exclusion_kind:
--   'supersedes'         — A supersedes B. Deterministic: if both are selected, B is DROPPED.
--   'mutually-exclusive' — no winner. A deal FACT decides which one is right (a pylon either exists
--                          or it doesn't), so the assembler HALTS on a conflict rather than guessing.
--
-- Typed FK columns rather than a polymorphic id, per the rigid-spine rule and the shape already used
-- by loi_negotiable_item.

CREATE TABLE IF NOT EXISTS loi_clause_exclusion (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  exclusion_key TEXT NOT NULL UNIQUE,   -- stable semantic id, e.g. 'transfer_supersedes_sale'

  member_kind TEXT NOT NULL
    CHECK (member_kind IN ('clause','position')),
  exclusion_kind TEXT NOT NULL
    CHECK (exclusion_kind IN ('supersedes','mutually-exclusive')),

  a_clause_id   UUID REFERENCES loi_clause(id)   ON DELETE CASCADE,
  a_position_id UUID REFERENCES loi_position(id) ON DELETE CASCADE,
  b_clause_id   UUID REFERENCES loi_clause(id)   ON DELETE CASCADE,
  b_position_id UUID REFERENCES loi_position(id) ON DELETE CASCADE,

  -- Prose / soft edges — NEVER emitted into a document.
  reason TEXT NOT NULL,      -- why they are substitutes (the standing decision, in one paragraph)
  internal_note TEXT,

  created_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),

  -- Homogeneous pair, both sides present, matching member_kind.
  CONSTRAINT loi_clause_exclusion_member_shape CHECK (
    (member_kind = 'clause'
       AND a_clause_id IS NOT NULL AND b_clause_id IS NOT NULL
       AND a_position_id IS NULL AND b_position_id IS NULL)
    OR
    (member_kind = 'position'
       AND a_position_id IS NOT NULL AND b_position_id IS NOT NULL
       AND a_clause_id IS NULL AND b_clause_id IS NULL)
  ),

  -- Nothing excludes itself.
  CONSTRAINT loi_clause_exclusion_distinct CHECK (
    COALESCE(a_clause_id, a_position_id) <> COALESCE(b_clause_id, b_position_id)
  )
);

-- One relationship per unordered pair: (A,B) and (B,A) are the same fact and must not both exist
-- (a reversed duplicate would let a 'supersedes' row silently disagree with itself about the winner).
CREATE UNIQUE INDEX IF NOT EXISTS loi_clause_exclusion_pair_uk ON loi_clause_exclusion (
  LEAST(   COALESCE(a_clause_id, a_position_id), COALESCE(b_clause_id, b_position_id)),
  GREATEST(COALESCE(a_clause_id, a_position_id), COALESCE(b_clause_id, b_position_id))
);

CREATE INDEX IF NOT EXISTS idx_loi_clause_exclusion_a_clause   ON loi_clause_exclusion(a_clause_id);
CREATE INDEX IF NOT EXISTS idx_loi_clause_exclusion_b_clause   ON loi_clause_exclusion(b_clause_id);
CREATE INDEX IF NOT EXISTS idx_loi_clause_exclusion_a_position ON loi_clause_exclusion(a_position_id);
CREATE INDEX IF NOT EXISTS idx_loi_clause_exclusion_b_position ON loi_clause_exclusion(b_position_id);

COMMENT ON TABLE loi_clause_exclusion IS
  'Pairwise "must not both emit" between two clauses or two positions. Enforced at ASSEMBLY via loi_exclusion_violations(), not by a DB constraint.';
COMMENT ON COLUMN loi_clause_exclusion.exclusion_kind IS
  'supersedes = A wins, drop B deterministically. mutually-exclusive = no winner, assembler halts and a deal fact decides.';

ALTER TABLE loi_clause_exclusion ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "loi_clause_exclusion_internal_all" ON loi_clause_exclusion;
CREATE POLICY "loi_clause_exclusion_internal_all" ON loi_clause_exclusion FOR ALL TO authenticated
  USING (public.is_internal_user()) WITH CHECK (public.is_internal_user());
GRANT SELECT, INSERT, UPDATE, DELETE ON loi_clause_exclusion TO authenticated;

DROP TRIGGER IF EXISTS update_loi_clause_exclusion_updated_at ON loi_clause_exclusion;
CREATE TRIGGER update_loi_clause_exclusion_updated_at BEFORE UPDATE ON loi_clause_exclusion
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- 3. Assembler-facing helpers
-- ============================================================================

-- Human handle for a position: 'clause_key:BRACE_CODE', falling back to the first body's segment_key
-- for uncoded positions (the pylon-panel pair is uncoded, so brace_code alone can't name it).
CREATE OR REPLACE FUNCTION loi_position_label(p_position_id UUID)
RETURNS TEXT
LANGUAGE sql STABLE AS $$
  SELECT c.clause_key || ':' || COALESCE(
           p.brace_code,
           (SELECT cb.segment_key
              FROM loi_position_body pb
              JOIN loi_canonical_body cb ON cb.id = pb.canonical_body_id
             WHERE pb.position_id = p.id
             ORDER BY pb.emit_sequence
             LIMIT 1),
           '(uncoded)')
    FROM loi_position p
    JOIN loi_variant v ON v.id = p.variant_id
    JOIN loi_clause  c ON c.id = v.clause_id
   WHERE p.id = p_position_id;
$$;

-- The assembler's selectable set: BOTH levels of is_active, in one place, so no caller re-derives it.
CREATE OR REPLACE VIEW loi_selectable_position AS
  SELECT p.*, v.clause_id, c.clause_key, v.variant_key
    FROM loi_position p
    JOIN loi_variant v ON v.id = p.variant_id
    JOIN loi_clause  c ON c.id = v.clause_id
   WHERE p.is_active AND c.is_active;

-- Readable catalogue of the standing exclusions (audit / review, not assembly).
CREATE OR REPLACE VIEW loi_exclusion_catalog AS
  SELECT e.exclusion_key,
         e.member_kind,
         e.exclusion_kind,
         COALESCE(ac.clause_key, loi_position_label(e.a_position_id)) AS a_label,
         COALESCE(bc.clause_key, loi_position_label(e.b_position_id)) AS b_label,
         e.reason,
         e.internal_note
    FROM loi_clause_exclusion e
    LEFT JOIN loi_clause ac ON ac.id = e.a_clause_id
    LEFT JOIN loi_clause bc ON bc.id = e.b_clause_id;

-- ENFORCEMENT POINT. Given the positions a deal has selected, return every exclusion the selection
-- violates. A clause-level exclusion resolves down to the exact positions in play, so the caller is
-- always told which position to drop (never just "some clause conflicts").
--   resolution = 'drop-b'  -> drop_position_id is the position to remove; assembly continues.
--   resolution = 'halt'    -> drop_position_id is NULL; assembly must stop and ask.
CREATE OR REPLACE FUNCTION loi_exclusion_violations(p_position_ids UUID[])
RETURNS TABLE (
  exclusion_key TEXT,
  exclusion_kind TEXT,
  member_kind TEXT,
  a_position_id UUID,
  b_position_id UUID,
  a_label TEXT,
  b_label TEXT,
  drop_position_id UUID,
  resolution TEXT,
  reason TEXT
)
LANGUAGE sql STABLE AS $$
  WITH sel AS (
    SELECT p.id AS position_id, v.clause_id
      FROM loi_position p
      JOIN loi_variant v ON v.id = p.variant_id
     WHERE p.id = ANY(p_position_ids)
  ),
  hits AS (
    -- clause-level: both clauses represented in the selection (resolved to the selected positions)
    SELECT e.exclusion_key, e.exclusion_kind, e.member_kind,
           sa.position_id AS a_pos, sb.position_id AS b_pos, e.reason
      FROM loi_clause_exclusion e
      JOIN sel sa ON sa.clause_id = e.a_clause_id
      JOIN sel sb ON sb.clause_id = e.b_clause_id
     WHERE e.member_kind = 'clause'
    UNION ALL
    -- position-level: both positions selected outright
    SELECT e.exclusion_key, e.exclusion_kind, e.member_kind,
           e.a_position_id, e.b_position_id, e.reason
      FROM loi_clause_exclusion e
     WHERE e.member_kind = 'position'
       AND e.a_position_id = ANY(p_position_ids)
       AND e.b_position_id = ANY(p_position_ids)
  )
  SELECT h.exclusion_key,
         h.exclusion_kind,
         h.member_kind,
         h.a_pos,
         h.b_pos,
         loi_position_label(h.a_pos),
         loi_position_label(h.b_pos),
         CASE WHEN h.exclusion_kind = 'supersedes' THEN h.b_pos END,
         CASE WHEN h.exclusion_kind = 'supersedes' THEN 'drop-b' ELSE 'halt' END,
         h.reason
    FROM hits h;
$$;

GRANT EXECUTE ON FUNCTION loi_position_label(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION loi_exclusion_violations(UUID[]) TO authenticated;
GRANT SELECT ON loi_selectable_position TO authenticated;
GRANT SELECT ON loi_exclusion_catalog TO authenticated;

-- ============================================================================
-- 4. DATA — the two confirmed exclusions + the sale_of_property retirement
--    Replayable: guarded on current state, keyed by stable semantic handles.
-- ============================================================================

-- ---- 4a. Transfer of the Property SUPERSEDES Sale of Property -------------------------------------
INSERT INTO loi_clause_exclusion (exclusion_key, member_kind, exclusion_kind, a_clause_id, b_clause_id, reason, internal_note)
SELECT 'transfer_supersedes_sale', 'clause', 'supersedes', t.id, s.id,
       'Transfer of the Property (2026 national drop, para 196) is strictly stronger than Sale of Property (Southeast, para 301): a later trigger (Rent Commencement follows delivery and acceptance), three conditions rather than two, a 30-day tail Sale lacks, and broader conduct ("sell, transfer, or assign the property" vs "transfer its interest in this lease"). Carrying both is a liability rather than extra coverage - two clauses governing the same conduct under different triggers hand the landlord''s counsel a conflict to argue.',
       'The national template carries TRANSFER OF THE PROPERTY only. Douglasville emits TRANSFER; Powder Springs emits SALE OF PROPERTY and is a historical artifact, not a pattern. Deal-type independent - the supersession holds for freestanding too.'
  FROM loi_clause t, loi_clause s
 WHERE t.clause_key = 'transfer_of_property' AND s.clause_key = 'sale_of_property'
ON CONFLICT (exclusion_key) DO NOTHING;

-- Retire sale_of_property: clause + every position it owns. Bodies are untouched (immutable, and
-- Phase 2 must still recognise this text if a landlord proposes it).
UPDATE loi_clause
   SET is_active = false,
       inactive_reason = 'Superseded by Transfer of the Property (see loi_clause_exclusion.transfer_supersedes_sale). Body text retained for provenance and Phase-2 redline matching.'
 WHERE clause_key = 'sale_of_property' AND is_active;

UPDATE loi_position p
   SET is_active = false,
       inactive_reason = 'Clause retired: superseded by Transfer of the Property.',
       deviation_rationale = COALESCE(p.deviation_rationale, 'Superseded by Transfer of the Property.')
  FROM loi_variant v, loi_clause c
 WHERE p.variant_id = v.id AND v.clause_id = c.id
   AND c.clause_key = 'sale_of_property' AND p.is_active;

-- ---- 4b. Pylon panel: EXISTING vs TO-BE-CONSTRUCTED are mutually exclusive ------------------------
-- Both are uncoded modifiers riding the signage clause, identified by their body's segment_key.
INSERT INTO loi_clause_exclusion (exclusion_key, member_kind, exclusion_kind, a_position_id, b_position_id, reason, internal_note)
SELECT 'pylon_panel_existing_xor_new', 'position', 'mutually-exclusive', pe.id, pn.id,
       'The two template signage add-ons - a panel on an EXISTING pylon or monument, and a panel on a TO-BE-CONSTRUCTED pylon or monument - are alternatives, not companions. They allocate fabrication and installation cost differently, and the to-be-constructed variant additionally imposes a Landlord construction obligation. A pylon either already exists or it does not, so exactly one can be true of a site.',
       'Deal fact decides, so there is no standing winner and the assembler halts rather than picking. Powder Springs used the to-be-constructed variant.'
  FROM (SELECT p.id
          FROM loi_position p
          JOIN loi_variant v ON v.id = p.variant_id
          JOIN loi_clause  c ON c.id = v.clause_id
          JOIN loi_position_body pb ON pb.position_id = p.id
          JOIN loi_canonical_body cb ON cb.id = pb.canonical_body_id
         WHERE c.clause_key = 'signage' AND cb.segment_key = 'panel_existing_pylon') pe,
       (SELECT p.id
          FROM loi_position p
          JOIN loi_variant v ON v.id = p.variant_id
          JOIN loi_clause  c ON c.id = v.clause_id
          JOIN loi_position_body pb ON pb.position_id = p.id
          JOIN loi_canonical_body cb ON cb.id = pb.canonical_body_id
         WHERE c.clause_key = 'signage' AND cb.segment_key = 'panel_new_pylon') pn
ON CONFLICT (exclusion_key) DO NOTHING;

-- Load guard: both exclusions must exist after this migration. A silently-skipped INSERT (renamed
-- clause_key, missing segment_key) would leave the assembler unguarded, which is the whole point.
DO $$
DECLARE v_missing TEXT;
BEGIN
  SELECT string_agg(k, ', ') INTO v_missing
    FROM (VALUES ('transfer_supersedes_sale'), ('pylon_panel_existing_xor_new')) AS want(k)
   WHERE NOT EXISTS (SELECT 1 FROM loi_clause_exclusion e WHERE e.exclusion_key = want.k);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'loi_clause_exclusion load failed - missing: %', v_missing;
  END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
