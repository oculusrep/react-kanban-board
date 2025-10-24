-- Fix "record d is not assigned yet" error
--
-- The issue is we're aliasing the table as 'd' in the SELECT FROM clause
-- but also trying to store the result in a RECORD variable named 'd'
-- Solution: Use different names for table alias and record variable

CREATE OR REPLACE FUNCTION calculate_payment_fields()
RETURNS TRIGGER AS $function$
DECLARE
    deal_rec RECORD;
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
    INTO deal_rec
    FROM deal
    WHERE id = NEW.deal_id;

    -- Protect against null or zero payments
    IF deal_rec.number_of_payments IS NULL OR deal_rec.number_of_payments = 0 THEN
        RAISE EXCEPTION 'deal.number_of_payments is null or zero for deal_id %', NEW.deal_id;
    END IF;

    -- Calculate what the payment amount would be without override
    calculated_payment_amount := deal_rec.fee / deal_rec.number_of_payments;

    -- Only recalculate payment_amount if NOT overridden
    IF NEW.amount_override IS NOT TRUE THEN
        NEW.payment_amount := calculated_payment_amount;
    END IF;

    -- Get referral fee percentage (payment override takes precedence over deal default)
    referral_fee_percent := COALESCE(NEW.referral_fee_percent_override, deal_rec.referral_fee_percent, 0);
    house_cut_percent := deal_rec.house_cut_percent;

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

COMMENT ON FUNCTION calculate_payment_fields() IS
'BEFORE trigger: Calculates AGCI by subtracting fees from payment_amount. Formula: payment_amount → subtract referral_fee_usd → GCI → subtract house_cut_usd → AGCI. Works for both calculated and overridden payments.';
