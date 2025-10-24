-- ============================================================================
-- RESTORE ALL PAYMENT TRIGGERS
-- ============================================================================
-- This script restores all the triggers needed for the payment system to work:
-- 1. calculate_payment_agci_trigger - Calculates AGCI when payment amount changes
-- 2. update_broker_splits_trigger - Updates broker splits when AGCI changes
-- 3. trigger_auto_create_splits_on_payment - Creates payment splits when payment created
-- ============================================================================

-- ============================================================================
-- TRIGGER 1: Calculate Payment AGCI (BEFORE UPDATE/INSERT on payment)
-- ============================================================================
CREATE OR REPLACE FUNCTION calculate_payment_agci()
RETURNS TRIGGER AS $$
DECLARE
    v_referral_fee_percent NUMERIC;
    v_house_percent NUMERIC;
    v_payment_gci NUMERIC;
    v_house_split NUMERIC;
BEGIN
    RAISE NOTICE '🔵 calculate_payment_agci triggered for payment: %', NEW.id;

    -- Get deal percentages
    SELECT
        referral_fee_percent,
        house_percent
    INTO
        v_referral_fee_percent,
        v_house_percent
    FROM deal
    WHERE id = NEW.deal_id;

    RAISE NOTICE '🔵 Deal percentages - Referral Fee: %, House: %',
        v_referral_fee_percent, v_house_percent;

    -- Calculate Payment GCI = Payment Amount - (Payment Amount × Referral Fee %)
    v_payment_gci := NEW.payment_amount - (NEW.payment_amount * COALESCE(v_referral_fee_percent, 0) / 100);

    -- Calculate House Split = House Percent × Payment GCI
    v_house_split := COALESCE(v_house_percent, 0) / 100 * v_payment_gci;

    -- Calculate Payment AGCI = Payment GCI - House Split
    NEW.agci := v_payment_gci - v_house_split;

    -- Also update referral fee
    NEW.referral_fee_usd := NEW.payment_amount * COALESCE(v_referral_fee_percent, 0) / 100;

    RAISE NOTICE '✅ Payment AGCI calculated: % (Referral Fee: %)', NEW.agci, NEW.referral_fee_usd;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS calculate_payment_agci_trigger ON payment;

CREATE TRIGGER calculate_payment_agci_trigger
    BEFORE INSERT OR UPDATE OF payment_amount, amount_override
    ON payment
    FOR EACH ROW
    EXECUTE FUNCTION calculate_payment_agci();

COMMENT ON TRIGGER calculate_payment_agci_trigger ON payment IS
  'Calculates payment.agci and payment.referral_fee_usd whenever payment_amount changes';

-- ============================================================================
-- TRIGGER 2: Update Broker Splits (AFTER UPDATE/INSERT on payment)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_broker_splits_on_agci_change()
RETURNS TRIGGER AS $$
DECLARE
    v_origination_percent NUMERIC;
    v_site_percent NUMERIC;
    v_deal_percent NUMERIC;
    v_origination_total NUMERIC;
    v_site_total NUMERIC;
    v_deal_total NUMERIC;
    v_updated_count INTEGER;
BEGIN
    RAISE NOTICE '🔵 update_broker_splits_on_agci_change triggered for payment: %', NEW.id;

    -- Get deal category percentages
    SELECT
        origination_percent,
        site_percent,
        deal_percent
    INTO
        v_origination_percent,
        v_site_percent,
        v_deal_percent
    FROM deal
    WHERE id = NEW.deal_id;

    RAISE NOTICE '🔵 Deal category percentages - Orig: %, Site: %, Deal: %',
        v_origination_percent, v_site_percent, v_deal_percent;

    -- Calculate total amounts for each category from Payment AGCI
    v_origination_total := NEW.agci * COALESCE(v_origination_percent, 0) / 100;
    v_site_total := NEW.agci * COALESCE(v_site_percent, 0) / 100;
    v_deal_total := NEW.agci * COALESCE(v_deal_percent, 0) / 100;

    RAISE NOTICE '🔵 Category totals - Orig: %, Site: %, Deal: %',
        v_origination_total, v_site_total, v_deal_total;

    -- Update all broker splits for this payment
    UPDATE payment_split
    SET
        split_origination_usd = v_origination_total * COALESCE(split_origination_percent, 0) / 100,
        split_site_usd = v_site_total * COALESCE(split_site_percent, 0) / 100,
        split_deal_usd = v_deal_total * COALESCE(split_deal_percent, 0) / 100,
        split_broker_total = (
            (v_origination_total * COALESCE(split_origination_percent, 0) / 100) +
            (v_site_total * COALESCE(split_site_percent, 0) / 100) +
            (v_deal_total * COALESCE(split_deal_percent, 0) / 100)
        )
    WHERE payment_id = NEW.id;

    GET DIAGNOSTICS v_updated_count = ROW_COUNT;

    RAISE NOTICE '✅ Updated % broker splits for payment %', v_updated_count, NEW.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_broker_splits_trigger ON payment;

CREATE TRIGGER update_broker_splits_trigger
    AFTER INSERT OR UPDATE
    ON payment
    FOR EACH ROW
    EXECUTE FUNCTION update_broker_splits_on_agci_change();

COMMENT ON TRIGGER update_broker_splits_trigger ON payment IS
  'Updates all payment_split records when payment.agci changes';

-- ============================================================================
-- TRIGGER 3: Auto-create payment splits (AFTER INSERT on payment)
-- ============================================================================
CREATE OR REPLACE FUNCTION auto_create_payment_splits_on_payment_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_commission_split RECORD;
  v_deal_origination_percent NUMERIC;
  v_deal_site_percent NUMERIC;
  v_deal_deal_percent NUMERIC;
  v_payment_agci NUMERIC;
  v_origination_total NUMERIC;
  v_site_total NUMERIC;
  v_deal_total NUMERIC;
  v_split_count INTEGER := 0;
BEGIN
  RAISE NOTICE '🔵 auto_create_payment_splits_on_payment_insert triggered for payment: %', NEW.id;

  -- Get deal category percentages
  SELECT
    origination_percent,
    site_percent,
    deal_percent
  INTO
    v_deal_origination_percent,
    v_deal_site_percent,
    v_deal_deal_percent
  FROM deal
  WHERE id = NEW.deal_id;

  RAISE NOTICE '🔵 Deal percentages - Origination: %, Site: %, Deal: %',
    v_deal_origination_percent, v_deal_site_percent, v_deal_deal_percent;

  -- Use the payment AGCI (should already be calculated by calculate_payment_agci trigger)
  v_payment_agci := COALESCE(NEW.agci, 0);

  RAISE NOTICE '🔵 Payment AGCI: %', v_payment_agci;

  -- Calculate total amounts for each category from Payment AGCI
  v_origination_total := v_payment_agci * COALESCE(v_deal_origination_percent, 0) / 100;
  v_site_total := v_payment_agci * COALESCE(v_deal_site_percent, 0) / 100;
  v_deal_total := v_payment_agci * COALESCE(v_deal_deal_percent, 0) / 100;

  RAISE NOTICE '🔵 Category totals - Orig: %, Site: %, Deal: %',
    v_origination_total, v_site_total, v_deal_total;

  -- For each commission split on this deal, create a payment split
  FOR v_commission_split IN
    SELECT
      id,
      broker_id,
      split_origination_percent,
      split_site_percent,
      split_deal_percent
    FROM commission_split
    WHERE deal_id = NEW.deal_id
  LOOP
    RAISE NOTICE '🔵 Creating payment split for broker: %', v_commission_split.broker_id;

    INSERT INTO payment_split (
      payment_id,
      broker_id,
      split_origination_percent,
      split_site_percent,
      split_deal_percent,
      split_origination_usd,
      split_site_usd,
      split_deal_usd,
      split_broker_total,
      paid
    ) VALUES (
      NEW.id,
      v_commission_split.broker_id,
      v_commission_split.split_origination_percent,
      v_commission_split.split_site_percent,
      v_commission_split.split_deal_percent,
      -- Calculate dollar amounts based on category totals and broker percentages
      v_origination_total * COALESCE(v_commission_split.split_origination_percent, 0) / 100,
      v_site_total * COALESCE(v_commission_split.split_site_percent, 0) / 100,
      v_deal_total * COALESCE(v_commission_split.split_deal_percent, 0) / 100,
      -- Calculate total for this broker
      (v_origination_total * COALESCE(v_commission_split.split_origination_percent, 0) / 100) +
      (v_site_total * COALESCE(v_commission_split.split_site_percent, 0) / 100) +
      (v_deal_total * COALESCE(v_commission_split.split_deal_percent, 0) / 100),
      false
    );

    v_split_count := v_split_count + 1;
    RAISE NOTICE '✅ Payment split created for broker: %', v_commission_split.broker_id;
  END LOOP;

  RAISE NOTICE '✅ Auto-created % payment splits for payment %', v_split_count, NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_create_splits_on_payment ON payment;

CREATE TRIGGER trigger_auto_create_splits_on_payment
  AFTER INSERT ON payment
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_payment_splits_on_payment_insert();

COMMENT ON TRIGGER trigger_auto_create_splits_on_payment ON payment IS
  'Automatically creates payment_split records for each broker when a payment is created';

-- ============================================================================
-- Verification: Show all triggers on payment table
-- ============================================================================
SELECT
    trigger_name,
    action_timing || ' ' || event_manipulation as when_fires,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'payment'
  AND trigger_name IN (
    'calculate_payment_agci_trigger',
    'update_broker_splits_trigger',
    'trigger_auto_create_splits_on_payment'
  )
ORDER BY
  CASE action_timing
    WHEN 'BEFORE' THEN 1
    WHEN 'AFTER' THEN 2
  END,
  trigger_name;
