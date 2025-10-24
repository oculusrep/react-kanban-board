-- Fix AGCI calculation when payment amount is overridden
-- When amount_override is TRUE, we need to calculate AGCI from the overridden payment_amount
-- using the house cut ratio from the deal, NOT just divide deal AGCI equally

CREATE OR REPLACE FUNCTION calculate_payment_fields()
RETURNS TRIGGER AS $function$
DECLARE
    d RECORD;
    deal_gci NUMERIC;
    house_cut_ratio NUMERIC;
    payment_gci NUMERIC;
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

    -- Calculate house cut ratio from the deal
    deal_gci := d.fee * (1 - COALESCE(d.referral_fee_percent, 0) / 100);
    IF deal_gci > 0 THEN
        house_cut_ratio := (deal_gci - COALESCE(d.agci, 0)) / deal_gci;
    ELSE
        house_cut_ratio := 0.45; -- Default 45% house cut
    END IF;

    -- Only recalculate payment_amount if NOT overridden
    IF NEW.amount_override IS NOT TRUE THEN
        NEW.payment_amount := d.fee / d.number_of_payments;
    END IF;

    -- Calculate referral fee from payment amount
    NEW.referral_fee_usd := NEW.payment_amount * COALESCE(NEW.referral_fee_percent_override, d.referral_fee_percent, 0) / 100;

    -- Calculate payment GCI (payment amount minus referral fee)
    payment_gci := NEW.payment_amount - NEW.referral_fee_usd;

    -- Calculate AGCI from payment GCI using house cut ratio
    NEW.agci := payment_gci * (1 - house_cut_ratio);

    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_payment_fields() IS 'Calculates payment fields including AGCI based on house cut ratio. When amount is overridden, recalculates AGCI from the new payment amount.';
