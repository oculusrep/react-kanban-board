-- Fix AGCI and broker splits to recalculate proportionally when payment amount is overridden
--
-- Problem: When a payment amount is overridden, AGCI and broker splits were still calculated
-- based on the original split (deal.agci / number_of_payments), not proportional to the new amount.
--
-- Solution: Calculate AGCI and broker splits proportionally based on the ratio of:
-- (payment_amount / calculated_base_amount) * (deal.agci / number_of_payments)

-- =====================================================
-- Update calculate_payment_fields to use proportional AGCI
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_payment_fields()
RETURNS TRIGGER AS $function$
DECLARE
    d RECORD;
    calculated_payment_amount NUMERIC;
    agci_proportion NUMERIC;
BEGIN
    -- Fetch deal values needed for calculations
    SELECT
        fee,
        number_of_payments,
        agci,
        referral_fee_percent
    INTO d
    FROM deal
    WHERE id = NEW.deal_id;

    -- Protect against null or zero payments
    IF d.number_of_payments IS NULL OR d.number_of_payments = 0 THEN
        RAISE EXCEPTION 'deal.number_of_payments is null or zero for deal_id %', NEW.deal_id;
    END IF;

    -- Calculate what the payment amount would be without override
    calculated_payment_amount := d.fee / d.number_of_payments;

    -- Only recalculate payment_amount if NOT overridden
    IF NEW.amount_override IS NOT TRUE THEN
        NEW.payment_amount := calculated_payment_amount;
    END IF;

    -- Calculate AGCI proportionally
    -- If payment amount is overridden, scale AGCI proportionally to the override
    -- Formula: (actual_payment_amount / calculated_payment_amount) * (deal.agci / number_of_payments)
    IF calculated_payment_amount > 0 THEN
        agci_proportion := NEW.payment_amount / calculated_payment_amount;
        NEW.agci := (d.agci / d.number_of_payments) * agci_proportion;
    ELSE
        NEW.agci := d.agci / d.number_of_payments;
    END IF;

    -- Calculate referral_fee_usd using override if provided (already proportional to payment_amount)
    NEW.referral_fee_usd := COALESCE(NEW.referral_fee_percent_override, d.referral_fee_percent) * NEW.payment_amount;

    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

-- =====================================================
-- Update calculate_payment_amounts to use proportional AGCI
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_payment_amounts()
RETURNS TRIGGER AS $function$
DECLARE
    deal_rec RECORD;
    calculated_payment_amount NUMERIC;
    agci_proportion NUMERIC;
BEGIN
    -- Get deal information
    SELECT fee, agci, number_of_payments, referral_fee_percent
    INTO deal_rec
    FROM deal
    WHERE id = NEW.deal_id;

    -- Calculate what the payment amount would be without override
    calculated_payment_amount := deal_rec.fee / deal_rec.number_of_payments;

    -- Only recalculate payment_amount if NOT overridden
    IF NEW.amount_override IS NOT TRUE THEN
        NEW.payment_amount = calculated_payment_amount;
    END IF;

    -- Calculate AGCI proportionally
    -- If payment amount is overridden, scale AGCI proportionally to the override
    IF calculated_payment_amount > 0 THEN
        agci_proportion := NEW.payment_amount / calculated_payment_amount;
        NEW.agci = (deal_rec.agci / deal_rec.number_of_payments) * agci_proportion;
    ELSE
        NEW.agci = deal_rec.agci / deal_rec.number_of_payments;
    END IF;

    -- Calculate referral fee (with override capability, already proportional to payment_amount)
    NEW.referral_fee_usd = COALESCE(NEW.referral_fee_percent_override, deal_rec.referral_fee_percent) * NEW.payment_amount / 100;

    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

-- =====================================================
-- Create trigger to update payment_splits when payment amount changes
-- =====================================================
CREATE OR REPLACE FUNCTION recalculate_payment_splits_on_amount_change()
RETURNS TRIGGER AS $function$
BEGIN
    -- Only recalculate if payment_amount changed (including when override is set)
    IF NEW.payment_amount IS DISTINCT FROM OLD.payment_amount THEN
        -- Update all payment_split records for this payment
        -- Recalculate dollar amounts based on new payment amount and existing percentages
        UPDATE payment_split
        SET
            split_origination_usd = (NEW.payment_amount * COALESCE(split_origination_percent, 0) / 100),
            split_site_usd = (NEW.payment_amount * COALESCE(split_site_percent, 0) / 100),
            split_deal_usd = (NEW.payment_amount * COALESCE(split_deal_percent, 0) / 100),
            split_broker_total = (
                (NEW.payment_amount * COALESCE(split_origination_percent, 0) / 100) +
                (NEW.payment_amount * COALESCE(split_site_percent, 0) / 100) +
                (NEW.payment_amount * COALESCE(split_deal_percent, 0) / 100)
            )
        WHERE payment_id = NEW.id;

        RAISE NOTICE 'Recalculated payment splits for payment % based on new amount %', NEW.id, NEW.payment_amount;
    END IF;

    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS trigger_recalculate_splits_on_payment_amount_change ON payment;

-- Create AFTER UPDATE trigger on payment table
CREATE TRIGGER trigger_recalculate_splits_on_payment_amount_change
    AFTER UPDATE ON payment
    FOR EACH ROW
    WHEN (NEW.payment_amount IS DISTINCT FROM OLD.payment_amount)
    EXECUTE FUNCTION recalculate_payment_splits_on_amount_change();

COMMENT ON FUNCTION calculate_payment_fields() IS 'Calculates payment fields. Respects amount_override flag. AGCI scales proportionally with overridden payment amounts.';
COMMENT ON FUNCTION calculate_payment_amounts() IS 'Calculates payment amounts. Respects amount_override flag. AGCI scales proportionally with overridden payment amounts.';
COMMENT ON FUNCTION recalculate_payment_splits_on_amount_change() IS 'Recalculates broker commission splits when payment_amount changes (including overrides). Maintains percentage splits but recalculates dollar amounts.';
