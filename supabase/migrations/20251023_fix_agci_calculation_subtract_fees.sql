-- Fix AGCI calculation to subtract fees from payment amount
--
-- Correct calculation:
-- 1. Start with payment amount (override or calculated)
-- 2. Calculate referral fee: payment_amount × referral_fee_percent
-- 3. Subtract referral fee to get GCI: payment_amount - referral_fee_usd
-- 4. Calculate house cut: GCI × house_cut_percent
-- 5. Subtract house cut to get AGCI: GCI - house_cut_usd
--
-- Example: Payment = $9,810, Referral = 50%, House Cut = 45%
-- 1. Payment Amount: $9,810
-- 2. Referral Fee: $9,810 × 50% = $4,905
-- 3. GCI: $9,810 - $4,905 = $4,905
-- 4. House Cut: $4,905 × 45% = $2,207.25
-- 5. AGCI: $4,905 - $2,207.25 = $2,697.75

-- =====================================================
-- Calculate AGCI by subtracting fees from payment amount
-- =====================================================
CREATE OR REPLACE FUNCTION calculate_payment_fields()
RETURNS TRIGGER AS $function$
DECLARE
    d RECORD;
    calculated_payment_amount NUMERIC;
    referral_fee_percent NUMERIC;
    referral_fee_usd NUMERIC;
    gci NUMERIC;
    house_cut_percent NUMERIC;
    house_cut_usd NUMERIC;
BEGIN
    -- Fetch deal values needed for calculations
    SELECT
        fee,
        number_of_payments,
        agci,
        referral_fee_percent,
        COALESCE(house_cut_percent, 45) as house_cut_percent
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

    -- Get referral fee percentage (override or deal default)
    referral_fee_percent := COALESCE(NEW.referral_fee_percent_override, d.referral_fee_percent, 0);
    house_cut_percent := d.house_cut_percent;

    -- Step 1: Calculate referral fee in dollars
    referral_fee_usd := NEW.payment_amount * referral_fee_percent / 100;
    NEW.referral_fee_usd := referral_fee_usd;

    -- Step 2: Subtract referral fee from payment to get GCI
    gci := NEW.payment_amount - referral_fee_usd;

    -- Step 3: Calculate house cut in dollars
    house_cut_usd := gci * house_cut_percent / 100;

    -- Step 4: Subtract house cut from GCI to get AGCI
    NEW.agci := gci - house_cut_usd;

    RAISE NOTICE 'Payment %: amount=%, ref_fee=% (%), GCI=%, house_cut=% (%), AGCI=%',
        NEW.id, NEW.payment_amount, referral_fee_usd, referral_fee_percent,
        gci, house_cut_usd, house_cut_percent, NEW.agci;

    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

-- =====================================================
-- Calculate broker splits from AGCI + deal categories
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

        -- Calculate payment-level category amounts from AGCI
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
-- Ensure triggers are in correct order
-- =====================================================

-- Drop and recreate triggers to ensure correct order
DROP TRIGGER IF EXISTS trigger_calculate_payment_fields ON payment;
DROP TRIGGER IF EXISTS trigger_recalculate_splits_on_payment_amount_change ON payment;

-- BEFORE trigger: Calculate AGCI by subtracting fees from payment amount
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
'BEFORE trigger: Calculates AGCI by subtracting fees from payment_amount. Formula: payment_amount → subtract referral_fee_usd → GCI → subtract house_cut_usd → AGCI. Works for both calculated and overridden payments.';

COMMENT ON FUNCTION recalculate_payment_splits_on_amount_change() IS
'AFTER trigger: Recalculates broker splits when payment_amount or AGCI changes. Uses AGCI and deal category percentages. Formula: split_usd = (deal.category_percent × payment.agci) × broker.split_percent';
