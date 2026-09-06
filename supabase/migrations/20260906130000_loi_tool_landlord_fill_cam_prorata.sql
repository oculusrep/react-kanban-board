-- Starbucks LOI Tool — landlord-fill re-key, batch 2: CAM/tax/insurance + pro-rata blanks
-- Created: September 6, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260906120000_loi_tool_landlord_fill_and_deferred.sql
--
-- Resolves the item left open in payload contract A. Mike's source evidence, from the SENT Powder
-- Springs LOI: all seven blanks below shipped BLANK, each carrying his own landlord instruction —
-- "LL insert estimated taxes" / "LL insert insurance" / "LL insert CAM" on the three per-square-foot
-- runs, and "LL please insert" on the pro-rata percentages. They are landlord-completed, not
-- wizard-answered.
--
-- MAPPING CONFIRMED against the loaded bodies before re-keying (Mike asked; he had inferred it from
-- param names, not rows). cam/main reads:
--   "...will not exceed on an annual basis ..., ${{cam0_tax_psf}} per square foot for real estate
--    taxes, ${{cam0_insurance_psf}} for insurance and ${{cam0_cam_psf}} for common area maintenance..."
-- so the three names do point at the three per-square-foot runs. The pro-rata names point at the
-- "Estimated to be {{...}}%." runs in cam_share / insurance_share / tax_share.
--
-- THE WORD "CAP" IN THEIR NOTES WAS MISLEADING and is corrected here. Two different blanks were
-- collapsing under it:
--   * cam0_tax_psf / cam0_insurance_psf / cam0_cam_psf — landlord's ESTIMATED $/SF costs. Landlord
--     fill. (Their notes said "Annual cap, ..." because the sentence they sit in caps those charges;
--     the number itself is the landlord's estimate, not something we negotiate.)
--   * cam0_cap_pct — the ESCALATION percentage we DO negotiate ("will not increase by more than
--     {{cam0_cap_pct}}, on a non-cumulative basis"). UNCHANGED by this migration.
--
-- NOTE for the record: Mike described cam0_cap_pct as staying "an ordinary fill". It is actually a
-- 'concession' with preferred 3% / fallback 5% — which is exactly the "Oculus opens at 3%, falls back
-- to national 5%" he described, and a stronger encoding than fill. Left as-is; flagged so the
-- decisions doc and his mental model agree.
--
-- RENDER WIDTHS ARE VERBATIM AND PER-PARAM — NOT NORMALIZED. The template really does differ
-- ($______ for taxes, $_____ for insurance, $______ for CAM; _____ for the pro-rata estimates, ____
-- for "Not to exceed"), and Powder Springs preserved the difference. Verified against
-- LOI_US_7_30_2026.docx paras 164 (CAM0), 174, 178, 180, 182.

UPDATE loi_body_parameter SET param_kind = 'landlord_fill', landlord_fill_render = v.render, note = v.note
  FROM (VALUES
    -- CAM0 body, template para 164. Widths differ between the three; this is deliberate.
    ('cam0_tax_psf',           '______', 'Landlord''s estimated annual real estate taxes, $/SF. LANDLORD COMPLETES - Powder Springs shipped blank with the comment "LL insert estimated taxes". The annual CAP on escalation is cam0_cap_pct, a separate negotiated param.'),
    ('cam0_insurance_psf',     '_____',  'Landlord''s estimated annual insurance, $/SF. LANDLORD COMPLETES - Powder Springs shipped blank with the comment "LL insert insurance". Template run is 5 underscores here, 6 for taxes/CAM; not normalized.'),
    ('cam0_cam_psf',           '______', 'Landlord''s estimated annual common area maintenance, $/SF. LANDLORD COMPLETES - Powder Springs shipped blank with the comment "LL insert CAM".'),
    -- Pro-rata "Estimated to be _____%." runs, template paras 178/180/182.
    ('prs_cam_blank_2',        '_____',  'Estimated pro-rata share of CAM, %. LANDLORD COMPLETES - Powder Springs comments "LL please insert".'),
    ('prs_ins_blank_2',        '_____',  'Estimated pro-rata share of insurance, %. LANDLORD COMPLETES - Powder Springs comments "LL please insert".'),
    ('prs_tax_blank_1',        '_____',  'Estimated pro-rata share of real estate taxes, %. LANDLORD COMPLETES - Powder Springs comments "LL please insert".'),
    -- The "Not to exceed ____ %." run, template para 174. Mike described this blank and its
    -- "LL please insert" comment but attributed it to the prs_* keys; it actually lives on
    -- pro_rata_share/main as pro_rata_share_blank_2. Same evidence, different key. FLAGGED.
    ('pro_rata_share_blank_2', '____',   'Pro-rata share ceiling, %. LANDLORD COMPLETES - Powder Springs comments "LL please insert". Template run is 4 underscores here vs 5 for the "Estimated to be" runs; not normalized.')
  ) AS v(param_key, render, note)
 WHERE loi_body_parameter.param_key = v.param_key
   AND loi_body_parameter.param_kind = 'fill';

-- Load guard: 7 from the first batch + 7 here. A silent miss would put the acceptance test back to
-- failing on blanks that are supposed to stay blank.
DO $$
DECLARE v_bad TEXT;
BEGIN
  -- SCOPED to batch 2's own seven params. A library-wide total would fail the moment a later
  -- migration adds an eighth landlord_fill param — a guard that breaks on somebody else's correct
  -- work is the guard that gets deleted.
  SELECT string_agg(k, ', ') INTO v_bad
    FROM (VALUES ('cam0_tax_psf'),('cam0_insurance_psf'),('cam0_cam_psf'),('prs_cam_blank_2'),
                 ('prs_ins_blank_2'),('prs_tax_blank_1'),('pro_rata_share_blank_2')) AS want(k)
   WHERE NOT EXISTS (SELECT 1 FROM loi_body_parameter bp
                      WHERE bp.param_key = want.k AND bp.param_kind = 'landlord_fill'
                        AND bp.landlord_fill_render IS NOT NULL);
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'landlord_fill re-key batch 2: these params did not flip: %', v_bad;
  END IF;

  -- cam0_cap_pct is the negotiated escalation cap and must NOT have been swept up.
  SELECT param_kind INTO v_bad FROM loi_body_parameter WHERE param_key = 'cam0_cap_pct';
  IF v_bad <> 'concession' THEN
    RAISE EXCEPTION 'cam0_cap_pct must stay a negotiated concession, found %', v_bad;
  END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
