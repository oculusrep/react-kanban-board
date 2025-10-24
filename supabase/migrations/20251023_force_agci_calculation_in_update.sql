-- Simple approach: When payment_amount is updated, calculate AGCI directly in the UPDATE
-- Don't rely on triggers - just do it all in one operation

-- Drop the problematic triggers
DROP TRIGGER IF EXISTS trigger_calculate_payment_fields ON payment;
DROP TRIGGER IF EXISTS trigger_recalculate_splits_on_payment_amount_change ON payment;

-- Create ONE simple trigger that does EVERYTHING when payment_amount changes
CREATE OR REPLACE FUNCTION update_payment_agci_and_splits()
RETURNS TRIGGER AS $$
DECLARE
    v_deal_fee NUMERIC;
    v_deal_referral_pct NUMERIC;
    v_deal_agci NUMERIC;
    v_deal_gci NUMERIC;
    v_house_cut_ratio NUMERIC;
    v_payment_gci NUMERIC;
    v_payment_agci NUMERIC;
    v_deal_origination_pct NUMERIC;
    v_deal_site_pct NUMERIC;
    v_deal_deal_pct NUMERIC;
    v_payment_origination_usd NUMERIC;
    v_payment_site_usd NUMERIC;
    v_payment_deal_usd NUMERIC;
BEGIN
    -- Get deal data
    SELECT
        fee,
        referral_fee_percent,
        agci,
        origination_percent,
        site_percent,
        deal_percent
    INTO
        v_deal_fee,
        v_deal_referral_pct,
        v_deal_agci,
        v_deal_origination_pct,
        v_deal_site_pct,
        v_deal_deal_pct
    FROM deal
    WHERE id = NEW.deal_id;

    -- Calculate GCI at deal level to derive house cut ratio
    v_deal_gci := v_deal_fee * (1 - COALESCE(v_deal_referral_pct, 0) / 100);

    IF v_deal_gci > 0 THEN
        v_house_cut_ratio := (v_deal_gci - COALESCE(v_deal_agci, 0)) / v_deal_gci;
    ELSE
        v_house_cut_ratio := 0.45; -- Default 45%
    END IF;

    -- Calculate payment GCI (subtract referral fee from payment amount)
    v_payment_gci := NEW.payment_amount * (1 - COALESCE(v_deal_referral_pct, 0) / 100);

    -- Calculate payment AGCI (apply house cut ratio)
    v_payment_agci := v_payment_gci * (1 - v_house_cut_ratio);

    -- Update AGCI on the payment
    NEW.agci := v_payment_agci;
    NEW.referral_fee_usd := NEW.payment_amount * COALESCE(v_deal_referral_pct, 0) / 100;

    -- Now calculate category breakdowns from AGCI
    v_payment_origination_usd := v_payment_agci * COALESCE(v_deal_origination_pct, 0) / 100;
    v_payment_site_usd := v_payment_agci * COALESCE(v_deal_site_pct, 0) / 100;
    v_payment_deal_usd := v_payment_agci * COALESCE(v_deal_deal_pct, 0) / 100;

    -- Update all broker splits for this payment
    UPDATE payment_split
    SET
        split_origination_usd = v_payment_origination_usd * COALESCE(split_origination_percent, 0) / 100,
        split_site_usd = v_payment_site_usd * COALESCE(split_site_percent, 0) / 100,
        split_deal_usd = v_payment_deal_usd * COALESCE(split_deal_percent, 0) / 100,
        split_broker_total = (
            (v_payment_origination_usd * COALESCE(split_origination_percent, 0) / 100) +
            (v_payment_site_usd * COALESCE(split_site_percent, 0) / 100) +
            (v_payment_deal_usd * COALESCE(split_deal_percent, 0) / 100)
        )
    WHERE payment_id = NEW.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create BEFORE trigger (so AGCI is set before the row is saved)
CREATE TRIGGER trigger_update_payment_agci_and_splits
    BEFORE UPDATE OF payment_amount ON payment
    FOR EACH ROW
    WHEN (NEW.payment_amount IS DISTINCT FROM OLD.payment_amount)
    EXECUTE FUNCTION update_payment_agci_and_splits();

COMMENT ON FUNCTION update_payment_agci_and_splits() IS
'Simple all-in-one trigger: When payment_amount changes, calculates AGCI and updates all broker splits in one go.';
