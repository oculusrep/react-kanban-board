-- Fix all ambiguous column references by being explicit about table sources
--
-- Problem: Multiple columns exist in both deal and payment tables
-- Solution: Explicitly qualify every column reference with its source table

CREATE OR REPLACE FUNCTION calculate_payment_fields()
RETURNS TRIGGER AS $function$
DECLARE
    deal_fee NUMERIC;
    deal_num_payments INTEGER;
    deal_agci NUMERIC;
    deal_referral_fee_pct NUMERIC;
    deal_house_cut_pct NUMERIC;
    calculated_payment_amount NUMERIC;
    referral_fee_percent NUMERIC;
    referral_fee_usd NUMERIC;
    gci NUMERIC;
    house_cut_usd NUMERIC;
BEGIN
    -- Fetch deal values - store each in its own variable to avoid ambiguity
    SELECT
        deal.fee,
        deal.number_of_payments,
        deal.agci,
        deal.referral_fee_percent,
        COALESCE(deal.house_cut_percent, 45)
    INTO
        deal_fee,
        deal_num_payments,
        deal_agci,
        deal_referral_fee_pct,
        deal_house_cut_pct
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

    -- Step 1: Calculate referral fee in dollars
    referral_fee_usd := NEW.payment_amount * referral_fee_percent / 100;
    NEW.referral_fee_usd := referral_fee_usd;

    -- Step 2: Subtract referral fee from payment to get GCI
    gci := NEW.payment_amount - referral_fee_usd;

    -- Step 3: Calculate house cut in dollars
    house_cut_usd := gci * deal_house_cut_pct / 100;

    -- Step 4: Subtract house cut from GCI to get AGCI
    NEW.agci := gci - house_cut_usd;

    RAISE NOTICE 'Payment %: amount=%, ref_fee=% (%), GCI=%, house_cut=% (%), AGCI=%',
        NEW.id, NEW.payment_amount, referral_fee_usd, referral_fee_percent,
        gci, house_cut_usd, deal_house_cut_pct, NEW.agci;

    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_payment_fields() IS
'BEFORE trigger: Calculates AGCI by subtracting fees from payment_amount. Formula: payment_amount → subtract referral_fee_usd → GCI → subtract house_cut_usd → AGCI. Works for both calculated and overridden payments.';
