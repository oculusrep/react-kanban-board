-- Create a simple RPC function to override payment amount and recalculate everything
-- This bypasses all the trigger complexity and just does it in one atomic operation

CREATE OR REPLACE FUNCTION override_payment_amount(
    p_payment_id UUID,
    p_new_amount NUMERIC
)
RETURNS TABLE(
    result_payment_id UUID,
    result_payment_amount NUMERIC,
    result_agci NUMERIC,
    result_referral_fee_usd NUMERIC
) AS $$
DECLARE
    v_deal_id UUID;
    v_deal_fee NUMERIC;
    v_deal_referral_pct NUMERIC;
    v_deal_agci NUMERIC;
    v_deal_gci NUMERIC;
    v_house_cut_ratio NUMERIC;
    v_payment_referral_fee NUMERIC;
    v_payment_gci NUMERIC;
    v_payment_agci NUMERIC;
    v_deal_origination_pct NUMERIC;
    v_deal_site_pct NUMERIC;
    v_deal_deal_pct NUMERIC;
    v_origination_usd NUMERIC;
    v_site_usd NUMERIC;
    v_deal_usd NUMERIC;
BEGIN
    -- Get payment's deal_id
    SELECT deal_id INTO v_deal_id FROM payment WHERE id = p_payment_id;

    IF v_deal_id IS NULL THEN
        RAISE EXCEPTION 'Payment not found: %', p_payment_id;
    END IF;

    -- Get deal info
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
    WHERE id = v_deal_id;

    -- Calculate house cut ratio from deal
    v_deal_gci := v_deal_fee * (1 - COALESCE(v_deal_referral_pct, 0) / 100);
    IF v_deal_gci > 0 THEN
        v_house_cut_ratio := (v_deal_gci - COALESCE(v_deal_agci, 0)) / v_deal_gci;
    ELSE
        v_house_cut_ratio := 0.45;
    END IF;

    -- Calculate payment values
    v_payment_referral_fee := p_new_amount * COALESCE(v_deal_referral_pct, 0) / 100;
    v_payment_gci := p_new_amount - v_payment_referral_fee;
    v_payment_agci := v_payment_gci * (1 - v_house_cut_ratio);

    -- Update payment
    UPDATE payment
    SET
        payment_amount = p_new_amount,
        agci = v_payment_agci,
        referral_fee_usd = v_payment_referral_fee,
        amount_override = true,
        override_at = NOW()
    WHERE id = p_payment_id;

    -- Calculate category amounts from AGCI
    v_origination_usd := v_payment_agci * COALESCE(v_deal_origination_pct, 0) / 100;
    v_site_usd := v_payment_agci * COALESCE(v_deal_site_pct, 0) / 100;
    v_deal_usd := v_payment_agci * COALESCE(v_deal_deal_pct, 0) / 100;

    -- Update all broker splits
    UPDATE payment_split
    SET
        split_origination_usd = v_origination_usd * COALESCE(split_origination_percent, 0) / 100,
        split_site_usd = v_site_usd * COALESCE(split_site_percent, 0) / 100,
        split_deal_usd = v_deal_usd * COALESCE(split_deal_percent, 0) / 100,
        split_broker_total = (
            (v_origination_usd * COALESCE(split_origination_percent, 0) / 100) +
            (v_site_usd * COALESCE(split_site_percent, 0) / 100) +
            (v_deal_usd * COALESCE(split_deal_percent, 0) / 100)
        )
    WHERE payment_id = p_payment_id;

    -- Return the updated payment info
    RETURN QUERY
    SELECT
        p.id,
        p.payment_amount,
        p.agci,
        p.referral_fee_usd
    FROM payment p
    WHERE p.id = p_payment_id;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION override_payment_amount IS
'Overrides a payment amount and recalculates AGCI and all broker splits in one atomic operation. Use this instead of direct UPDATE to ensure all values stay in sync.';
