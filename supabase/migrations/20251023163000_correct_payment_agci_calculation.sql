-- Correct Payment AGCI calculation using the proper formula:
-- Payment GCI = Payment Amount - (Payment Amount × Deal Referral Fee %)
-- House Split = Deal House Percent × Payment GCI
-- Payment AGCI = Payment GCI - House Split

CREATE OR REPLACE FUNCTION calculate_payment_agci()
RETURNS TRIGGER AS $$
DECLARE
    v_referral_fee_percent NUMERIC;
    v_house_percent NUMERIC;
    v_payment_gci NUMERIC;
    v_house_split NUMERIC;
BEGIN
    -- Get deal percentages
    SELECT
        referral_fee_percent,
        house_percent
    INTO
        v_referral_fee_percent,
        v_house_percent
    FROM deal
    WHERE id = NEW.deal_id;

    -- Calculate Payment GCI = Payment Amount - (Payment Amount × Referral Fee %)
    v_payment_gci := NEW.payment_amount - (NEW.payment_amount * COALESCE(v_referral_fee_percent, 0) / 100);

    -- Calculate House Split = House Percent × Payment GCI
    v_house_split := COALESCE(v_house_percent, 0) / 100 * v_payment_gci;

    -- Calculate Payment AGCI = Payment GCI - House Split
    NEW.agci := v_payment_gci - v_house_split;

    -- Also update referral fee
    NEW.referral_fee_usd := NEW.payment_amount * COALESCE(v_referral_fee_percent, 0) / 100;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS calculate_payment_agci_trigger ON payment;

-- Create trigger that fires BEFORE INSERT or UPDATE
CREATE TRIGGER calculate_payment_agci_trigger
    BEFORE INSERT OR UPDATE OF payment_amount, amount_override
    ON payment
    FOR EACH ROW
    EXECUTE FUNCTION calculate_payment_agci();

COMMENT ON FUNCTION calculate_payment_agci() IS 'Calculates Payment AGCI using: Payment AGCI = (Payment Amount - Referral Fee) - (House % × Payment GCI)';
