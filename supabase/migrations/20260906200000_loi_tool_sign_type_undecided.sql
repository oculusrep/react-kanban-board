-- Starbucks LOI Tool — "monument or pylon" is a THIRD, LEGITIMATE sign-type branch
-- Created: September 6, 2026
-- Branch: feature/starbucks-loi-tool
-- Depends on: 20260906190000_loi_tool_pylon_blanks_landlord_fill.sql
--
-- REVERSES the earlier reading. Mike ruled: the wizard asks the sign type per deal, and "undecided"
-- is a LEGITIMATE answer that reads "monument or pylon" in the emitted LOI. Powder Springs used it.
-- That paragraph was CORRECT OUTPUT, not an unresolved CHOOSE that escaped review.
--
-- We had both read the emitted "monument or pylon" as a template CHOOSE nobody had resolved, and it
-- was one step from being recorded as a permanent fixture defect. It was a third state nobody had
-- modelled. THE LESSON, kept here because the next one will look the same: AN UNEXPECTED EMISSION IS
-- NOT AUTOMATICALLY A DEFECT. Ask what the output MEANS before classifying it as wrong — the send was
-- made by someone who knew what they were doing.
--
-- Param change only. No body change, no new canonical-body version, no supersession — the same shape
-- as the landlord-fill re-key.
--
-- sign_pn_choose_2's SECOND occurrence ("Landlord agrees to construct the {{param}} prior to
-- delivery") takes the same value and reads correctly on this branch: "Landlord agrees to construct
-- the monument or pylon prior to delivery." One param, both occurrences, no change needed.

INSERT INTO loi_body_parameter_option (body_parameter_id, option_value, is_free_fill, is_omit, sort_order)
SELECT bp.id, 'monument or pylon', false, false, 2
  FROM loi_body_parameter bp
 WHERE bp.param_key IN ('sign_pe_choose_2','sign_pn_choose_2')
   AND NOT EXISTS (SELECT 1 FROM loi_body_parameter_option o
                    WHERE o.body_parameter_id = bp.id AND o.option_value = 'monument or pylon');

-- Guard, scoped to this migration's own two params (never a library-wide total — that shape of guard
-- breaks on a later migration's correct work).
DO $$
DECLARE v_bad TEXT;
BEGIN
  SELECT string_agg(param_key || '=' || n, ', ') INTO v_bad FROM (
    SELECT bp.param_key, count(*) AS n
      FROM loi_body_parameter bp
      JOIN loi_body_parameter_option o ON o.body_parameter_id = bp.id
     WHERE bp.param_key IN ('sign_pe_choose_2','sign_pn_choose_2')
     GROUP BY bp.param_key
    HAVING count(*) <> 3
        OR count(*) FILTER (WHERE o.option_value = 'monument or pylon') <> 1) t;
  IF v_bad IS NOT NULL THEN
    RAISE EXCEPTION 'sign-type choose must have exactly 3 options incl. one "monument or pylon": %', v_bad;
  END IF;
END $$;

-- ============================================================================
-- END OF MIGRATION
-- ============================================================================
