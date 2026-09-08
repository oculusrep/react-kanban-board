-- Starbucks LOI Tool — landlord_work goes ACTIVE (tranche 14 loaded)
-- Created: September 7, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260906220000_loi_tool_r1_position.sql
-- Run AFTER loading supabase/seeds/loi/loi_seed_tranche14.json.
--
-- LCW0/LCW1/LCW2 are loaded, so the clause-level deferral lifts. Unlike `rent`, NOTHING remains
-- deferred here: all three rungs are keyed. `rent` still carries a position-level R0 deferral because
-- R0's render shape has no artifact; landlord_work has no such gap.
--
-- LCW1 is keyed despite the Aug 2026 handbook dropping it. Standing rule: body text comes from the
-- TEMPLATE, and one source dropping a clause is not the retirement signal -- template AND handbook
-- both dropping it is. Its provisional_note records the discrepancy, and the >=$200,000
-- letter-of-credit standard it implements survives in the Aug 2026 RENT/TIA section, so the deletion
-- removed no protection.

UPDATE loi_clause
   SET is_active = true, inactive_reason = NULL, unavailable_kind = NULL
 WHERE clause_key = 'landlord_work' AND NOT is_active;

DO $$
DECLARE v_n INT;
BEGIN
  SELECT count(*) INTO v_n FROM loi_selectable_position WHERE clause_key = 'landlord_work';
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'expected 4 selectable landlord_work positions (LCW0/1/2 + security), found %', v_n;
  END IF;

  -- The security sentence must SHARE LCW1's paragraph, or the two emit as separate paragraphs.
  IF NOT EXISTS (
    SELECT 1 FROM loi_position p
      JOIN loi_variant v ON v.id = p.variant_id
      JOIN loi_clause  c ON c.id = v.clause_id
     WHERE c.clause_key = 'landlord_work' AND p.position_kind = 'modifier'
       AND p.template_paragraph = (SELECT p2.template_paragraph FROM loi_position p2
                                     JOIN loi_variant v2 ON v2.id = p2.variant_id
                                     JOIN loi_clause c2 ON c2.id = v2.clause_id
                                    WHERE c2.clause_key = 'landlord_work' AND p2.brace_code = 'LCW1')
  ) THEN
    RAISE EXCEPTION 'the security modifier does not share LCW1 template_paragraph - they would emit as two paragraphs';
  END IF;

  -- landlord_work must no longer appear as a gap at EITHER granularity.
  SELECT count(*) INTO v_n FROM loi_deferred_item WHERE clause_key = 'landlord_work';
  IF v_n <> 0 THEN
    RAISE EXCEPTION 'landlord_work still registered deferred (% rows)', v_n;
  END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
