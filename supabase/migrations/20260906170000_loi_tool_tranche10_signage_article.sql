-- Starbucks LOI Tool — tranche-10 supersession: pylon-panel article + nested option token
-- Created: September 6, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260906160000_loi_tool_tranche9_heading_strip.sql
-- Run AFTER loading supabase/seeds/loi/loi_seed_tranche10.json.
--
-- Two fixes to both pylon-panel bodies, found by the standing scans rather than by anyone reading:
--   1. ARTICLE: "to install a {{dimensions}} sign panel" is value-dependent — "a 4' x 8'" but
--      "an 8' x 4'". Now its own choose_one {a, an}, first position only, mirroring audit_article.
--   2. RAW BLANK INSIDE A CHOOSE_ONE OPTION: "__________ position from the top" would have emitted
--      an unfilled line the first time that option was chosen. Now a NESTED TOKEN
--      ({{param:sign_*_position_ordinal}}), per the option-templating ruling.
--
-- OPTION-TEMPLATING (ruled 2026-09-06): an option_value may carry {{param:...}} tokens, substituted
-- exactly as body text is, because a chosen option emits exactly as body text does. One level deep
-- only. The rejected alternatives: a sibling fill gated on the option (gating is position-level — the
-- wrong granularity), and collapsing to a plain fill (loses the closed domain, which is a real choice
-- between "top position" and "Nth position from the top").
--
-- Unlike tranche 9, the two v2 bodies have DISTINCT segment_keys, so the ambiguity that bit that
-- migration cannot arise here — the count is still asserted rather than assumed.

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
      ('signage', 'panel_existing_pylon'),
      ('signage', 'panel_new_pylon')
    ) AS t(clause_key, segment_key)
  LOOP
    SELECT count(*) INTO v_n FROM loi_canonical_body cb
     WHERE cb.brace_code IS NULL AND cb.segment_key = r.segment_key
       AND cb.version = 'v2' AND cb.source = 'national-template-drop';
    IF v_n <> 1 THEN
      RAISE EXCEPTION 'tranche-10: expected exactly 1 v2 body for %, found % — load loi_seed_tranche10.json first',
                      r.segment_key, v_n;
    END IF;
    SELECT cb.id INTO v_new FROM loi_canonical_body cb
     WHERE cb.brace_code IS NULL AND cb.segment_key = r.segment_key
       AND cb.version = 'v2' AND cb.source = 'national-template-drop';

    -- Driven off the POSITION'S CLAUSE, so it converges from either the v1 state or a partial run.
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

    DELETE FROM loi_canonical_body cb
     WHERE cb.brace_code IS NULL AND cb.segment_key = r.segment_key
       AND cb.version = 'v1' AND cb.source = 'national-template-drop'
       AND NOT EXISTS (SELECT 1 FROM loi_position_body pb WHERE pb.canonical_body_id = cb.id);

    RAISE NOTICE 'tranche-10: %/% re-pointed % row(s) to v2', r.clause_key, r.segment_key, v_moved;
  END LOOP;
  RAISE NOTICE 'tranche-10: % position_body row(s) re-pointed in total', v_total;
END $$;

DO $$
DECLARE v_bad TEXT;
BEGIN
  -- SCOPED TO THIS MIGRATION'S BODIES, deliberately. The first cut asserted library-wide and failed
  -- on three KNOWN, unrelated defects awaiting their own tranche (initial_cotenancy_optional_2,
  -- utilities_optional_1, eu_remedy). A migration guard must assert what THIS migration is
  -- responsible for; a library-wide invariant belongs in the standing per-tranche scan in
  -- load_seed.py, which is where those three are already reported. Otherwise every future migration
  -- fails on somebody else's outstanding work and the guards get disabled wholesale.
  --
  -- Tokens are stripped first (their keys contain underscores legitimately). NB regex match, not
  -- LIKE — '_' is a single-character wildcard in LIKE and would match every row.
  SELECT string_agg(x, ', ') INTO v_bad FROM (
    SELECT cb.segment_key AS x
      FROM loi_canonical_body cb
     WHERE cb.segment_key IN ('panel_existing_pylon','panel_new_pylon')
       AND regexp_replace(cb.body_text, '\{\{param:[a-zA-Z0-9_]+\}\}', '', 'g') ~ '_'
    UNION
    SELECT cb.segment_key || ' option ' || bp.param_key
      FROM loi_body_parameter_option o
      JOIN loi_body_parameter bp ON bp.id = o.body_parameter_id
      JOIN loi_canonical_body cb ON cb.id = bp.canonical_body_id
     WHERE cb.segment_key IN ('panel_existing_pylon','panel_new_pylon')
       AND regexp_replace(o.option_value, '\{\{param:[a-zA-Z0-9_]+\}\}', '', 'g') ~ '_'
  ) t;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'raw underscore blanks remain in the pylon-panel bodies: %', v_bad;
  END IF;

  SELECT string_agg(cb.segment_key, ', ') INTO v_bad
    FROM loi_canonical_body cb
   WHERE cb.segment_key IN ('panel_existing_pylon','panel_new_pylon')
     AND NOT EXISTS (SELECT 1 FROM loi_position_body pb WHERE pb.canonical_body_id = cb.id);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'tranche-10 left orphaned bodies: %', v_bad;
  END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
