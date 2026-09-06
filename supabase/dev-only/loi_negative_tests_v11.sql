-- DEV-ONLY — v11: landlord-fill sentinel + retired-vs-deferred availability. loi-tool-dev ONLY.
-- The library support behind payload-contract amendments A and C.

\set ON_ERROR_STOP on
\timing off

-- P1 — all fourteen landlord-completed params are declared, each with a non-empty blank rule.
--      Batch 1 = signature/TIC; batch 2 = the CAM $/SF and pro-rata % blanks.
DO $$
DECLARE n INT; n_render INT; ks TEXT;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE landlord_fill_render <> ''), string_agg(param_key, ',' ORDER BY param_key)
    INTO n, n_render, ks
    FROM loi_body_parameter WHERE param_kind = 'landlord_fill';
  -- A TEST may assert the whole set (unlike a migration guard, which must scope to its own change):
  -- noticing that the set changed is exactly what this is for. Batch 3 added the four pylon blanks.
  IF n = 18 AND n_render = 18
     AND ks = 'cam0_cam_psf,cam0_insurance_psf,cam0_tax_psf,pro_rata_share_blank_2,prs_cam_blank_2,'
              'prs_ins_blank_2,prs_tax_blank_1,sig_day,sig_ll_line,sig_ll_name,sig_ll_title,sig_month,'
              'sig_year,sign_pe_blank_3,sign_pe_blank_4,sign_pn_blank_4,sign_pn_blank_5,'
              'tic_point_of_contact' THEN
    RAISE NOTICE 'TEST P1 landlord-fill-declared: PASS (18 params, all with a render)';
  ELSE RAISE WARNING 'TEST P1 landlord-fill-declared: FAIL (n=%, rendered=%, keys=%)', n, n_render, ks; END IF;
END $$;

-- P2 — renders are the template's own underscore runs, verbatim. WIDTHS ARE NOT NORMALIZED: the
--      template genuinely differs ($______ taxes / $_____ insurance / $______ CAM; _____ estimates
--      vs ____ "Not to exceed"), and Powder Springs preserved the difference.
DO $$
DECLARE bad TEXT;
BEGIN
  SELECT string_agg(param_key || '=' || landlord_fill_render, ' ') INTO bad
    FROM loi_body_parameter bp
   WHERE bp.param_kind = 'landlord_fill'
     AND bp.landlord_fill_render IS DISTINCT FROM (CASE bp.param_key
           -- batch 1: paras 15, 229-235
           WHEN 'sig_day' THEN '______' WHEN 'sig_month' THEN '_______________'
           WHEN 'sig_year' THEN '_______' WHEN 'sig_ll_line' THEN '______________________________'
           WHEN 'sig_ll_name' THEN '_______________________' WHEN 'sig_ll_title' THEN '_______________________'
           WHEN 'tic_point_of_contact' THEN '______'
           -- batch 2: para 164 (CAM0), 174, 178, 180, 182
           WHEN 'cam0_tax_psf' THEN '______' WHEN 'cam0_insurance_psf' THEN '_____'
           WHEN 'cam0_cam_psf' THEN '______'
           WHEN 'prs_cam_blank_2' THEN '_____' WHEN 'prs_ins_blank_2' THEN '_____'
           WHEN 'prs_tax_blank_1' THEN '_____' WHEN 'pro_rata_share_blank_2' THEN '____'
           -- batch 3: pylon panel, template paras 136/138. Dimensions 10, location 18 — distinct.
           WHEN 'sign_pe_blank_4' THEN '__________' WHEN 'sign_pn_blank_5' THEN '__________'
           WHEN 'sign_pe_blank_3' THEN '__________________'
           WHEN 'sign_pn_blank_4' THEN '__________________' END);
  IF bad IS NULL THEN RAISE NOTICE 'TEST P2 render-matches-template: PASS (widths preserved per-param)';
  ELSE RAISE WARNING 'TEST P2 render-matches-template: FAIL (%)', bad; END IF;
END $$;

-- P2b — the three CAM $/SF widths are NOT all equal. Guards against a future "tidy-up" normalizing
--       them; this is the specific thing Mike said not to do.
DO $$
DECLARE n_distinct INT;
BEGIN
  SELECT count(DISTINCT landlord_fill_render) INTO n_distinct
    FROM loi_body_parameter WHERE param_key IN ('cam0_tax_psf','cam0_insurance_psf','cam0_cam_psf');
  IF n_distinct = 2 THEN RAISE NOTICE 'TEST P2b cam-widths-not-normalized: PASS (______ / _____ / ______)';
  ELSE RAISE WARNING 'TEST P2b cam-widths-not-normalized: FAIL (% distinct widths, expected 2)', n_distinct; END IF;
END $$;

-- P2c — cam0_cap_pct is the NEGOTIATED escalation cap, not a landlord blank. The word "cap" in a
--       note must never collapse it into the $/SF estimates beside it.
DO $$
DECLARE k TEXT; pref TEXT; fb TEXT;
BEGIN
  SELECT param_kind, preferred_value, fallback_value INTO k, pref, fb
    FROM loi_body_parameter WHERE param_key = 'cam0_cap_pct';
  IF k = 'concession' AND pref = '3%' AND fb = '5%' THEN
    RAISE NOTICE 'TEST P2c escalation-cap-still-negotiated: PASS (concession 3%% / 5%%)';
  ELSE RAISE WARNING 'TEST P2c escalation-cap-still-negotiated: FAIL (kind=%, pref=%, fallback=%)', k, pref, fb; END IF;
END $$;

-- P3 — retired vs deferred are distinguishable, and mean opposite things to the assembler.
DO $$
DECLARE r TEXT; dfr TEXT; n_def INT;
BEGIN
  SELECT unavailable_kind INTO r   FROM loi_clause WHERE clause_key = 'sale_of_property';
  SELECT unavailable_kind INTO dfr FROM loi_clause WHERE clause_key = 'landlord_work';
  SELECT count(*) INTO n_def FROM loi_deferred_clause;
  -- 1 clause-level deferral now: landlord_work. `rent` went ACTIVE when R1 loaded, and its remaining
  -- gap (R0) moved to POSITION level in loi_deferred_position — that split is the point, not a
  -- regression. A retired clause must still never appear here.
  IF r = 'retired' AND dfr = 'deferred' AND n_def = 1
     AND NOT EXISTS (SELECT 1 FROM loi_deferred_clause WHERE clause_key = 'sale_of_property') THEN
    RAISE NOTICE 'TEST P3 retired-vs-deferred: PASS (sale=retired strips; landlord_work=deferred halts)';
  ELSE RAISE WARNING 'TEST P3 retired-vs-deferred: FAIL (sale=%, lw=%, deferred_view=%)', r, dfr, n_def; END IF;
END $$;

-- P3b — every known gap is still discoverable, now at BOTH granularities. Powder Springs needs R1
--       (loaded) and LCW0 (deferred), so the acceptance test must still halt on landlord_work; and an
--       R0 deal must halt on the position-level R0 entry. loi_deferred_item is the single query.
DO $$
DECLARE missing TEXT;
BEGIN
  SELECT string_agg(k, ', ') INTO missing
    FROM (VALUES ('landlord_work|-'), ('rent|R0')) AS want(k)
   WHERE NOT EXISTS (SELECT 1 FROM loi_deferred_item d
                      WHERE d.clause_key || '|' || coalesce(d.brace_code,'-') = want.k);
  IF missing IS NULL THEN RAISE NOTICE 'TEST P3b deferred-registry-complete: PASS (landlord_work clause + rent/R0 position)';
  ELSE RAISE WARNING 'TEST P3b deferred-registry-complete: FAIL (missing: %)', missing; END IF;
END $$;

-- P4 — a deferred clause is NOT selectable (it has nothing to select) but IS discoverable, which is
--      the whole point: OVIS cannot halt on a clause it has never heard of.
DO $$
DECLARE n_sel INT; n_known INT;
BEGIN
  SELECT count(*) INTO n_sel   FROM loi_selectable_position WHERE clause_key = 'landlord_work';
  SELECT count(*) INTO n_known FROM loi_clause             WHERE clause_key = 'landlord_work';
  IF n_sel = 0 AND n_known = 1 THEN RAISE NOTICE 'TEST P4 deferred-known-not-selectable: PASS';
  ELSE RAISE WARNING 'TEST P4 deferred-known-not-selectable: FAIL (selectable=%, known=%)', n_sel, n_known; END IF;
END $$;

-- ===========================================================================
-- Negatives (ROLLED BACK)
-- ===========================================================================
BEGIN;
INSERT INTO loi_canonical_body (id, brace_code, source, version, segment_key, body_text)
  VALUES ('88888888-8888-8888-8888-888888888801', NULL, 'national-template-drop', 'vtest',
          'x_lf_body', 'A blank here: {{param:x_blank}}');

-- N1 — landlord_fill with no render => reject (empty is indistinguishable from a bug)
DO $$
BEGIN
  INSERT INTO loi_body_parameter (canonical_body_id, param_kind, param_key)
    VALUES ('88888888-8888-8888-8888-888888888801', 'landlord_fill', 'x_blank');
  RAISE WARNING 'TEST N1 landlord-fill-needs-render: FAIL (accepted a render-less sentinel)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N1 landlord-fill-needs-render: PASS (rejected: %)', SQLERRM; END $$;

-- N2 — an EMPTY render => reject (same reason)
DO $$
BEGIN
  INSERT INTO loi_body_parameter (canonical_body_id, param_kind, param_key, landlord_fill_render)
    VALUES ('88888888-8888-8888-8888-888888888801', 'landlord_fill', 'x_blank', '');
  RAISE WARNING 'TEST N2 empty-render: FAIL (empty string accepted as a sentinel)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N2 empty-render: PASS (rejected: %)', SQLERRM; END $$;

-- N3 — a NON-landlord_fill param carrying a render => reject (one field, one meaning)
DO $$
BEGIN
  INSERT INTO loi_body_parameter (canonical_body_id, param_kind, param_key, landlord_fill_render)
    VALUES ('88888888-8888-8888-8888-888888888801', 'fill', 'x_blank', '______');
  RAISE WARNING 'TEST N3 render-on-plain-fill: FAIL (accepted)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N3 render-on-plain-fill: PASS (rejected: %)', SQLERRM; END $$;

-- N4 — de-activating a clause without saying retired-or-deferred => reject
DO $$
BEGIN
  INSERT INTO loi_clause (clause_key, title, bucket, is_active, inactive_reason)
    VALUES ('x_unavail', 'X', 'standing-default', false, 'because');
  RAISE WARNING 'TEST N4 inactive-needs-kind: FAIL (accepted an unclassified retirement)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N4 inactive-needs-kind: PASS (rejected: %)', SQLERRM; END $$;

-- N5 — an ACTIVE clause carrying unavailable_kind => reject
DO $$
BEGIN
  INSERT INTO loi_clause (clause_key, title, bucket, is_active, unavailable_kind)
    VALUES ('x_active_kind', 'X', 'standing-default', true, 'deferred');
  RAISE WARNING 'TEST N5 active-with-kind: FAIL (accepted)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N5 active-with-kind: PASS (rejected: %)', SQLERRM; END $$;

-- N6 — a landlord_fill carrying options => reject (nobody chooses; the landlord writes)
DO $$
DECLARE v_p UUID;
BEGIN
  INSERT INTO loi_body_parameter (canonical_body_id, param_kind, param_key, landlord_fill_render)
    VALUES ('88888888-8888-8888-8888-888888888801', 'landlord_fill', 'x_blank', '______') RETURNING id INTO v_p;
  INSERT INTO loi_body_parameter_option (body_parameter_id, option_value) VALUES (v_p, 'nope');
  PERFORM loi_assert_body_parameter_options(v_p);
  RAISE WARNING 'TEST N6 landlord-fill-no-options: FAIL (accepted options)';
EXCEPTION WHEN others THEN RAISE NOTICE 'TEST N6 landlord-fill-no-options: PASS (rejected: %)', SQLERRM; END $$;

ROLLBACK;
