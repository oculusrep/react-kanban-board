-- Simple fix: Calculate AGCI from payment amount using the same logic as deal-level
--
-- If deal has: fee, referral_fee_percent, and agci
-- Then the house cut percentage can be derived: house_cut% = 1 - (agci / gci)
-- Where gci = fee * (1 - referral_fee_percent/100)
--
-- For payments:
-- 1. Calculate GCI from payment: payment_amount * (1 - referral_fee_percent/100)
-- 2. Calculate AGCI from GCI using the same house cut ratio as the deal

CREATE OR REPLACE FUNCTION calculate_payment_fields()
RETURNS TRIGGER AS $function$
DECLARE
    deal_fee NUMERIC;
    deal_num_payments INTEGER;
    deal_agci NUMERIC;
    deal_referral_fee_pct NUMERIC;
    calculated_payment_amount NUMERIC;
    referral_fee_percent NUMERIC;
    referral_fee_usd NUMERIC;
    gci NUMERIC;
    deal_gci NUMERIC;
    house_cut_ratio NUMERIC;
BEGIN
    -- Fetch deal values
    SELECT
        deal.fee,
        deal.number_of_payments,
        deal.agci,
        deal.referral_fee_percent
    INTO
        deal_fee,
        deal_num_payments,
        deal_agci,
        deal_referral_fee_pct
    FROM deal
    WHERE deal.id = NEW.deal_id;

    -- Protect against null or zero payments
    IF deal_num_payments IS NULL OR deal_num_payments = 0 THEN
        RAISE EXCEPTION 'deal.number_of_payments is null or zero for deal_id %', NEW.deal_id;
    END IF;

    -- Calculate what the payment amount would be without override
    calculated_payment_amount := deal_fee / deal_num_payments;

    -- Only recalculate payment_amount if NOT overridden
    IF NEW.amount_override IS NOT TRUE THEN
        NEW.payment_amount := calculated_payment_amount;
    END IF;

    -- Get referral fee percentage (payment override takes precedence over deal default)
    referral_fee_percent := COALESCE(NEW.referral_fee_percent_override, deal_referral_fee_pct, 0);

    -- Calculate referral fee in dollars
    referral_fee_usd := NEW.payment_amount * referral_fee_percent / 100;
    NEW.referral_fee_usd := referral_fee_usd;

    -- Subtract referral fee from payment to get GCI
    gci := NEW.payment_amount - referral_fee_usd;

    -- Calculate the house cut ratio from the deal level
    -- deal_gci = deal_fee * (1 - deal_referral_fee_pct/100)
    -- house_cut_ratio = (deal_gci - deal_agci) / deal_gci
    deal_gci := deal_fee * (1 - deal_referral_fee_pct / 100);

    IF deal_gci > 0 THEN
        house_cut_ratio := (deal_gci - deal_agci) / deal_gci;
    ELSE
        house_cut_ratio := 0.45; -- Default 45% if can't calculate
    END IF;

    -- Apply the same house cut ratio to payment GCI to get payment AGCI
    NEW.agci := gci * (1 - house_cut_ratio);

    RAISE NOTICE 'Payment %: payment_amount=%, referral_fee=% (%), GCI=%, house_cut_ratio=%, AGCI=%',
        NEW.id, NEW.payment_amount, referral_fee_usd, referral_fee_percent,
        gci, house_cut_ratio, NEW.agci;

    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_payment_fields() IS
'BEFORE trigger: Calculates AGCI from payment_amount using the same house cut ratio as the deal. Formula: payment_amount → subtract referral_fee → GCI → apply house_cut_ratio → AGCI. Works for both calculated and overridden payments.';
