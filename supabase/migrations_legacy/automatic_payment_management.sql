-- =====================================================
-- AUTOMATIC PAYMENT MANAGEMENT SYSTEM
-- =====================================================
-- This migration creates a system where:
-- 1. Payments are automatically created when broker splits are added
-- 2. Payments automatically update when deal values change (unless locked)
-- 3. Payments automatically lock when marked as received
-- 4. Payment splits automatically recalculate when percentages change
-- =====================================================

-- Step 1: Add locked field to payment table
ALTER TABLE payment
ADD COLUMN IF NOT EXISTS locked BOOLEAN DEFAULT FALSE;

COMMENT ON COLUMN payment.locked IS 'When true, prevents automatic recalculation of payment amounts. Should be locked manually when cutting checks to brokers. Allows corrections to received payments before disbursement.';

CREATE INDEX IF NOT EXISTS idx_payment_locked ON payment(locked) WHERE locked = false;

-- =====================================================
-- REMOVED: Auto-lock on payment received
-- =====================================================
-- Decision: Manual lock only, triggered when disbursing to brokers
-- This allows corrections to received payments before disbursement
-- Lock should be set when cutting checks to brokers, not when receiving payment

-- =====================================================
-- TRIGGER 2: Auto-create payments when broker splits are created
-- =====================================================
CREATE OR REPLACE FUNCTION auto_create_payments_on_split_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_deal_id UUID;
  v_deal_fee NUMERIC;
  v_num_payments INTEGER;
  v_referral_fee NUMERIC;
  v_payment_amount NUMERIC;
  v_existing_payment_count INTEGER;
  v_payment_sequence INTEGER;
BEGIN
  -- Get the deal information
  SELECT
    cs.deal_id,
    d.fee,
    COALESCE(d.number_of_payments, 1) as num_payments,
    COALESCE(d.referral_fee_usd, 0) as referral_fee
  INTO v_deal_id, v_deal_fee, v_num_payments, v_referral_fee
  FROM commission_split cs
  JOIN deal d ON cs.deal_id = d.id
  WHERE cs.id = NEW.id;

  -- Check if payments already exist for this deal
  SELECT COUNT(*) INTO v_existing_payment_count
  FROM payment
  WHERE deal_id = v_deal_id;

  -- Only create payments if none exist yet
  IF v_existing_payment_count = 0 AND v_deal_fee IS NOT NULL AND v_deal_fee > 0 THEN
    -- Calculate payment amount per payment
    v_payment_amount := v_deal_fee / v_num_payments;

    -- Create the specified number of payments
    FOR v_payment_sequence IN 1..v_num_payments LOOP
      INSERT INTO payment (
        deal_id,
        payment_sequence,
        payment_amount,
        locked
      ) VALUES (
        v_deal_id,
        v_payment_sequence,
        v_payment_amount,
        false  -- Start unlocked
      );
    END LOOP;

    RAISE NOTICE 'Auto-created % payments for deal %', v_num_payments, v_deal_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_create_payments_on_split ON commission_split;
CREATE TRIGGER trigger_auto_create_payments_on_split
  AFTER INSERT ON commission_split
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_payments_on_split_insert();

-- =====================================================
-- TRIGGER 3: Auto-update unlocked payment amounts when deal.fee changes
-- =====================================================
CREATE OR REPLACE FUNCTION auto_update_payment_amounts_on_deal_change()
RETURNS TRIGGER AS $$
DECLARE
  v_payment_amount NUMERIC;
  v_num_payments INTEGER;
  v_current_payment_count INTEGER;
  v_payment_sequence INTEGER;
BEGIN
  -- Only proceed if fee or number_of_payments changed
  IF (NEW.fee IS DISTINCT FROM OLD.fee) OR
     (NEW.number_of_payments IS DISTINCT FROM OLD.number_of_payments) THEN

    v_num_payments := COALESCE(NEW.number_of_payments, 1);

    -- Get current payment count
    SELECT COUNT(*) INTO v_current_payment_count
    FROM payment
    WHERE deal_id = NEW.id;

    -- If fee changed, update amounts for unlocked payments
    IF NEW.fee IS DISTINCT FROM OLD.fee AND NEW.fee IS NOT NULL AND NEW.fee > 0 THEN
      v_payment_amount := NEW.fee / v_num_payments;

      UPDATE payment
      SET payment_amount = v_payment_amount
      WHERE deal_id = NEW.id
        AND locked = false;  -- Only update unlocked payments

      RAISE NOTICE 'Updated payment amounts for deal % to %', NEW.id, v_payment_amount;
    END IF;

    -- If number_of_payments changed, add or remove payments as needed
    IF NEW.number_of_payments IS DISTINCT FROM OLD.number_of_payments THEN
      v_payment_amount := COALESCE(NEW.fee, 0) / v_num_payments;

      -- Add missing payments if we need more
      IF v_current_payment_count < v_num_payments THEN
        FOR v_payment_sequence IN (v_current_payment_count + 1)..v_num_payments LOOP
          INSERT INTO payment (
            deal_id,
            payment_sequence,
            payment_amount,
            locked
          ) VALUES (
            NEW.id,
            v_payment_sequence,
            v_payment_amount,
            false
          );
        END LOOP;
        RAISE NOTICE 'Added % new payments for deal %', (v_num_payments - v_current_payment_count), NEW.id;

      -- Remove excess payments if we have too many (only unlocked ones)
      ELSIF v_current_payment_count > v_num_payments THEN
        DELETE FROM payment
        WHERE deal_id = NEW.id
          AND payment_sequence > v_num_payments
          AND locked = false;  -- Only delete unlocked payments

        RAISE NOTICE 'Removed excess unlocked payments for deal %', NEW.id;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_update_payments_on_deal_change ON deal;
CREATE TRIGGER trigger_auto_update_payments_on_deal_change
  AFTER UPDATE ON deal
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_payment_amounts_on_deal_change();

-- =====================================================
-- TRIGGER 4: Auto-update payment splits when commission percentages change
-- =====================================================
CREATE OR REPLACE FUNCTION auto_update_payment_splits_on_commission_change()
RETURNS TRIGGER AS $$
BEGIN
  -- Only proceed if percentages changed
  IF (NEW.split_origination_percent IS DISTINCT FROM OLD.split_origination_percent) OR
     (NEW.split_site_percent IS DISTINCT FROM OLD.split_site_percent) OR
     (NEW.split_deal_percent IS DISTINCT FROM OLD.split_deal_percent) THEN

    -- Update all payment splits for this broker on this deal's unlocked payments
    UPDATE payment_split ps
    SET
      split_origination_percent = NEW.split_origination_percent,
      split_site_percent = NEW.split_site_percent,
      split_deal_percent = NEW.split_deal_percent,
      -- Recalculate dollar amounts based on payment amount and new percentages
      split_origination_usd = (p.payment_amount * COALESCE(NEW.split_origination_percent, 0) / 100),
      split_site_usd = (p.payment_amount * COALESCE(NEW.split_site_percent, 0) / 100),
      split_deal_usd = (p.payment_amount * COALESCE(NEW.split_deal_percent, 0) / 100),
      split_broker_total = (
        (p.payment_amount * COALESCE(NEW.split_origination_percent, 0) / 100) +
        (p.payment_amount * COALESCE(NEW.split_site_percent, 0) / 100) +
        (p.payment_amount * COALESCE(NEW.split_deal_percent, 0) / 100)
      )
    FROM payment p
    WHERE ps.payment_id = p.id
      AND ps.broker_id = NEW.broker_id
      AND p.deal_id = NEW.deal_id
      AND p.locked = false;  -- Only update splits for unlocked payments

    RAISE NOTICE 'Updated payment splits for broker % on deal %', NEW.broker_id, NEW.deal_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_update_splits_on_commission_change ON commission_split;
CREATE TRIGGER trigger_auto_update_splits_on_commission_change
  AFTER UPDATE ON commission_split
  FOR EACH ROW
  EXECUTE FUNCTION auto_update_payment_splits_on_commission_change();

-- =====================================================
-- TRIGGER 5: Auto-create payment splits when payment is created
-- =====================================================
CREATE OR REPLACE FUNCTION auto_create_payment_splits_on_payment_insert()
RETURNS TRIGGER AS $$
DECLARE
  v_commission_split RECORD;
BEGIN
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
      -- Calculate dollar amounts
      (NEW.payment_amount * COALESCE(v_commission_split.split_origination_percent, 0) / 100),
      (NEW.payment_amount * COALESCE(v_commission_split.split_site_percent, 0) / 100),
      (NEW.payment_amount * COALESCE(v_commission_split.split_deal_percent, 0) / 100),
      -- Calculate total
      (
        (NEW.payment_amount * COALESCE(v_commission_split.split_origination_percent, 0) / 100) +
        (NEW.payment_amount * COALESCE(v_commission_split.split_site_percent, 0) / 100) +
        (NEW.payment_amount * COALESCE(v_commission_split.split_deal_percent, 0) / 100)
      ),
      false
    );
  END LOOP;

  RAISE NOTICE 'Auto-created payment splits for payment %', NEW.id;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_create_splits_on_payment ON payment;
CREATE TRIGGER trigger_auto_create_splits_on_payment
  AFTER INSERT ON payment
  FOR EACH ROW
  EXECUTE FUNCTION auto_create_payment_splits_on_payment_insert();

-- =====================================================
-- TRIGGER 6: Auto-lock payment when first broker is marked paid
-- =====================================================
-- This is optional - uncomment if you want payments to lock
-- automatically when you start disbursing to brokers
/*
CREATE OR REPLACE FUNCTION auto_lock_payment_on_first_disbursement()
RETURNS TRIGGER AS $$
BEGIN
  -- If this split is being marked as paid, lock the parent payment
  IF NEW.paid = true AND (OLD.paid IS NULL OR OLD.paid = false) THEN
    UPDATE payment
    SET locked = true
    WHERE id = NEW.payment_id
      AND locked = false;  -- Only lock if not already locked

    RAISE NOTICE 'Auto-locked payment % due to disbursement', NEW.payment_id;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_auto_lock_on_disbursement ON payment_split;
CREATE TRIGGER trigger_auto_lock_on_disbursement
  AFTER UPDATE ON payment_split
  FOR EACH ROW
  EXECUTE FUNCTION auto_lock_payment_on_first_disbursement();
*/

-- =====================================================
-- UTILITY FUNCTION: Manually unlock a payment
-- =====================================================
CREATE OR REPLACE FUNCTION unlock_payment(payment_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE payment
  SET locked = false
  WHERE id = payment_uuid;

  RAISE NOTICE 'Unlocked payment %', payment_uuid;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- UTILITY FUNCTION: Manually lock a payment
-- =====================================================
CREATE OR REPLACE FUNCTION lock_payment(payment_uuid UUID)
RETURNS VOID AS $$
BEGIN
  UPDATE payment
  SET locked = true
  WHERE id = payment_uuid;

  RAISE NOTICE 'Locked payment %', payment_uuid;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION lock_payment IS 'Manually lock a payment to prevent automatic updates. Should be called when cutting checks to brokers.';
COMMENT ON FUNCTION unlock_payment IS 'Manually unlock a payment to allow automatic updates. Use with caution if disbursements have been made.';
