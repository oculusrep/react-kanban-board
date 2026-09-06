-- Starbucks LOI Tool — landlord-fill sentinel + retired-vs-deferred availability
-- Created: September 6, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260905120000_loi_tool_template_paragraph_and_tranche8.sql
--
-- The library support behind Mike's two payload-contract amendments (2026-09-06). Both amendments
-- turn on a distinction the schema could not previously express.
--
--   A) "A token whose value is intentionally empty carries an EXPLICIT landlord-fill sentinel."
--      The acceptance test allows "zero unresolved brackets EXCEPT declared landlord-fill" — but
--      nothing DECLARED landlord-fill. Those params were plain 'fill', indistinguishable from the
--      ones the wizard is supposed to answer, so the exception had nothing to point at.
--
--   C) "If a deal's facts require a clause that is deferred, blocked, or not loaded, the run HALTS."
--      is_active=false previously meant only one thing. Retired (sale_of_property) must be stripped
--      SILENTLY; deferred (landlord_work) must HALT. Same flag, opposite required behaviour — so the
--      flag has to be split.

-- ============================================================================
-- 1. param_kind 'landlord_fill' + the render rule
-- ============================================================================
-- A landlord-fill param is one the LANDLORD completes by hand after we send the LOI: the acceptance
-- date, the landlord's signature/name/title, the tenants-in-common point of contact. OVIS must never
-- prompt for them and the assembler must never fail on them — they emit the template's blank rule.
--
-- WHY A FOURTH KIND rather than a boolean: param_kind already answers "how does this resolve", and
-- these resolve by a rule nobody supplies a value for. A boolean beside 'fill' would make two fields
-- answer one question, and every consumer would have to check both.
--
-- landlord_fill_render carries the EXACT underscore run from the template, so the emitted document is
-- byte-identical to what a hand-prepared LOI looks like. Verified against LOI_US_7_30_2026.docx
-- paras 15 and 229-235; widths differ per blank and are not guessable.

ALTER TABLE loi_body_parameter DROP CONSTRAINT IF EXISTS loi_body_parameter_param_kind_check;
ALTER TABLE loi_body_parameter ADD CONSTRAINT loi_body_parameter_param_kind_check
  CHECK (param_kind IN ('concession','choose_one','fill','landlord_fill'));

ALTER TABLE loi_body_parameter ADD COLUMN IF NOT EXISTS landlord_fill_render TEXT;

-- Present iff landlord_fill, and never empty: an empty render is exactly the "indistinguishable from
-- a bug" case Mike ruled out.
ALTER TABLE loi_body_parameter DROP CONSTRAINT IF EXISTS loi_body_parameter_landlord_fill_shape;
ALTER TABLE loi_body_parameter ADD CONSTRAINT loi_body_parameter_landlord_fill_shape
  CHECK (
    (param_kind = 'landlord_fill' AND landlord_fill_render IS NOT NULL AND landlord_fill_render <> '')
    OR (param_kind <> 'landlord_fill' AND landlord_fill_render IS NULL)
  );

COMMENT ON COLUMN loi_body_parameter.landlord_fill_render IS
  'The exact blank rule emitted for a landlord_fill param (verbatim underscore run from the template). The token counts as RESOLVED for the acceptance test.';

-- Extend the existing kind-shape CHECK: like 'fill', a landlord_fill carries no preferred/fallback
-- (nobody on our side supplies a value at all).
ALTER TABLE loi_body_parameter DROP CONSTRAINT IF EXISTS loi_body_parameter_kind_shape;
ALTER TABLE loi_body_parameter ADD CONSTRAINT loi_body_parameter_kind_shape CHECK (
  (param_kind = 'concession' AND preferred_value IS NOT NULL)
  OR (param_kind = 'choose_one'    AND preferred_value IS NULL AND fallback_value IS NULL)
  OR (param_kind = 'fill'          AND preferred_value IS NULL AND fallback_value IS NULL)
  OR (param_kind = 'landlord_fill' AND preferred_value IS NULL AND fallback_value IS NULL)
);

-- ...and the option-count rule: a landlord_fill must carry zero options, same as fill.
CREATE OR REPLACE FUNCTION loi_assert_body_parameter_options(v_param UUID) RETURNS void AS $$
DECLARE
  v_kind TEXT;
  v_count INTEGER;
BEGIN
  SELECT param_kind INTO v_kind FROM loi_body_parameter WHERE id = v_param;
  IF NOT FOUND THEN RETURN; END IF;

  SELECT count(*) INTO v_count FROM loi_body_parameter_option WHERE body_parameter_id = v_param;

  IF v_kind IN ('concession','fill','landlord_fill') AND v_count > 0 THEN
    RAISE EXCEPTION '% parameter % must not carry options', v_kind, v_param;
  ELSIF v_kind = 'choose_one' AND v_count < 2 THEN
    RAISE EXCEPTION 'choose_one parameter % must have >= 2 options (has %)', v_param, v_count;
  END IF;
END;
$$ LANGUAGE plpgsql;

-- Re-key the seven params Mike named. Their notes already said "LANDLORD COMPLETES" in prose; this
-- promotes that prose to the rigid spine. Renders are the template's own runs, verbatim.
UPDATE loi_body_parameter SET param_kind = 'landlord_fill', landlord_fill_render = v.render
  FROM (VALUES
    ('sig_day',              '______'),                          -- para 229 "this ______ day of"
    ('sig_month',            '_______________'),                 -- para 229 "day of _______________,"
    ('sig_year',             '_______'),                         -- para 229 ", 20_______."
    ('sig_ll_line',          '______________________________'),  -- para 232 signature rule
    ('sig_ll_name',          '_______________________'),         -- para 234 "Name:  "
    ('sig_ll_title',         '_______________________'),         -- para 235 "Title:  "
    ('tic_point_of_contact', '______')                           -- para 15 TIC add-on
  ) AS v(param_key, render)
 WHERE loi_body_parameter.param_key = v.param_key
   AND loi_body_parameter.param_kind = 'fill';

-- Load guard: all seven must have flipped, or the sentinel has holes exactly where the acceptance
-- test would stop catching them.
--
-- SCOPED TO THIS MIGRATION'S OWN PARAMS, not a library-wide count. The first cut asserted
-- "exactly 7 landlord_fill params exist", which was true the day it was written and false the moment
-- batch 2 added seven more — a guard that fails on a LATER migration's correct work. Same rule as the
-- tranche-10 post-condition: a guard asserts what its own change is responsible for.
DO $$
DECLARE v_missing TEXT;
BEGIN
  SELECT string_agg(k, ', ') INTO v_missing
    FROM (VALUES ('sig_day'),('sig_month'),('sig_year'),('sig_ll_line'),
                 ('sig_ll_name'),('sig_ll_title'),('tic_point_of_contact')) AS want(k)
   WHERE NOT EXISTS (SELECT 1 FROM loi_body_parameter bp
                      WHERE bp.param_key = want.k AND bp.param_kind = 'landlord_fill'
                        AND bp.landlord_fill_render IS NOT NULL);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'landlord_fill re-key: these params did not flip: %', v_missing;
  END IF;
END $$;

-- ============================================================================
-- 2. Retired vs deferred — same is_active, opposite required behaviour
-- ============================================================================
-- RETIRED  = we decided this never emits again (sale_of_property, superseded by Transfer). A deal
--            that would have used it is fine; the assembler strips and continues.
-- DEFERRED = the library does not YET carry this and we know it. A deal whose facts require it must
--            HALT — emitting a document with the section silently deleted is the failure Mike named:
--            it reaches a landlord looking clean.
ALTER TABLE loi_clause ADD COLUMN IF NOT EXISTS unavailable_kind TEXT;

ALTER TABLE loi_clause DROP CONSTRAINT IF EXISTS loi_clause_unavailable_kind_check;
ALTER TABLE loi_clause ADD CONSTRAINT loi_clause_unavailable_kind_check
  CHECK (unavailable_kind IS NULL OR unavailable_kind IN ('retired','deferred'));

COMMENT ON COLUMN loi_clause.unavailable_kind IS
  'retired = decided, assembler strips silently. deferred = library gap, assembler HALTS if a deal needs it.';

-- Backfill BEFORE tightening: sale_of_property was retired by the exclusion migration, when the
-- retired/deferred split did not exist yet.
UPDATE loi_clause SET unavailable_kind = 'retired'
 WHERE clause_key = 'sale_of_property' AND NOT is_active AND unavailable_kind IS NULL;

-- Tie it to is_active: an inactive clause must say WHICH kind; an active one must not carry either.
ALTER TABLE loi_clause DROP CONSTRAINT IF EXISTS loi_clause_inactive_shape;
ALTER TABLE loi_clause ADD CONSTRAINT loi_clause_inactive_shape
  CHECK (
    (is_active AND inactive_reason IS NULL AND unavailable_kind IS NULL)
    OR (NOT is_active AND inactive_reason IS NOT NULL AND unavailable_kind IS NOT NULL)
  );

-- Register landlord_work as a KNOWN DEFERRED clause. It has no positions and no bodies — the point
-- is exactly that it is absent — but OVIS cannot halt on a clause it has never heard of, and
-- "not loaded" is unrepresentable as silence.
INSERT INTO loi_clause (clause_key, title, bucket, description, is_active, inactive_reason, unavailable_kind)
SELECT 'landlord_work', 'Landlord Work / Landlord Contribution', 'coded-position',
       'DEFERRED, not retired. LCW0/1/2 are blocked on the assembler column-insert contract for the tab-delimited allowance tables (same blocker as R0/R1). No positions or bodies are loaded.',
       false,
       'Deferred: LCW base blocked on the rent/option column-insert contract. Registered so a deal requiring an allowance clause HALTS instead of emitting a document with the section silently deleted.',
       'deferred'
 WHERE NOT EXISTS (SELECT 1 FROM loi_clause WHERE clause_key = 'landlord_work');

-- The assembler's "may I proceed" question, in one place: every clause the library knows it cannot
-- supply. OVIS intersects this with the deal's required clauses and halts on any overlap.
CREATE OR REPLACE VIEW loi_deferred_clause AS
  SELECT clause_key, title, inactive_reason, bucket
    FROM loi_clause
   WHERE NOT is_active AND unavailable_kind = 'deferred';

GRANT SELECT ON loi_deferred_clause TO authenticated;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
