-- Starbucks LOI Tool — the R1 position, and `rent` goes active with R0 still declared
-- Created: September 6, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260906210000_loi_tool_deferred_position.sql
-- Run AFTER loading supabase/seeds/loi/loi_seed_tranche13.json (which inserts the R1 body).
--
-- Tranche 13 carries body text only, by design — position structure is not body text. This builds it.
--
-- SHAPE: A SELECTOR, NOT A RANKED LADDER. R0 ("rent is a set annual amount") and R1 ("rent tied to
-- square footage") are not a preference ladder — neither is "better", and nobody negotiates from one
-- to the other. Which applies is a DEAL FACT, the same shape the CAM incident resolved: `building_type`
-- was retired as a ranked guess and `cam_basis` introduced as a selector once the real axis was
-- understood. The rent engine already carries this fact as `Terms.measurement_basis`, so the selector
-- is named for it.
--
-- R0 IS NOT LOADED, and the exhaustive-partition rule would normally reject a variant that covers only
-- part of a selector's domain. The variant subdomain mechanism exists for exactly this — the ECDT CAM
-- variant declares {nn_multi_tenant} and is valid with CAM0 alone. Here the end-cap variant declares
-- {per_sqft} and is valid with R1 alone. When a filled R0 artifact turns up, R0 arrives in its own
-- variant declaring {annual}; no re-ranking, no re-keying of R1.

-- STRUCTURE LIVES IN THE SEED, NOT HERE. The first cut built the selector, variant and position in
-- this migration; that made `completeness_test.py` fail, because its seed inventory reads the tranche
-- files and cannot see structure a migration created — para 61 resolved to "clause 'rent' not loaded
-- in any tranche". The division that actually holds: SEEDS own structure, MIGRATIONS own state
-- transitions the seeds cannot express. So the selector, the rent_ecdt variant and the R1 position are
-- in loi_seed_tranche13.json (added by Claude Code — Mike sent body text only, by design), and this
-- migration does only the activation below.
--
-- It also needed a loader fix: a `_topup` clause could resolve an existing variant but not CREATE one,
-- and `rent` was registered deferred with no variant at all. Positions were being emitted with a NULL
-- variant_id, caught only by the NOT NULL constraint.

-- ---- 3. `rent` goes ACTIVE — and R0 must NOT go silently absent -----------------------------------
-- This is the flip test P3 simulated. The clause has to go active or R1 can never be selected; R0's
-- declaration lives in loi_deferred_position precisely so that activating the clause cannot erase it.
UPDATE loi_clause
   SET is_active = true, inactive_reason = NULL, unavailable_kind = NULL
 WHERE clause_key = 'rent' AND NOT is_active;

DO $$
DECLARE v_n INT;
BEGIN
  -- R1 selectable...
  SELECT count(*) INTO v_n FROM loi_selectable_position WHERE clause_key = 'rent' AND brace_code = 'R1';
  IF v_n <> 1 THEN RAISE EXCEPTION 'R1 is not selectable after activation (found %)', v_n; END IF;

  -- ...and R0 STILL declared. If this ever fails, an R0 deal silently emits without a rent schedule.
  SELECT count(*) INTO v_n FROM loi_deferred_item WHERE clause_key = 'rent' AND brace_code = 'R0';
  IF v_n <> 1 THEN RAISE EXCEPTION 'R0 deferral lost when rent went active (found %) - this is the exact failure P3 guards', v_n; END IF;

  -- The remeasurement note is the position's only body.
  SELECT count(*) INTO v_n
    FROM loi_position_body pb
    JOIN loi_position p ON p.id = pb.position_id
   WHERE p.brace_code = 'R1';
  IF v_n <> 1 THEN RAISE EXCEPTION 'R1 must carry exactly one body, found %', v_n; END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
