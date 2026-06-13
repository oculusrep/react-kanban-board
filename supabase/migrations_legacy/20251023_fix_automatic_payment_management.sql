-- Fix automatic payment management triggers to use correct AGCI-based formula
--
-- PROBLEM: Two triggers were calculating broker splits incorrectly using payment_amount:
-- 1. auto_update_payment_splits_on_commission_change (AFTER UPDATE on commission_split)
-- 2. auto_create_payment_splits_on_payment_insert (AFTER INSERT on payment)
--
-- CORRECT FORMULA:
-- 1. Calculate payment category amounts from payment.agci and deal category percentages
-- 2. Apply broker split percentages to payment category amounts

-- =====================================================
-- FIX TRIGGER 4: Auto-update payment splits when commission percentages change
-- =====================================================
CREATE OR REPLACE FUNCTION auto_update_payment_splits_on_commission_change()
RETURNS TRIGGER AS $$
DECLARE
  payment_rec RECORD;
  deal_rec RECORD;
  payment_origination_usd NUMERIC;
  payment_site_usd NUMERIC;
  payment_deal_usd NUMERIC;
BEGIN
  -- Only proceed if percentages changed
  IF (NEW.split_origination_percent IS DISTINCT FROM OLD.split_origination_percent) OR
     (NEW.split_site_percent IS DISTINCT FROM OLD.split_site_percent) OR
     (NEW.split_deal_percent IS DISTINCT FROM OLD.split_deal_percent) THEN

    -- Get deal category percentages
    SELECT
      COALESCE(origination_percent, 0) as origination_percent,
      COALESCE(site_percent, 0) as site_percent,
      COALESCE(deal_percent, 0) as deal_percent
    INTO deal_rec
    FROM deal
    WHERE id = NEW.deal_id;

    -- Update all payment splits for this broker on this deal's unlocked payments
    FOR payment_rec IN
      SELECT id, agci
      FROM payment
      WHERE deal_id = NEW.deal_id
        AND locked = false
    LOOP
      -- Calculate payment-level category amounts based on deal percentages and payment AGCI
      payment_origination_usd := (deal_rec.origination_percent / 100) * payment_rec.agci;
      payment_site_usd := (deal_rec.site_percent / 100) * payment_rec.agci;
      payment_deal_usd := (deal_rec.deal_percent / 100) * payment_rec.agci;

      -- Update this payment's splits for this broker
      UPDATE payment_split
      SET
        split_origination_percent = NEW.split_origination_percent,
        split_site_percent = NEW.split_site_percent,
        split_deal_percent = NEW.split_deal_percent,
        -- Calculate dollar amounts based on payment AGCI category amounts
        split_origination_usd = (payment_origination_usd * COALESCE(NEW.split_origination_percent, 0) / 100),
        split_site_usd = (payment_site_usd * COALESCE(NEW.split_site_percent, 0) / 100),
        split_deal_usd = (payment_deal_usd * COALESCE(NEW.split_deal_percent, 0) / 100),
        split_broker_total = (
          (payment_origination_usd * COALESCE(NEW.split_origination_percent, 0) / 100) +
          (payment_site_usd * COALESCE(NEW.split_site_percent, 0) / 100) +
          (payment_deal_usd * COALESCE(NEW.split_deal_percent, 0) / 100)
        )
      WHERE payment_id = payment_rec.id
        AND broker_id = NEW.broker_id;
    END LOOP;

    RAISE NOTICE 'Updated payment splits for broker % on deal %', NEW.broker_id, NEW.deal_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- FIX TRIGGER 5: Auto-create payment splits when payment is created
-- =====================================================
CREATE OR REPLACE FUNCTION auto_create_payment_splits_on_payment_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_commission_split RECORD;
  v_deal RECORD;
  payment_origination_usd NUMERIC;
  payment_site_usd NUMERIC;
  payment_deal_usd NUMERIC;
BEGIN
  -- Get deal category percentages
  SELECT
    COALESCE(origination_percent, 0) as origination_percent,
    COALESCE(site_percent, 0) as site_percent,
    COALESCE(deal_percent, 0) as deal_percent
  INTO v_deal
  FROM deal
  WHERE id = NEW.deal_id;

  -- Calculate payment-level category amounts based on deal percentages and payment AGCI
  payment_origination_usd := (v_deal.origination_percent / 100) * NEW.agci;
  payment_site_usd := (v_deal.site_percent / 100) * NEW.agci;
  payment_deal_usd := (v_deal.deal_percent / 100) * NEW.agci;

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
      -- Calculate dollar amounts based on payment AGCI category amounts
      (payment_origination_usd * COALESCE(v_commission_split.split_origination_percent, 0) / 100),
      (payment_site_usd * COALESCE(v_commission_split.split_site_percent, 0) / 100),
      (payment_deal_usd * COALESCE(v_commission_split.split_deal_percent, 0) / 100),
      -- Calculate total
      (
        (payment_origination_usd * COALESCE(v_commission_split.split_origination_percent, 0) / 100) +
        (payment_site_usd * COALESCE(v_commission_split.split_site_percent, 0) / 100) +
        (payment_deal_usd * COALESCE(v_commission_split.split_deal_percent, 0) / 100)
      ),
      false
    );
  END LOOP;

  RAISE NOTICE 'Auto-created payment splits for payment %', NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION auto_update_payment_splits_on_commission_change() IS 'Updates payment splits when commission split percentages change. Uses correct AGCI-based formula: (deal_category_percent × payment.agci) × broker_split_percent.';
COMMENT ON FUNCTION auto_create_payment_splits_on_payment_insert() IS 'Creates payment splits when a new payment is created. Uses correct AGCI-based formula: (deal_category_percent × payment.agci) × broker_split_percent.';
