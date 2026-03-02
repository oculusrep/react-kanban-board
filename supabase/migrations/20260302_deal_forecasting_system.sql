-- =====================================================
-- DEAL FORECASTING SYSTEM
-- =====================================================
-- Automated payment date estimation based on deal velocity and timeline data.
-- Enables accurate revenue forecasting for pipeline deals.
--
-- See docs/DEAL_FORECASTING_SYSTEM.md for full specification.
-- =====================================================

-- =====================================================
-- 1. DEAL TABLE - New Forecasting Fields
-- =====================================================

-- Timeline period fields for leases
ALTER TABLE deal ADD COLUMN IF NOT EXISTS contingency_period_days INTEGER;
COMMENT ON COLUMN deal.contingency_period_days IS 'Permit/contingency period in days for lease deals. Used for payment date estimation.';

ALTER TABLE deal ADD COLUMN IF NOT EXISTS rent_commencement_days INTEGER;
COMMENT ON COLUMN deal.rent_commencement_days IS 'Days from lease execution to rent commencement. Default 180 if not entered.';

-- Timeline period fields for purchases
ALTER TABLE deal ADD COLUMN IF NOT EXISTS due_diligence_days INTEGER;
COMMENT ON COLUMN deal.due_diligence_days IS 'Due diligence period in days for purchase deals.';

ALTER TABLE deal ADD COLUMN IF NOT EXISTS closing_deadline_days INTEGER DEFAULT 30;
COMMENT ON COLUMN deal.closing_deadline_days IS 'Days after due diligence to closing for purchases. Default 30.';

-- Estimated execution date (calculated but overrideable)
ALTER TABLE deal ADD COLUMN IF NOT EXISTS estimated_execution_date DATE;
COMMENT ON COLUMN deal.estimated_execution_date IS 'Estimated lease/contract execution date. Auto-calculated but broker can override.';

-- Behind schedule tracking
ALTER TABLE deal ADD COLUMN IF NOT EXISTS is_behind_schedule BOOLEAN DEFAULT FALSE;
COMMENT ON COLUMN deal.is_behind_schedule IS 'True when deal exceeds expected stage duration. Turns kanban card pink.';

ALTER TABLE deal ADD COLUMN IF NOT EXISTS weeks_behind INTEGER DEFAULT 0;
COMMENT ON COLUMN deal.weeks_behind IS 'Number of weeks the deal is behind expected schedule.';

-- LOI date (clock start for deal timeline)
ALTER TABLE deal ADD COLUMN IF NOT EXISTS loi_date DATE;
COMMENT ON COLUMN deal.loi_date IS 'Date LOI was written/sent. From site submit. Clock start for deal velocity.';

-- Index for behind schedule queries
CREATE INDEX IF NOT EXISTS idx_deal_behind_schedule ON deal(is_behind_schedule) WHERE is_behind_schedule = TRUE;

-- =====================================================
-- 2. PAYMENT TABLE - Auto-Calculation Tracking
-- =====================================================

ALTER TABLE payment ADD COLUMN IF NOT EXISTS payment_date_auto_calculated DATE;
COMMENT ON COLUMN payment.payment_date_auto_calculated IS 'System-calculated estimated payment date based on deal velocity and timeline.';

ALTER TABLE payment ADD COLUMN IF NOT EXISTS payment_date_source TEXT DEFAULT 'auto';
COMMENT ON COLUMN payment.payment_date_source IS 'Source of payment_date_estimated: auto, broker_override, or critical_date.';

-- Constraint for valid source values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'payment_date_source_check'
  ) THEN
    ALTER TABLE payment ADD CONSTRAINT payment_date_source_check
      CHECK (payment_date_source IN ('auto', 'broker_override', 'critical_date'));
  END IF;
END $$;

-- =====================================================
-- 3. CLIENT TABLE - Velocity Overrides
-- =====================================================

ALTER TABLE client ADD COLUMN IF NOT EXISTS velocity_loi_days_override INTEGER;
COMMENT ON COLUMN client.velocity_loi_days_override IS 'Override default LOI stage duration for this client (days).';

ALTER TABLE client ADD COLUMN IF NOT EXISTS velocity_lease_psa_days_override INTEGER;
COMMENT ON COLUMN client.velocity_lease_psa_days_override IS 'Override default At Lease/PSA stage duration for this client (days).';

-- =====================================================
-- 4. APP SETTINGS - Forecasting Defaults
-- =====================================================

-- Insert default forecasting settings (ignore if already exist)
INSERT INTO app_settings (key, value, description)
VALUES
  ('velocity_loi_days_default', '30', 'Default duration in days for Negotiating LOI stage'),
  ('velocity_lease_psa_days_default', '45', 'Default duration in days for At Lease/PSA stage'),
  ('default_rent_commencement_days', '180', 'Default rent commencement period in days when not specified'),
  ('default_closing_deadline_days', '30', 'Default closing deadline in days after due diligence for purchases'),
  ('velocity_min_deals_for_historical', '5', 'Minimum closed deals required to use client historical velocity'),
  ('behind_schedule_threshold_days', '7', 'Days over expected stage duration before marking deal as behind schedule'),
  ('friday_email_recipients', '[]', 'JSON array of user IDs to receive Friday CFO summary email')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- 5. VIEW: Client Velocity Statistics
-- =====================================================

CREATE OR REPLACE VIEW client_velocity_stats AS
WITH stage_durations AS (
  SELECT
    dsh.client_id,
    ds.label AS stage_label,
    dsh.duration_seconds,
    dsh.duration_seconds / 86400.0 AS duration_days
  FROM deal_stage_history dsh
  JOIN deal_stage ds ON ds.id = dsh.to_stage_id
  WHERE dsh.duration_seconds IS NOT NULL
    AND dsh.duration_seconds > 0
    AND ds.label IN ('Negotiating LOI', 'At Lease / PSA')
),
client_stats AS (
  SELECT
    client_id,
    stage_label,
    COUNT(*) AS deal_count,
    AVG(duration_days) AS avg_days,
    MIN(duration_days) AS min_days,
    MAX(duration_days) AS max_days
  FROM stage_durations
  GROUP BY client_id, stage_label
)
SELECT
  c.id AS client_id,
  c.client_name AS client_name,
  -- LOI stats
  COALESCE(loi.deal_count, 0) AS loi_deal_count,
  ROUND(loi.avg_days::numeric, 1) AS loi_avg_days,
  ROUND(loi.min_days::numeric, 1) AS loi_min_days,
  ROUND(loi.max_days::numeric, 1) AS loi_max_days,
  -- At Lease/PSA stats
  COALESCE(psa.deal_count, 0) AS lease_psa_deal_count,
  ROUND(psa.avg_days::numeric, 1) AS lease_psa_avg_days,
  ROUND(psa.min_days::numeric, 1) AS lease_psa_min_days,
  ROUND(psa.max_days::numeric, 1) AS lease_psa_max_days,
  -- Overrides from client table
  c.velocity_loi_days_override,
  c.velocity_lease_psa_days_override
FROM client c
LEFT JOIN client_stats loi ON loi.client_id = c.id AND loi.stage_label = 'Negotiating LOI'
LEFT JOIN client_stats psa ON psa.client_id = c.id AND psa.stage_label = 'At Lease / PSA';

COMMENT ON VIEW client_velocity_stats IS 'Historical velocity statistics per client for LOI and At Lease/PSA stages. Used for payment date estimation.';

-- =====================================================
-- 6. VIEW: Deal Forecasting Summary
-- =====================================================

CREATE OR REPLACE VIEW deal_forecasting_summary AS
SELECT
  d.id AS deal_id,
  d.deal_name,
  d.stage_id,
  ds.label AS stage_label,
  d.client_id,
  c.client_name AS client_name,
  d.owner_id,
  dt.label AS deal_type,
  -- Timeline inputs
  d.loi_date,
  d.loi_signed_date,
  d.contract_signed_date,
  d.contingency_period_days,
  d.rent_commencement_days,
  d.due_diligence_days,
  d.closing_deadline_days,
  d.estimated_execution_date,
  -- Behind schedule status
  d.is_behind_schedule,
  d.weeks_behind,
  -- Current stage duration
  EXTRACT(DAY FROM NOW() - COALESCE(d.last_stage_change_at, d.created_at))::INTEGER AS days_in_current_stage,
  -- Deal value
  d.fee,
  d.number_of_payments
FROM deal d
JOIN deal_stage ds ON ds.id = d.stage_id
LEFT JOIN client c ON c.id = d.client_id
LEFT JOIN deal_type dt ON dt.id = d.deal_type_id
WHERE ds.label NOT IN ('Lost', 'Closed Paid');

COMMENT ON VIEW deal_forecasting_summary IS 'Summary view of pipeline deals with forecasting-relevant fields for CFO Agent tools.';

-- =====================================================
-- 7. FUNCTION: Get Effective Velocity for Stage
-- =====================================================

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
BEGIN
  -- Get minimum deals threshold from app_settings
  SELECT COALESCE(value::INTEGER, 5) INTO v_min_deals
  FROM app_settings WHERE key = 'velocity_min_deals_for_historical';

  -- Check client override first
  IF p_stage_label = 'Negotiating LOI' THEN
    SELECT velocity_loi_days_override INTO v_client_override
    FROM client WHERE id = p_client_id;

    -- Get global default
    SELECT COALESCE(value::INTEGER, 30) INTO v_global_default
    FROM app_settings WHERE key = 'velocity_loi_days_default';

    -- Get historical average
    SELECT loi_deal_count, loi_avg_days INTO v_historical_count, v_historical_avg
    FROM client_velocity_stats WHERE client_id = p_client_id;

  ELSIF p_stage_label = 'At Lease / PSA' THEN
    SELECT velocity_lease_psa_days_override INTO v_client_override
    FROM client WHERE id = p_client_id;

    -- Get global default
    SELECT COALESCE(value::INTEGER, 45) INTO v_global_default
    FROM app_settings WHERE key = 'velocity_lease_psa_days_default';

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

-- =====================================================
-- 8. FUNCTION: Calculate Estimated Payment Dates
-- =====================================================

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

  v_deal_type := COALESCE(v_deal.deal_type_label, 'Lease');

  -- Get effective velocities
  v_loi_velocity := get_effective_velocity(v_deal.client_id, 'Negotiating LOI');
  v_psa_velocity := get_effective_velocity(v_deal.client_id, 'At Lease / PSA');

  -- Determine anchor date and calculate execution date based on current stage
  IF v_deal.stage_label = 'Negotiating LOI' THEN
    v_anchor_date := COALESCE(v_deal.loi_date, v_deal.created_at::DATE);
    v_execution_date := v_anchor_date + v_loi_velocity + v_psa_velocity;
    v_notes := format('LOI date + %s days (LOI) + %s days (PSA)', v_loi_velocity, v_psa_velocity);

  ELSIF v_deal.stage_label = 'At Lease / PSA' THEN
    v_anchor_date := COALESCE(v_deal.loi_signed_date, v_deal.last_stage_change_at::DATE, v_deal.created_at::DATE);
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

  -- Get period defaults
  v_contingency_days := COALESCE(v_deal.contingency_period_days, 0);

  SELECT COALESCE(value::INTEGER, 180) INTO v_rent_commencement_days
  FROM app_settings WHERE key = 'default_rent_commencement_days';
  v_rent_commencement_days := COALESCE(v_deal.rent_commencement_days, v_rent_commencement_days);

  v_due_diligence_days := COALESCE(v_deal.due_diligence_days, 0);

  SELECT COALESCE(value::INTEGER, 30) INTO v_closing_deadline_days
  FROM app_settings WHERE key = 'default_closing_deadline_days';
  v_closing_deadline_days := COALESCE(v_deal.closing_deadline_days, v_closing_deadline_days);

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

-- =====================================================
-- 9. FUNCTION: Update Behind Schedule Status
-- =====================================================

CREATE OR REPLACE FUNCTION update_behind_schedule_status()
RETURNS void AS $$
DECLARE
  v_threshold INTEGER;
  v_deal RECORD;
  v_expected_days INTEGER;
  v_actual_days INTEGER;
  v_weeks_behind INTEGER;
BEGIN
  -- Get threshold from settings
  SELECT COALESCE(value::INTEGER, 7) INTO v_threshold
  FROM app_settings WHERE key = 'behind_schedule_threshold_days';

  -- Check each active pipeline deal
  FOR v_deal IN
    SELECT
      d.id,
      d.client_id,
      ds.label AS stage_label,
      EXTRACT(DAY FROM NOW() - COALESCE(d.last_stage_change_at, d.created_at))::INTEGER AS days_in_stage
    FROM deal d
    JOIN deal_stage ds ON ds.id = d.stage_id
    WHERE ds.label IN ('Negotiating LOI', 'At Lease / PSA')
  LOOP
    -- Get expected days for this stage
    v_expected_days := get_effective_velocity(v_deal.client_id, v_deal.stage_label);
    v_actual_days := v_deal.days_in_stage;

    -- Calculate weeks behind
    IF v_actual_days > (v_expected_days + v_threshold) THEN
      v_weeks_behind := ((v_actual_days - v_expected_days) / 7)::INTEGER;
      IF v_weeks_behind < 1 THEN v_weeks_behind := 1; END IF;

      UPDATE deal
      SET is_behind_schedule = TRUE,
          weeks_behind = v_weeks_behind
      WHERE id = v_deal.id;
    ELSE
      UPDATE deal
      SET is_behind_schedule = FALSE,
          weeks_behind = 0
      WHERE id = v_deal.id;
    END IF;
  END LOOP;

  -- Reset deals not in tracked stages
  UPDATE deal d
  SET is_behind_schedule = FALSE, weeks_behind = 0
  FROM deal_stage ds
  WHERE d.stage_id = ds.id
    AND ds.label NOT IN ('Negotiating LOI', 'At Lease / PSA')
    AND d.is_behind_schedule = TRUE;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION update_behind_schedule_status IS 'Updates is_behind_schedule and weeks_behind for all pipeline deals. Run periodically.';

-- =====================================================
-- 10. TRIGGER: Update Payment Source on Manual Edit
-- =====================================================

CREATE OR REPLACE FUNCTION track_payment_date_source()
RETURNS TRIGGER AS $$
BEGIN
  -- If payment_date_estimated is being changed and it differs from auto-calculated
  IF NEW.payment_date_estimated IS DISTINCT FROM OLD.payment_date_estimated THEN
    -- If user is setting a different date than auto-calculated, mark as override
    IF NEW.payment_date_estimated IS DISTINCT FROM NEW.payment_date_auto_calculated THEN
      NEW.payment_date_source := 'broker_override';
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_track_payment_date_source ON payment;
CREATE TRIGGER trigger_track_payment_date_source
  BEFORE UPDATE ON payment
  FOR EACH ROW
  EXECUTE FUNCTION track_payment_date_source();

COMMENT ON FUNCTION track_payment_date_source IS 'Tracks when broker manually overrides payment estimated date.';

-- =====================================================
-- 11. SUMMARY
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Deal Forecasting System Migration Complete';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'New deal fields:';
  RAISE NOTICE '  - contingency_period_days';
  RAISE NOTICE '  - rent_commencement_days';
  RAISE NOTICE '  - due_diligence_days';
  RAISE NOTICE '  - closing_deadline_days';
  RAISE NOTICE '  - estimated_execution_date';
  RAISE NOTICE '  - is_behind_schedule';
  RAISE NOTICE '  - weeks_behind';
  RAISE NOTICE '  - loi_date';
  RAISE NOTICE '';
  RAISE NOTICE 'New payment fields:';
  RAISE NOTICE '  - payment_date_auto_calculated';
  RAISE NOTICE '  - payment_date_source';
  RAISE NOTICE '';
  RAISE NOTICE 'New client fields:';
  RAISE NOTICE '  - velocity_loi_days_override';
  RAISE NOTICE '  - velocity_lease_psa_days_override';
  RAISE NOTICE '';
  RAISE NOTICE 'New views:';
  RAISE NOTICE '  - client_velocity_stats';
  RAISE NOTICE '  - deal_forecasting_summary';
  RAISE NOTICE '';
  RAISE NOTICE 'New functions:';
  RAISE NOTICE '  - get_effective_velocity(client_id, stage_label)';
  RAISE NOTICE '  - calculate_payment_estimates(deal_id)';
  RAISE NOTICE '  - update_behind_schedule_status()';
  RAISE NOTICE '';
  RAISE NOTICE 'App settings added for forecasting defaults.';
  RAISE NOTICE '==========================================';
END $$;
