-- DEV-ONLY — v11: landlord-fill sentinel + retired-vs-deferred availability. loi-tool-dev ONLY.
-- The library support behind payload-contract amendments A and C.

\set ON_ERROR_STOP on
\timing off

-- P1 — the seven landlord-completed params are declared, each with a non-empty blank rule.
DO $$
DECLARE n INT; n_render INT; ks TEXT;
BEGIN
  SELECT count(*), count(*) FILTER (WHERE landlord_fill_render <> ''), string_agg(param_key, ',' ORDER BY param_key)
    INTO n, n_render, ks
    FROM loi_body_parameter WHERE param_kind = 'landlord_fill';
  IF n = 7 AND n_render = 7
     AND ks = 'sig_day,sig_ll_line,sig_ll_name,sig_ll_title,sig_month,sig_year,tic_point_of_contact' THEN
    RAISE NOTICE 'TEST P1 landlord-fill-declared: PASS (7 params, all with a render)';
  ELSE RAISE WARNING 'TEST P1 landlord-fill-declared: FAIL (n=%, rendered=%, keys=%)', n, n_render, ks; END IF;
END $$;

-- P2 — renders are the template's own underscore runs, verbatim (widths differ and are not guessable).
DO $$
DECLARE bad TEXT;
BEGIN
  SELECT string_agg(param_key || '=' || landlord_fill_render, ' ') INTO bad
    FROM loi_body_parameter bp
   WHERE bp.param_kind = 'landlord_fill'
     AND bp.landlord_fill_render <> (CASE bp.param_key
           WHEN 'sig_day' THEN '______' WHEN 'sig_month' THEN '_______________'
           WHEN 'sig_year' THEN '_______' WHEN 'sig_ll_line' THEN '______________________________'
           WHEN 'sig_ll_name' THEN '_______________________' WHEN 'sig_ll_title' THEN '_______________________'
           WHEN 'tic_point_of_contact' THEN '______' END);
  IF bad IS NULL THEN RAISE NOTICE 'TEST P2 render-matches-template: PASS';
  ELSE RAISE WARNING 'TEST P2 render-matches-template: FAIL (%)', bad; END IF;
END $$;

-- P3 — retired vs deferred are distinguishable, and mean opposite things to the assembler.
DO $$
DECLARE r TEXT; dfr TEXT; n_def INT;
BEGIN
  SELECT unavailable_kind INTO r   FROM loi_clause WHERE clause_key = 'sale_of_property';
  SELECT unavailable_kind INTO dfr FROM loi_clause WHERE clause_key = 'landlord_work';
  SELECT count(*) INTO n_def FROM loi_deferred_clause;
  IF r = 'retired' AND dfr = 'deferred' AND n_def = 1
     AND NOT EXISTS (SELECT 1 FROM loi_deferred_clause WHERE clause_key = 'sale_of_property') THEN
    RAISE NOTICE 'TEST P3 retired-vs-deferred: PASS (sale=retired strips; landlord_work=deferred halts)';
  ELSE RAISE WARNING 'TEST P3 retired-vs-deferred: FAIL (sale=%, lw=%, deferred_view=%)', r, dfr, n_def; END IF;
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
