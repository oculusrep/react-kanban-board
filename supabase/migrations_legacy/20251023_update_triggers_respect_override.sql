-- Update payment triggers to respect amount_override flag
-- Payments with amount_override = true should not have their amounts auto-recalculated

-- Update the auto_update_payment_amounts_on_deal_change function
CREATE OR REPLACE FUNCTION auto_update_payment_amounts_on_deal_change()
RETURNS TRIGGER AS $$
DECLARE
  v_num_payments INTEGER;
  v_current_payment_count INTEGER;
  v_payment_amount NUMERIC(12,2);
  v_payment_sequence INTEGER;
  v_new_payment_id UUID;
  v_commission_split RECORD;
BEGIN
  IF TG_OP = 'UPDATE' THEN
    v_num_payments := COALESCE(NEW.number_of_payments, 0);

    SELECT COUNT(*)
    INTO v_current_payment_count
    FROM payment
    WHERE deal_id = NEW.id
      AND is_active = true;  -- Only count active payments

    -- If fee changed, update amounts for unlocked payments WITHOUT override
    IF NEW.fee IS DISTINCT FROM OLD.fee AND NEW.fee IS NOT NULL AND NEW.fee > 0 THEN
      v_payment_amount := NEW.fee / v_num_payments;

      UPDATE payment
      SET payment_amount = v_payment_amount
      WHERE deal_id = NEW.id
        AND locked = false
        AND (amount_override = false OR amount_override IS NULL);  -- NEW: Skip overridden payments

      RAISE NOTICE 'Updated payment amounts for deal % to % (skipped overridden payments)', NEW.id, v_payment_amount;
    END IF;

    -- If number_of_payments changed, add or remove payments
    IF NEW.number_of_payments IS DISTINCT FROM OLD.number_of_payments THEN
      v_payment_amount := NEW.fee / v_num_payments;

      -- Add new payments if we need more
      IF v_current_payment_count < v_num_payments THEN
        FOR v_payment_sequence IN (v_current_payment_count + 1)..v_num_payments LOOP
          INSERT INTO payment (
            deal_id,
            payment_sequence,
            payment_amount,
            locked,
            amount_override  -- NEW: Ensure new payments default to false
          ) VALUES (
            NEW.id,
            v_payment_sequence,
            v_payment_amount,
            false,
            false
          ) RETURNING id INTO v_new_payment_id;

          -- Create payment splits for this new payment based on commission splits
          FOR v_commission_split IN
            SELECT id, broker_id, split_origination_percent, split_site_percent, split_deal_percent
            FROM commission_split
            WHERE deal_id = NEW.id
          LOOP
            INSERT INTO payment_split (
              payment_id,
              broker_id,
              commission_split_id,
              split_origination_percent,
              split_site_percent,
              split_deal_percent
            ) VALUES (
              v_new_payment_id,
              v_commission_split.broker_id,
              v_commission_split.id,
              v_commission_split.split_origination_percent,
              v_commission_split.split_site_percent,
              v_commission_split.split_deal_percent
            );
          END LOOP;

        END LOOP;
        RAISE NOTICE 'Added % new payments with splits for deal %', (v_num_payments - v_current_payment_count), NEW.id;

      -- Archive excess payments if we have too many (only unlocked ones)
      ELSIF v_current_payment_count > v_num_payments THEN
        -- First, delete payment splits for payments that will be archived
        DELETE FROM payment_split
        WHERE payment_id IN (
          SELECT id FROM payment
          WHERE deal_id = NEW.id
            AND payment_sequence > v_num_payments
            AND locked = false
            AND is_active = true
        );

        -- Then archive the payments
        UPDATE payment
        SET is_active = false,
            deleted_at = NOW()
        WHERE deal_id = NEW.id
          AND payment_sequence > v_num_payments
          AND locked = false
          AND is_active = true;

        RAISE NOTICE 'Archived % excess payments for deal %', (v_current_payment_count - v_num_payments), NEW.id;
      END IF;

      -- Update payment amounts for existing unlocked payments WITHOUT override
      UPDATE payment
      SET payment_amount = v_payment_amount
      WHERE deal_id = NEW.id
        AND locked = false
        AND is_active = true
        AND (amount_override = false OR amount_override IS NULL);  -- NEW: Skip overridden payments

      RAISE NOTICE 'Updated existing payment amounts for deal % (skipped overridden payments)', NEW.id;
    END IF;
  END IF;

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Add comment
COMMENT ON FUNCTION auto_update_payment_amounts_on_deal_change() IS
'Auto-updates payment amounts when deal fee or number_of_payments changes. Respects amount_override flag - payments with amount_override=true are never recalculated.';
