-- Starbucks LOI Tool — tranche 11: key the last three raw blanks, which live in OPTION VALUES
-- Created: September 6, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260906170000_loi_tool_tranche10_signage_article.sql
--
-- The last three raw-blank surfaces in the library, all inside choose_one option values rather than
-- body text — which is why the original body-text-only scan never saw them. A chosen option emits
-- verbatim, so each would have put an unfilled line into a real LOI.
--
-- APPLIED AS TARGETED UPDATES, NOT AS OPTION-SET REPLACEMENTS. Each of these params has TWO options:
-- the text branch and an is_omit branch ([OPTIONAL: ...] constructs — include or omit). Replacing the
-- option set with the single patched value would DELETE the omit branch and silently remove the
-- ability to leave the phrase out. Only the non-omit option's text changes here.
--
-- eu_remedy is NOT the audit_blank_1 pattern, and we both guessed wrong before Mike checked:
-- audit_blank_1 is ONE string appearing twice, byte-identical. eu_remedy's '___ percent (__%)' is TWO
-- DIFFERENT RENDERINGS of one number — word form before 'percent', numeral inside the parens. One
-- param would emit "five percent (five%)". Hence two params, both derived by OVIS from one negotiated
-- rate, the same arrangement as audit_article. The assembler computes nothing, so derivation is
-- upstream; nothing in the payload asserts the two agree, and if that guard is wanted it belongs in
-- OVIS at resolution, not in the assembler.
--
-- Currency and percent signs stay as FIXED TEXT outside the token: a value carrying its own '$' or
-- '%' drifts the moment two deals disagree about the format.

-- ---- 1. New params, on the same body as the option that references them --------------------------
-- Option-templating (ruled 2026-09-06) resolves a nested token against the params of the SAME
-- canonical body, so each of these must land on the parent param's body.
INSERT INTO loi_body_parameter (canonical_body_id, param_kind, param_key, value_unit, code_status, note)
SELECT bp.canonical_body_id, v.kind, v.key, v.unit, 'confirmed', v.note
  FROM (VALUES
    ('initial_cotenancy_optional_2', 'fill', 'initial_cotenancy_key_tenants', NULL,
     'Named key tenant(s) whose occupancy the initial co-tenancy condition depends on. Replaces an 18-underscore raw blank. Dealmaker-answered, not landlord - Starbucks names the tenants whose traffic it is relying on.'),
    ('utilities_optional_1', 'fill', 'utilities_fee_cap', 'usd',
     'Aggregate cap on extraordinary fees the Landlord bears. Negotiated, wizard-answered. The ''$'' is fixed text outside the token - a value carrying its own currency symbol drifts.'),
    ('eu_remedy', 'fill', 'eu_remedy_pct_word', NULL,
     'Percentage-rent rate in WORD form, e.g. ''five''. Derived by OVIS from the negotiated rate. Paired with eu_remedy_pct_num - two renderings of one number, NOT the audit_blank_1 one-string-twice pattern.'),
    ('eu_remedy', 'fill', 'eu_remedy_pct_num', 'percent',
     'Same rate in NUMERAL form, e.g. ''5''. Derived by OVIS. The ''%'' is fixed text outside the token.')
  ) AS v(parent, kind, key, unit, note)
  JOIN loi_body_parameter bp ON bp.param_key = v.parent
 WHERE NOT EXISTS (SELECT 1 FROM loi_body_parameter x
                    WHERE x.canonical_body_id = bp.canonical_body_id AND x.param_key = v.key);

-- ---- 2. Rewrite the non-omit option text --------------------------------------------------------
UPDATE loi_body_parameter_option o
   SET option_value = 'and/or {{param:initial_cotenancy_key_tenants}}'
  FROM loi_body_parameter bp
 WHERE bp.id = o.body_parameter_id AND bp.param_key = 'initial_cotenancy_optional_2'
   AND NOT o.is_omit;

UPDATE loi_body_parameter_option o
   SET option_value = 'in excess of an aggregate of ${{param:utilities_fee_cap}}'
  FROM loi_body_parameter bp
 WHERE bp.id = o.body_parameter_id AND bp.param_key = 'utilities_optional_1'
   AND NOT o.is_omit;

UPDATE loi_body_parameter_option o
   SET option_value = 'or: Tenant shall have the option to pay percentage rent of {{param:eu_remedy_pct_word}} percent ({{param:eu_remedy_pct_num}}%) of Tenant''s gross sales from the Premises, in lieu of all rent payable under the Lease'
  FROM loi_body_parameter bp
 WHERE bp.id = o.body_parameter_id AND bp.param_key = 'eu_remedy'
   AND NOT o.is_omit;

-- ---- 3. Guards, scoped to what THIS migration is responsible for --------------------------------
DO $$
DECLARE v_bad TEXT; v_n INT;
BEGIN
  -- The omit branch must have survived. Losing it would silently remove the "leave it out" state,
  -- which is the whole meaning of an [OPTIONAL: ...] construct.
  SELECT string_agg(param_key, ', ') INTO v_bad FROM (
    SELECT bp.param_key
      FROM loi_body_parameter bp
      JOIN loi_body_parameter_option o ON o.body_parameter_id = bp.id
     WHERE bp.param_key IN ('initial_cotenancy_optional_2','utilities_optional_1','eu_remedy')
     GROUP BY bp.param_key
    HAVING count(*) <> 2 OR count(*) FILTER (WHERE o.is_omit) <> 1) t;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'tranche-11: option set damaged (expected 2 options incl. exactly 1 omit): %', v_bad;
  END IF;

  -- No raw blank left in these three option values (tokens stripped first; '_' is a LIKE wildcard so
  -- this must be a regex match).
  SELECT string_agg(bp.param_key, ', ') INTO v_bad
    FROM loi_body_parameter_option o
    JOIN loi_body_parameter bp ON bp.id = o.body_parameter_id
   WHERE bp.param_key IN ('initial_cotenancy_optional_2','utilities_optional_1','eu_remedy')
     AND o.option_value IS NOT NULL
     AND regexp_replace(o.option_value, '\{\{param:[a-zA-Z0-9_]+\}\}', '', 'g') ~ '_';
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'tranche-11: raw underscore blanks remain in: %', v_bad;
  END IF;

  -- Every nested token resolves to a param on the SAME body (option-templating is body-scoped).
  SELECT string_agg(t.tok, ', ') INTO v_bad FROM (
    SELECT DISTINCT (regexp_matches(o.option_value, '\{\{param:([a-zA-Z0-9_]+)\}\}', 'g'))[1] AS tok,
           bp.canonical_body_id AS body
      FROM loi_body_parameter_option o
      JOIN loi_body_parameter bp ON bp.id = o.body_parameter_id
     WHERE bp.param_key IN ('initial_cotenancy_optional_2','utilities_optional_1','eu_remedy')) t
   WHERE NOT EXISTS (SELECT 1 FROM loi_body_parameter x
                      WHERE x.canonical_body_id = t.body AND x.param_key = t.tok);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'tranche-11: nested token(s) with no param on the same body: %', v_bad;
  END IF;

  SELECT count(*) INTO v_n FROM loi_body_parameter
   WHERE param_key IN ('initial_cotenancy_key_tenants','utilities_fee_cap','eu_remedy_pct_word','eu_remedy_pct_num');
  IF v_n <> 4 THEN
    RAISE EXCEPTION 'tranche-11: expected 4 new params, found %', v_n;
  END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
