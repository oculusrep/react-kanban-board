-- Starbucks LOI Tool — register the rent schedule as a DEFERRED clause
-- Created: September 6, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260906130000_loi_tool_landlord_fill_cam_prorata.sql
--
-- Closes a live instance of the failure payload contract C was amended to prevent.
--
-- Checking whether regenerating Powder Springs would hit the deferred halt (Mike, 2026-09-06) turned
-- up an asymmetry:
--   * landlord_work IS registered (migration 20260906120000), so a deal needing LCW0 halts. Correct.
--   * The RENT SCHEDULE (R0/R1) was registered NOWHERE. There is no `rent` row in loi_clause at all —
--     the sweep manifest assigns paragraphs 36-47 and 49-61 to clause `rent`, but nothing in the
--     library ever declared it.
--
-- So OVIS could not halt on it, and under C the assembler would have STRIPPED the entire rent
-- schedule and shipped a clean-looking LOI with no rent table. That is exactly the "reaches a landlord
-- looking clean" failure, and it was one clause away from being live.
--
-- The earlier note deferring this ("R0/R1 are a position-level gap, register them with the
-- column-insert contract") was wrong on the sequencing: the halt has to exist BEFORE the assembler,
-- not alongside the work that lifts it. Registering the clause costs nothing and is reversible by the
-- same field update that will un-defer it.

INSERT INTO loi_clause (clause_key, title, bucket, description, is_active, inactive_reason, unavailable_kind)
SELECT 'rent', 'Rent Schedule', 'coded-position',
       'DEFERRED. R0 (flat schedule) and R1 (tied to square footage) are blocked on the assembler column-insert contract for the tab-delimited rent/option tables. No positions or bodies are loaded; the rent ENGINE exists (supabase/seeds/loi/rent_engine.py, Powder Springs byte-exact) and the end-cap table emission spike passed, but neither is wired to a clause yet.',
       false,
       'Deferred: R0/R1 blocked on the rent-table column-insert contract. Registered so a deal requiring a rent schedule HALTS instead of emitting an LOI with the rent table silently deleted. Powder Springs needs R1 (its table carries the Per Square Foot column), so the acceptance test halts here today.',
       'deferred'
 WHERE NOT EXISTS (SELECT 1 FROM loi_clause WHERE clause_key = 'rent');

-- Both known library gaps must now be discoverable, or the halt has a hole in it.
DO $$
DECLARE v_missing TEXT;
BEGIN
  SELECT string_agg(k, ', ') INTO v_missing
    FROM (VALUES ('rent'), ('landlord_work')) AS want(k)
   WHERE NOT EXISTS (SELECT 1 FROM loi_deferred_clause d WHERE d.clause_key = want.k);
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'deferred registry incomplete - missing: %', v_missing;
  END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
