-- Fix the BEFORE UPDATE triggers to respect amount_override flag
-- These triggers were forcibly recalculating payment_amount on every update,
-- even when we explicitly wanted to override it

-- Update calculate_payment_fields to skip recalculation when amount_override is true
CREATE OR REPLACE FUNCTION calculate_payment_fields()
RETURNS TRIGGER AS $function$
DECLARE
    d RECORD;
    deal_total_payments NUMERIC;
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

    -- Only recalculate payment_amount if NOT overridden
    IF NEW.amount_override IS NOT TRUE THEN
        NEW.payment_amount := d.fee / d.number_of_payments;
    END IF;

    -- Calculate agci
    NEW.agci := d.agci / d.number_of_payments;

    -- Calculate referral_fee_usd using override if provided
    NEW.referral_fee_usd := COALESCE(NEW.referral_fee_percent_override, d.referral_fee_percent) * NEW.payment_amount;

    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

-- Update calculate_payment_amounts to skip recalculation when amount_override is true
CREATE OR REPLACE FUNCTION calculate_payment_amounts()
RETURNS TRIGGER AS $function$
DECLARE
    deal_rec RECORD;
BEGIN
    -- Get deal information
    SELECT fee, agci, number_of_payments, referral_fee_percent
    INTO deal_rec 
    FROM deal 
    WHERE id = NEW.deal_id;
    
    -- Only recalculate payment_amount if NOT overridden
    IF NEW.amount_override IS NOT TRUE THEN
        NEW.payment_amount = deal_rec.fee / deal_rec.number_of_payments;
    END IF;
    
    -- Calculate AGCI share
    NEW.agci = deal_rec.agci / deal_rec.number_of_payments;
    
    -- Calculate referral fee (with override capability)
    NEW.referral_fee_usd = COALESCE(NEW.referral_fee_percent_override, deal_rec.referral_fee_percent) * NEW.payment_amount / 100;
    
    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

COMMENT ON FUNCTION calculate_payment_fields() IS 'Calculates payment fields. Respects amount_override flag - does not recalculate payment_amount when override is true.';
COMMENT ON FUNCTION calculate_payment_amounts() IS 'Calculates payment amounts. Respects amount_override flag - does not recalculate payment_amount when override is true.';
