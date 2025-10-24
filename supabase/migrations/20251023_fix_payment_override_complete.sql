-- Complete fix for payment amount override system
--
-- This migration ensures that when a payment amount is overridden:
-- 1. AGCI recalculates proportionally based on the override
-- 2. Broker splits recalculate based on the NEW AGCI using deal category percentages
--
-- CORRECT FLOW:
-- Payment Amount Override → AGCI (proportional) → Category Breakdown → Broker Splits
--
-- Example: Override payment from $13,080 to $9,810
-- 1. Original: payment_amount = $13,080, AGCI = $3,597
-- 2. Override: payment_amount = $9,810 (75% of original)
-- 3. AGCI: $3,597 × 75% = $2,697.75 (proportional scaling)
-- 4. Categories (50% Orig, 25% Site, 25% Deal):
--    - origination = $2,697.75 × 50% = $1,348.88
--    - site = $2,697.75 × 25% = $674.44
--    - deal = $2,697.75 × 25% = $674.44
-- 5. Broker Splits (100% on all):
--    - split_origination = $1,348.88 × 100% = $1,348.88
--    - split_site = $674.44 × 100% = $674.44
--    - split_deal = $674.44 × 100% = $674.44
--    - Total = $2,697.75

-- =====================================================
-- STEP 1: Fix AGCI calculation to be proportional
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
    NEW.referral_fee_usd := COALESCE(NEW.referral_fee_percent_override, d.referral_fee_percent) * NEW.payment_amount / 100;

    RAISE NOTICE 'Payment % AGCI calculated: % (proportion: %, override: %)',
        NEW.id, NEW.agci, agci_proportion, NEW.amount_override;

    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 2: Fix broker splits to calculate from AGCI + deal categories
-- =====================================================
CREATE OR REPLACE FUNCTION recalculate_payment_splits_on_amount_change()
RETURNS TRIGGER AS $function$
DECLARE
    deal_rec RECORD;
    payment_origination_usd NUMERIC;
    payment_site_usd NUMERIC;
    payment_deal_usd NUMERIC;
BEGIN
    -- Only recalculate if payment_amount or agci changed
    IF (NEW.payment_amount IS DISTINCT FROM OLD.payment_amount) OR
       (NEW.agci IS DISTINCT FROM OLD.agci) THEN

        -- Get deal category percentages
        SELECT
            COALESCE(origination_percent, 0) as origination_percent,
            COALESCE(site_percent, 0) as site_percent,
            COALESCE(deal_percent, 0) as deal_percent
        INTO deal_rec
        FROM deal
        WHERE id = NEW.deal_id;

        -- Calculate payment-level category amounts based on AGCI and deal percentages
        -- This is the KEY part: split AGCI into categories first
        payment_origination_usd := (deal_rec.origination_percent / 100) * NEW.agci;
        payment_site_usd := (deal_rec.site_percent / 100) * NEW.agci;
        payment_deal_usd := (deal_rec.deal_percent / 100) * NEW.agci;

        -- Update all payment_split records for this payment
        -- Apply broker split percentages to each category amount
        UPDATE payment_split
        SET
            split_origination_usd = (payment_origination_usd * COALESCE(split_origination_percent, 0) / 100),
            split_site_usd = (payment_site_usd * COALESCE(split_site_percent, 0) / 100),
            split_deal_usd = (payment_deal_usd * COALESCE(split_deal_percent, 0) / 100),
            split_broker_total = (
                (payment_origination_usd * COALESCE(split_origination_percent, 0) / 100) +
                (payment_site_usd * COALESCE(split_site_percent, 0) / 100) +
                (payment_deal_usd * COALESCE(split_deal_percent, 0) / 100)
            )
        WHERE payment_id = NEW.id;

        RAISE NOTICE 'Recalculated splits for payment % (AGCI: %, Categories - Orig: %, Site: %, Deal: %)',
            NEW.id, NEW.agci, payment_origination_usd, payment_site_usd, payment_deal_usd;
    END IF;

    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

-- =====================================================
-- STEP 3: Ensure triggers are in correct order
-- =====================================================

-- Drop and recreate triggers to ensure correct order
DROP TRIGGER IF EXISTS trigger_calculate_payment_fields ON payment;
DROP TRIGGER IF EXISTS trigger_recalculate_splits_on_payment_amount_change ON payment;

-- BEFORE trigger: Calculate AGCI proportionally
CREATE TRIGGER trigger_calculate_payment_fields
    BEFORE INSERT OR UPDATE ON payment
    FOR EACH ROW
    EXECUTE FUNCTION calculate_payment_fields();

-- AFTER trigger: Recalculate splits based on new AGCI
CREATE TRIGGER trigger_recalculate_splits_on_payment_amount_change
    AFTER UPDATE ON payment
    FOR EACH ROW
    WHEN (
        (NEW.payment_amount IS DISTINCT FROM OLD.payment_amount) OR
        (NEW.agci IS DISTINCT FROM OLD.agci)
    )
    EXECUTE FUNCTION recalculate_payment_splits_on_amount_change();

-- =====================================================
-- Add helpful comments
-- =====================================================
COMMENT ON FUNCTION calculate_payment_fields() IS
'BEFORE trigger: Calculates payment_amount and AGCI. When amount_override=true, respects the override and scales AGCI proportionally. Formula: AGCI = (payment_amount / calculated_amount) × (deal.agci / number_of_payments)';

COMMENT ON FUNCTION recalculate_payment_splits_on_amount_change() IS
'AFTER trigger: Recalculates broker splits when payment_amount or AGCI changes. Uses AGCI and deal category percentages. Formula: split_usd = (deal.category_percent × payment.agci) × broker.split_percent';
