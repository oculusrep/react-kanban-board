-- =====================================================
-- FIX: Payment Date Estimate Calculation
-- =====================================================
-- This migration ensures app_settings has the required forecasting defaults
-- and fixes the get_effective_velocity function to properly read JSONB values.
-- =====================================================

-- Step 1: Ensure app_settings has required values (UPSERT)
-- Note: value column is JSONB, storing numbers as JSON numbers
INSERT INTO app_settings (key, value, description)
VALUES
  ('velocity_loi_days_default', '30'::jsonb, 'Default duration in days for Negotiating LOI stage'),
  ('velocity_lease_psa_days_default', '45'::jsonb, 'Default duration in days for At Lease/PSA stage'),
  ('default_rent_commencement_days', '180'::jsonb, 'Default rent commencement period in days when not specified'),
  ('default_closing_deadline_days', '30'::jsonb, 'Default closing deadline in days after due diligence for purchases'),
  ('velocity_min_deals_for_historical', '5'::jsonb, 'Minimum closed deals required to use client historical velocity'),
  ('behind_schedule_threshold_days', '7'::jsonb, 'Days over expected stage duration before marking deal as behind schedule')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;

-- Step 2: Fix get_effective_velocity to properly extract JSONB values
CREATE OR REPLACE FUNCTION get_effective_velocity(
  p_client_id UUID,
  p_stage_label TEXT
)
RETURNS INTEGER AS $$
DECLARE
  v_client_override INTEGER;
  v_historical_avg NUMERIC;
  v_historical_count INTEGER;
  v_min_deals INTEGER;
  v_global_default INTEGER;
  v_json_value JSONB;
BEGIN
  -- Get minimum deals threshold from app_settings (JSONB extraction)
  SELECT value INTO v_json_value
  FROM app_settings WHERE key = 'velocity_min_deals_for_historical';
  v_min_deals := COALESCE((v_json_value#>>'{}')::INTEGER, 5);

  -- Check client override first
  IF p_stage_label = 'Negotiating LOI' THEN
    SELECT velocity_loi_days_override INTO v_client_override
    FROM client WHERE id = p_client_id;

    -- Get global default (JSONB extraction)
    SELECT value INTO v_json_value
    FROM app_settings WHERE key = 'velocity_loi_days_default';
    v_global_default := COALESCE((v_json_value#>>'{}')::INTEGER, 30);

    -- Get historical average
    SELECT loi_deal_count, loi_avg_days INTO v_historical_count, v_historical_avg
    FROM client_velocity_stats WHERE client_id = p_client_id;

  ELSIF p_stage_label = 'At Lease / PSA' THEN
    SELECT velocity_lease_psa_days_override INTO v_client_override
    FROM client WHERE id = p_client_id;

    -- Get global default (JSONB extraction)
    SELECT value INTO v_json_value
    FROM app_settings WHERE key = 'velocity_lease_psa_days_default';
    v_global_default := COALESCE((v_json_value#>>'{}')::INTEGER, 45);

    -- Get historical average
    SELECT lease_psa_deal_count, lease_psa_avg_days INTO v_historical_count, v_historical_avg
    FROM client_velocity_stats WHERE client_id = p_client_id;
  ELSE
    RETURN 0;
  END IF;

  -- Priority: 1. Historical (if enough data) -> 2. Client override -> 3. Global default
  IF v_historical_count >= v_min_deals AND v_historical_avg IS NOT NULL THEN
    RETURN ROUND(v_historical_avg)::INTEGER;
  ELSIF v_client_override IS NOT NULL THEN
    RETURN v_client_override;
  ELSE
    RETURN v_global_default;
  END IF;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION get_effective_velocity IS 'Returns the effective velocity (days) for a stage. Priority: Historical > Client Override > Global Default.';

-- Step 3: Fix calculate_payment_estimates to properly extract JSONB values
CREATE OR REPLACE FUNCTION calculate_payment_estimates(p_deal_id UUID)
RETURNS TABLE (
  payment_id UUID,
  payment_sequence INTEGER,
  estimated_date DATE,
  calculation_notes TEXT
) AS $$
DECLARE
  v_deal RECORD;
  v_deal_type TEXT;
  v_anchor_date DATE;
  v_loi_velocity INTEGER;
  v_psa_velocity INTEGER;
  v_execution_date DATE;
  v_contingency_days INTEGER;
  v_rent_commencement_days INTEGER;
  v_due_diligence_days INTEGER;
  v_closing_deadline_days INTEGER;
  v_payment RECORD;
  v_notes TEXT;
  v_json_value JSONB;
  v_site_submit_loi_date DATE;
BEGIN
  -- Get deal information
  SELECT
    d.*,
    ds.label AS stage_label,
    dt.label AS deal_type_label
  INTO v_deal
  FROM deal d
  JOIN deal_stage ds ON ds.id = d.stage_id
  LEFT JOIN deal_type dt ON dt.id = d.deal_type_id
  WHERE d.id = p_deal_id;

  IF v_deal IS NULL THEN
    RETURN;
  END IF;

  -- Get LOI date from site_submit if not on deal
  SELECT ss.loi_date INTO v_site_submit_loi_date
  FROM site_submit ss
  WHERE ss.deal_id = p_deal_id
  LIMIT 1;

  v_deal_type := COALESCE(v_deal.deal_type_label, 'Lease');

  -- Get effective velocities
  v_loi_velocity := get_effective_velocity(v_deal.client_id, 'Negotiating LOI');
  v_psa_velocity := get_effective_velocity(v_deal.client_id, 'At Lease / PSA');

  -- Determine anchor date and calculate execution date based on current stage
  -- Priority: deal.loi_date -> site_submit.loi_date -> deal.created_at -> CURRENT_DATE
  IF v_deal.stage_label = 'Negotiating LOI' THEN
    v_anchor_date := COALESCE(v_deal.loi_date, v_site_submit_loi_date, v_deal.created_at::DATE, CURRENT_DATE);
    v_execution_date := v_anchor_date + v_loi_velocity + v_psa_velocity;
    v_notes := format('LOI date + %s days (LOI) + %s days (PSA)', v_loi_velocity, v_psa_velocity);

  ELSIF v_deal.stage_label = 'At Lease / PSA' THEN
    v_anchor_date := COALESCE(v_deal.loi_signed_date, v_deal.last_stage_change_at::DATE, v_deal.created_at::DATE, CURRENT_DATE);
    v_execution_date := v_anchor_date + v_psa_velocity;
    v_notes := format('LOI signed + %s days (PSA)', v_psa_velocity);

  ELSIF v_deal.stage_label IN ('Under Contract / Contingent', 'Booked', 'Executed Payable') THEN
    v_execution_date := COALESCE(v_deal.contract_signed_date, v_deal.estimated_execution_date);
    IF v_execution_date IS NULL THEN
      -- Fallback: use last stage change + estimate
      v_execution_date := COALESCE(v_deal.last_stage_change_at::DATE, CURRENT_DATE);
    END IF;
    v_notes := 'Contract signed date';
  ELSE
    -- Lost or Closed - no estimates needed
    RETURN;
  END IF;

  -- Override with manual estimated_execution_date if set
  IF v_deal.estimated_execution_date IS NOT NULL THEN
    v_execution_date := v_deal.estimated_execution_date;
    v_notes := 'Manual execution date';
  END IF;

  -- Get period defaults (with proper JSONB extraction)
  v_contingency_days := COALESCE(v_deal.contingency_period_days, 0);

  SELECT value INTO v_json_value
  FROM app_settings WHERE key = 'default_rent_commencement_days';
  v_rent_commencement_days := COALESCE(v_deal.rent_commencement_days, COALESCE((v_json_value#>>'{}')::INTEGER, 180));

  v_due_diligence_days := COALESCE(v_deal.due_diligence_days, 0);

  SELECT value INTO v_json_value
  FROM app_settings WHERE key = 'default_closing_deadline_days';
  v_closing_deadline_days := COALESCE(v_deal.closing_deadline_days, COALESCE((v_json_value#>>'{}')::INTEGER, 30));

  -- Apply behind schedule adjustment
  IF v_deal.weeks_behind > 0 THEN
    v_execution_date := v_execution_date + (v_deal.weeks_behind * 7);
    v_notes := v_notes || format(' (+%s weeks behind)', v_deal.weeks_behind);
  END IF;

  -- Calculate payment dates based on deal type
  IF v_deal_type ILIKE '%purchase%' THEN
    -- Purchase: 1 payment at closing
    FOR v_payment IN
      SELECT p.id, p.payment_sequence
      FROM payment p
      WHERE p.deal_id = p_deal_id AND COALESCE(p.is_active, TRUE)
      ORDER BY p.payment_sequence
    LOOP
      payment_id := v_payment.id;
      payment_sequence := v_payment.payment_sequence;
      estimated_date := v_execution_date + v_due_diligence_days + v_closing_deadline_days;
      calculation_notes := format('%s + %s DD + %s closing', v_notes, v_due_diligence_days, v_closing_deadline_days);
      RETURN NEXT;
    END LOOP;
  ELSE
    -- Lease: Payment 1 at execution + contingency, Payment 2 at rent commencement
    FOR v_payment IN
      SELECT p.id, p.payment_sequence
      FROM payment p
      WHERE p.deal_id = p_deal_id AND COALESCE(p.is_active, TRUE)
      ORDER BY p.payment_sequence
    LOOP
      payment_id := v_payment.id;
      payment_sequence := v_payment.payment_sequence;

      IF v_payment.payment_sequence = 1 THEN
        estimated_date := v_execution_date + v_contingency_days;
        IF v_contingency_days > 0 THEN
          calculation_notes := format('%s + %s contingency', v_notes, v_contingency_days);
        ELSE
          calculation_notes := v_notes;
        END IF;
      ELSE
        estimated_date := v_execution_date + v_contingency_days + v_rent_commencement_days;
        calculation_notes := format('%s + %s contingency + %s rent comm', v_notes, v_contingency_days, v_rent_commencement_days);
      END IF;

      RETURN NEXT;
    END LOOP;
  END IF;

  RETURN;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_payment_estimates IS 'Calculates estimated payment dates for a deal based on velocity, timeline periods, and stage.';

-- Step 4: Create a diagnostic function
CREATE OR REPLACE FUNCTION debug_payment_estimates(p_deal_id UUID DEFAULT NULL)
RETURNS TABLE (
  check_name TEXT,
  result TEXT,
  status TEXT
) AS $$
DECLARE
  v_deal RECORD;
  v_payment_count INTEGER;
  v_loi_velocity INTEGER;
  v_psa_velocity INTEGER;
BEGIN
  -- If no deal_id provided, use first Negotiating LOI deal
  IF p_deal_id IS NULL THEN
    SELECT d.id INTO p_deal_id
    FROM deal d
    JOIN deal_stage ds ON ds.id = d.stage_id
    WHERE ds.label = 'Negotiating LOI'
    LIMIT 1;
  END IF;

  IF p_deal_id IS NULL THEN
    check_name := 'No deals found';
    result := 'No pipeline deals in Negotiating LOI stage';
    status := 'ERROR';
    RETURN NEXT;
    RETURN;
  END IF;

  -- Get deal info
  SELECT
    d.id, d.deal_name, ds.label AS stage_label, d.client_id,
    c.client_name, d.loi_date, d.created_at, dt.label AS deal_type_label
  INTO v_deal
  FROM deal d
  JOIN deal_stage ds ON ds.id = d.stage_id
  LEFT JOIN client c ON c.id = d.client_id
  LEFT JOIN deal_type dt ON dt.id = d.deal_type_id
  WHERE d.id = p_deal_id;

  -- Check 1: Deal found
  check_name := 'Deal Found';
  IF v_deal.id IS NOT NULL THEN
    result := format('Deal: %s (Stage: %s)', v_deal.deal_name, v_deal.stage_label);
    status := 'OK';
  ELSE
    result := 'Deal not found';
    status := 'ERROR';
    RETURN NEXT;
    RETURN;
  END IF;
  RETURN NEXT;

  -- Check 2: Stage is supported
  check_name := 'Stage Supported';
  IF v_deal.stage_label IN ('Negotiating LOI', 'At Lease / PSA', 'Under Contract / Contingent', 'Booked', 'Executed Payable') THEN
    result := v_deal.stage_label;
    status := 'OK';
  ELSE
    result := format('%s (not supported for estimates)', v_deal.stage_label);
    status := 'ERROR';
  END IF;
  RETURN NEXT;

  -- Check 3: Payments exist
  SELECT COUNT(*) INTO v_payment_count
  FROM payment p
  WHERE p.deal_id = p_deal_id AND COALESCE(p.is_active, TRUE);

  check_name := 'Active Payments';
  IF v_payment_count > 0 THEN
    result := format('%s payments found', v_payment_count);
    status := 'OK';
  ELSE
    result := 'No active payments - need to generate payments first';
    status := 'ERROR';
  END IF;
  RETURN NEXT;

  -- Check 4: Client exists
  check_name := 'Client';
  IF v_deal.client_id IS NOT NULL THEN
    result := format('%s (%s)', v_deal.client_name, v_deal.client_id);
    status := 'OK';
  ELSE
    result := 'No client linked to deal';
    status := 'WARNING';
  END IF;
  RETURN NEXT;

  -- Check 5: LOI Velocity
  v_loi_velocity := get_effective_velocity(v_deal.client_id, 'Negotiating LOI');
  check_name := 'LOI Velocity';
  IF v_loi_velocity > 0 THEN
    result := format('%s days', v_loi_velocity);
    status := 'OK';
  ELSE
    result := 'Velocity returned 0 - check app_settings';
    status := 'ERROR';
  END IF;
  RETURN NEXT;

  -- Check 6: PSA Velocity
  v_psa_velocity := get_effective_velocity(v_deal.client_id, 'At Lease / PSA');
  check_name := 'PSA Velocity';
  IF v_psa_velocity > 0 THEN
    result := format('%s days', v_psa_velocity);
    status := 'OK';
  ELSE
    result := 'Velocity returned 0 - check app_settings';
    status := 'ERROR';
  END IF;
  RETURN NEXT;

  -- Check 7: Anchor date
  check_name := 'Anchor Date';
  IF v_deal.loi_date IS NOT NULL THEN
    result := format('LOI Date: %s', v_deal.loi_date);
    status := 'OK';
  ELSE
    result := format('Using created_at: %s (no LOI date)', v_deal.created_at::DATE);
    status := 'WARNING';
  END IF;
  RETURN NEXT;

  -- Check 8: Calculate estimates
  check_name := 'Payment Estimates';
  IF EXISTS (SELECT 1 FROM calculate_payment_estimates(p_deal_id)) THEN
    result := (SELECT string_agg(format('Seq %s: %s', payment_sequence, estimated_date), ', ')
               FROM calculate_payment_estimates(p_deal_id));
    status := 'OK';
  ELSE
    result := 'calculate_payment_estimates returned no rows';
    status := 'ERROR';
  END IF;
  RETURN NEXT;

  RETURN;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION debug_payment_estimates IS 'Diagnoses why calculate_payment_estimates might not be returning results for a deal.';

-- =====================================================
-- SUMMARY
-- =====================================================
DO $$
BEGIN
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Payment Estimate Fix Applied';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'Run this to diagnose a specific deal:';
  RAISE NOTICE '  SELECT * FROM debug_payment_estimates(''deal-uuid-here'');';
  RAISE NOTICE '';
  RAISE NOTICE 'Or run without a parameter to check first LOI deal:';
  RAISE NOTICE '  SELECT * FROM debug_payment_estimates();';
  RAISE NOTICE '';
  RAISE NOTICE 'To recalculate dates for all pipeline deals after fixing issues:';
  RAISE NOTICE '  SELECT recalculate_payment_dates_for_deal(d.id)';
  RAISE NOTICE '  FROM deal d JOIN deal_stage ds ON ds.id = d.stage_id';
  RAISE NOTICE '  WHERE ds.label NOT IN (''Lost'', ''Closed Paid'');';
  RAISE NOTICE '==========================================';
END $$;
