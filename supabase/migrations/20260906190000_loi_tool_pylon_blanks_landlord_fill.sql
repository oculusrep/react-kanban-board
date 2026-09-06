-- Starbucks LOI Tool — the four pylon-panel blanks are LANDLORD-FILL
-- Created: September 6, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260906180000_loi_tool_tranche11_option_blanks.sql
--
-- A PARAM RE-KEY, NOT A TRANCHE. The bodies are unchanged, so there is no new canonical-body version
-- and no supersession — which also means none of the orphaning risk that made stacking a second
-- supersession onto tranche 10 a bad idea. Only param_kind and landlord_fill_render move.
--
-- EVIDENCE, same class as the CAM / pro-rata re-key: Mike's own margin comments in the SENT Powder
-- Springs LOI — "LL please insert dimensions" and "LL please enter location of monument" — plus both
-- blanks shipping empty in that send. These are completed by the landlord after we send, so OVIS must
-- never prompt for them and the assembler must never fail on them; they emit the template's blank rule
-- and count as RESOLVED for the acceptance test.
--
-- RENDERS ARE VERBATIM AND PER-PARAM, verified against the fixture paragraph: the dimensions run is 10
-- underscores and the location run is 18. Not normalised — the same rule as the signature/CAM blanks.

UPDATE loi_body_parameter SET param_kind = 'landlord_fill', landlord_fill_render = v.render, note = v.note
  FROM (VALUES
    ('sign_pe_blank_4', '__________',
     'Sign panel DIMENSIONS, existing-pylon variant. LANDLORD COMPLETES - Powder Springs shipped blank with the margin comment "LL please insert dimensions". Template run is 10 underscores; the location blank is 18, and the difference is preserved.'),
    ('sign_pn_blank_5', '__________',
     'Sign panel DIMENSIONS, to-be-constructed-pylon variant. LANDLORD COMPLETES - same evidence as sign_pe_blank_4.'),
    ('sign_pe_blank_3', '__________________',
     'LOCATION of the existing monument/pylon sign. LANDLORD COMPLETES - Powder Springs margin comment "LL please enter location of monument". Template run is 18 underscores.'),
    ('sign_pn_blank_4', '__________________',
     'LOCATION of the to-be-constructed monument/pylon sign. LANDLORD COMPLETES - same evidence as sign_pe_blank_3.')
  ) AS v(param_key, render, note)
 WHERE loi_body_parameter.param_key = v.param_key
   AND loi_body_parameter.param_kind = 'fill';

-- Guard, scoped to this migration's own four params. Deliberately NOT a library-wide landlord_fill
-- count: that shape of guard fails the moment a later migration adds one more, i.e. it breaks on
-- somebody else's correct work. (The two earlier landlord_fill migrations carried exactly that bug and
-- are rescoped in the same change as this one.)
DO $$
DECLARE v_missing TEXT;
BEGIN
  SELECT string_agg(k, ', ') INTO v_missing
    FROM (VALUES ('sign_pe_blank_4'),('sign_pn_blank_5'),
                 ('sign_pe_blank_3'),('sign_pn_blank_4')) AS want(k)
   WHERE NOT EXISTS (SELECT 1 FROM loi_body_parameter bp
                      WHERE bp.param_key = want.k AND bp.param_kind = 'landlord_fill'
                        AND bp.landlord_fill_render IS NOT NULL AND bp.landlord_fill_render <> '');
  IF v_missing IS NOT NULL THEN
    RAISE EXCEPTION 'pylon landlord_fill re-key: these params did not flip: %', v_missing;
  END IF;

  -- The two widths must stay distinct: dimensions 10, location 18. A "tidy-up" that flattens them
  -- would emit a document that no longer matches the template.
  IF (SELECT count(DISTINCT landlord_fill_render) FROM loi_body_parameter
       WHERE param_key IN ('sign_pe_blank_4','sign_pn_blank_5','sign_pe_blank_3','sign_pn_blank_4')) <> 2 THEN
    RAISE EXCEPTION 'pylon landlord_fill renders were normalised — dimensions (10) and location (18) must differ';
  END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
