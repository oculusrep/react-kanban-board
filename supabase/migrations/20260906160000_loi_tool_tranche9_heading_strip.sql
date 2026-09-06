-- Starbucks LOI Tool — tranche-9 supersession: re-point positions to the heading-stripped bodies
-- Created: September 6, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260906150000_loi_tool_etr_attribution.sql
-- Run AFTER loading supabase/seeds/loi/loi_seed_tranche9.json (which inserts the v2 bodies).
--
-- Contract B rule 4: headings are TEMPLATE-OWNED. The assembler preserves the template's heading run
-- and replaces only the content after it, exactly as it strips the [{CODE}] marker run. Three of 98
-- loaded bodies embedded their heading and would have emitted a DUPLICATE heading.
--
-- Canonical bodies are immutable, so the fix is a new version, not an UPDATE. Tranche 9 loads the v2
-- bodies; this re-points the positions at them and deletes the v1 originals. RE-POINT, not
-- delete-then-relink: tranche 9 declares no clauses, so nothing would re-attach the v2 bodies and they
-- would land as orphans, which rule 4 would (correctly) fail on.
--
-- audit_right/main carries a SECOND fix in v2: template para 212 has TWO blanks and only one was
-- keyed. The raw '__' is now {{param:audit_blank_1}} — the same param, because it is one developer
-- return rate used twice in one formula (verified: Powder Springs fills both 'seven percent (7%)').
-- And the value-dependent article moved to its own param: 'a seven percent (7%)' but 'an eight
-- percent (8%)', while the SECOND position takes no article at all.
--
-- TARGETING: trash_recycling has FOUR bodies with segment_key 'main' — the uncoded base plus
-- TR0/TR1/TR2. Only the UNCODED BASE embeds a heading. Target by NULL brace_code, never by
-- segment_key alone. early_termination/placeholder and /termination_fee are untouched.

-- AMBIGUITY WARNING, learned the hard way: all three v2 bodies share brace_code NULL and segment_key
-- 'main', so resolving the NEW body by (brace_code, segment_key, version) alone matches three rows and
-- SELECT ... INTO silently takes an arbitrary one. The first cut of this migration did exactly that
-- and re-pointed all three positions at the audit_right text. Each row therefore carries a distinct
-- body_text prefix, and the count is asserted to be exactly 1 before anything is written.
--
-- The re-point is driven off the POSITION'S CLAUSE rather than off the old body id, which makes this
-- self-repairing: it converges whether the positions currently point at the v1 body or at a wrong v2.

DO $$
DECLARE
  r RECORD;
  v_new UUID;
  v_n INT;
  v_moved INT;
  v_total INT := 0;
BEGIN
  FOR r IN
    SELECT * FROM (VALUES
      ('audit_right',       'main', 'Tenant shall have the right to inspect and audit%'),
      ('early_termination', 'main', 'Upon giving Landlord at least one hundred%'),
      ('trash_recycling',   'main', 'In accordance with the attached Landlord Workletter%')
    ) AS t(clause_key, segment_key, text_prefix)
  LOOP
    -- (no min(uuid) in Postgres; count and id are taken separately)
    SELECT count(*) INTO v_n
      FROM loi_canonical_body cb
     WHERE cb.brace_code IS NULL AND cb.segment_key = r.segment_key
       AND cb.version = 'v2' AND cb.source = 'national-template-drop'
       AND cb.body_text LIKE r.text_prefix;
    SELECT cb.id INTO v_new
      FROM loi_canonical_body cb
     WHERE cb.brace_code IS NULL AND cb.segment_key = r.segment_key
       AND cb.version = 'v2' AND cb.source = 'national-template-drop'
       AND cb.body_text LIKE r.text_prefix
     LIMIT 1;

    IF v_n = 0 THEN
      RAISE EXCEPTION 'tranche-9: no v2 body for %/% — load loi_seed_tranche9.json first',
                      r.clause_key, r.segment_key;
    ELSIF v_n > 1 THEN
      RAISE EXCEPTION 'tranche-9: % v2 bodies match %/% — prefix is not discriminating',
                      v_n, r.clause_key, r.segment_key;
    END IF;

    -- Re-point every position of THIS clause that still references an uncoded body of this
    -- segment_key (v1 original, or a wrong v2 from the ambiguous first cut).
    UPDATE loi_position_body pb
       SET canonical_body_id = v_new
      FROM loi_position p, loi_variant v, loi_clause c, loi_canonical_body old
     WHERE pb.position_id = p.id AND p.variant_id = v.id AND v.clause_id = c.id
       AND old.id = pb.canonical_body_id
       AND c.clause_key = r.clause_key
       AND old.brace_code IS NULL AND old.segment_key = r.segment_key
       AND pb.canonical_body_id <> v_new;
    GET DIAGNOSTICS v_moved = ROW_COUNT;
    v_total := v_total + v_moved;

    -- Drop the v1 original once nothing references it (params cascade).
    DELETE FROM loi_canonical_body cb
     WHERE cb.brace_code IS NULL AND cb.segment_key = r.segment_key
       AND cb.version = 'v1' AND cb.source = 'national-template-drop'
       AND cb.body_text LIKE r.text_prefix
       AND NOT EXISTS (SELECT 1 FROM loi_position_body pb WHERE pb.canonical_body_id = cb.id);

    RAISE NOTICE 'tranche-9: %/% re-pointed % row(s) to v2', r.clause_key, r.segment_key, v_moved;
  END LOOP;
  RAISE NOTICE 'tranche-9: % position_body row(s) re-pointed in total', v_total;
END $$;

-- Guards. The whole point of the tranche is that no body carries a heading and no raw blank survives.
DO $$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(coalesce(cb.brace_code,'-') || '/' || cb.segment_key, ', ') INTO v_bad
    FROM loi_canonical_body cb
   WHERE cb.body_text ~ '^[A-Z][A-Z /''&-]{3,}:';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'bodies still embed a heading (contract B rule 4): %', v_bad;
  END IF;

  -- The raw '__' blank audit_right shipped with. Underscores inside {{param:...}} keys are fine, so
  -- strip whole tokens before looking.
  SELECT string_agg(coalesce(cb.brace_code,'-') || '/' || cb.segment_key, ', ') INTO v_bad
    FROM loi_canonical_body cb
   -- NB: regex match, NOT LIKE — in LIKE, '_' is a single-character WILDCARD and would match every
   -- body. Underscores inside {{param:...}} keys are legitimate, so strip whole tokens first.
   WHERE regexp_replace(cb.body_text, '\{\{param:[a-zA-Z0-9_]+\}\}', '', 'g') ~ '_';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'bodies still carry a raw underscore blank outside a token: %', v_bad;
  END IF;

  -- Nothing orphaned by the swap: every v2 body must be reachable from a position.
  SELECT string_agg(cb.segment_key, ', ') INTO v_bad
    FROM loi_canonical_body cb
   WHERE cb.version = 'v2' AND cb.segment_key IN ('main')
     AND NOT EXISTS (SELECT 1 FROM loi_position_body pb WHERE pb.canonical_body_id = cb.id);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'tranche-9 left orphaned v2 bodies: %', v_bad;
  END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
