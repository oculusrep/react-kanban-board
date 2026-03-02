-- =====================================================
-- AUTO-CALCULATE PAYMENT DATES ON INSERT
-- =====================================================
-- When new payments are generated, automatically calculate
-- the estimated payment dates based on deal velocity and timeline.
--
-- This fixes the issue where generating payments clears
-- the forecasted estimated payment dates.
-- =====================================================

-- Trigger function: auto-calculate payment dates AFTER insert
-- We need AFTER INSERT because calculate_payment_estimates needs
-- the payment row to exist in the database
CREATE OR REPLACE FUNCTION auto_calculate_payment_dates_after_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_estimate RECORD;
BEGIN
  -- Get the calculated estimate for this payment
  SELECT estimated_date, calculation_notes INTO v_estimate
  FROM calculate_payment_estimates(NEW.deal_id)
  WHERE payment_id = NEW.id;

  -- Only update if we got an estimate and payment_date_estimated is not already set
  IF v_estimate.estimated_date IS NOT NULL THEN
    UPDATE payment
    SET
      payment_date_estimated = COALESCE(payment_date_estimated, v_estimate.estimated_date),
      payment_date_auto_calculated = v_estimate.estimated_date,
      payment_date_source = COALESCE(payment_date_source, 'auto')
    WHERE id = NEW.id
      AND payment_date_estimated IS NULL;  -- Only if not already set

    RAISE NOTICE 'Auto-calculated payment date for payment %: %', NEW.id, v_estimate.estimated_date;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if exists
DROP TRIGGER IF EXISTS trigger_auto_calculate_payment_dates ON payment;

-- Create AFTER INSERT trigger
CREATE TRIGGER trigger_auto_calculate_payment_dates
  AFTER INSERT ON payment
  FOR EACH ROW
  EXECUTE FUNCTION auto_calculate_payment_dates_after_insert();

COMMENT ON FUNCTION auto_calculate_payment_dates_after_insert IS 'Auto-calculates payment_date_estimated when new payments are created based on deal velocity and timeline.';

-- =====================================================
-- Also add a function to recalculate dates for existing payments
-- This can be called manually or by other triggers
-- =====================================================

CREATE OR REPLACE FUNCTION recalculate_payment_dates_for_deal(p_deal_id UUID)
RETURNS void AS $$
DECLARE
  v_estimate RECORD;
BEGIN
  -- For each calculated estimate, update the payment if not manually overridden
  FOR v_estimate IN
    SELECT * FROM calculate_payment_estimates(p_deal_id)
  LOOP
    UPDATE payment
    SET
      payment_date_auto_calculated = v_estimate.estimated_date,
      -- Only update estimated date if source is 'auto' (not manually overridden)
      payment_date_estimated = CASE
        WHEN payment_date_source = 'auto' OR payment_date_source IS NULL
        THEN v_estimate.estimated_date
        ELSE payment_date_estimated
      END
    WHERE id = v_estimate.payment_id;

    RAISE NOTICE 'Recalculated date for payment % seq %: %',
      v_estimate.payment_id, v_estimate.payment_sequence, v_estimate.estimated_date;
  END LOOP;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION recalculate_payment_dates_for_deal IS 'Recalculates payment dates for all payments in a deal. Preserves manual overrides.';

-- =====================================================
-- SUMMARY
-- =====================================================

DO $$
BEGIN
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Auto Payment Date Calculation Migration';
  RAISE NOTICE '==========================================';
  RAISE NOTICE '';
  RAISE NOTICE 'New trigger:';
  RAISE NOTICE '  - trigger_auto_calculate_payment_dates (AFTER INSERT on payment)';
  RAISE NOTICE '';
  RAISE NOTICE 'New function:';
  RAISE NOTICE '  - recalculate_payment_dates_for_deal(deal_id)';
  RAISE NOTICE '';
  RAISE NOTICE 'What this fixes:';
  RAISE NOTICE '  - Newly generated payments now auto-get estimated dates';
  RAISE NOTICE '  - Manual date overrides are preserved when recalculating';
  RAISE NOTICE '==========================================';
END $$;
