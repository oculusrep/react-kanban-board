-- ============================================================================
-- CLEAN SLATE: Remove all old conflicting triggers and create fresh ones
-- ============================================================================
-- This removes all the accumulated triggers from previous sessions and
-- creates only the triggers we need for payment override to work correctly
-- ============================================================================

-- STEP 1: Drop ALL existing payment triggers
DROP TRIGGER IF EXISTS calculate_payment_agci_trigger ON payment;
DROP TRIGGER IF EXISTS trg_calculate_payment_fields ON payment;
DROP TRIGGER IF EXISTS trigger_calculate_payment_amounts ON payment;
DROP TRIGGER IF EXISTS trigger_update_payment_agci_and_splits ON payment;
DROP TRIGGER IF EXISTS update_broker_splits_trigger ON payment;
DROP TRIGGER IF EXISTS update_splits_after_agci_calculation ON payment;
DROP TRIGGER IF EXISTS trigger_auto_create_splits_on_payment ON payment;

-- STEP 2: Drop the old functions (we'll recreate the ones we need)
DROP FUNCTION IF EXISTS calculate_payment_fields() CASCADE;
DROP FUNCTION IF EXISTS calculate_payment_amounts() CASCADE;
DROP FUNCTION IF EXISTS update_payment_agci_and_splits() CASCADE;
DROP FUNCTION IF EXISTS update_payment_splits_on_agci_change() CASCADE;

-- ============================================================================
-- STEP 3: Create NEW triggers (clean and simple)
-- ============================================================================

-- TRIGGER 1: Calculate Payment AGCI (BEFORE UPDATE/INSERT)
-- This calculates AGCI whenever payment_amount changes
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

CREATE TRIGGER calculate_payment_agci_trigger
    BEFORE INSERT OR UPDATE OF payment_amount, amount_override
    ON payment
    FOR EACH ROW
    EXECUTE FUNCTION calculate_payment_agci();

-- TRIGGER 2: Update Broker Splits (AFTER UPDATE/INSERT)
-- This updates all broker splits whenever payment AGCI changes
CREATE OR REPLACE FUNCTION update_broker_splits_on_agci_change()
RETURNS TRIGGER AS $$
DECLARE
    v_origination_percent NUMERIC;
    v_site_percent NUMERIC;
    v_deal_percent NUMERIC;
    v_origination_total NUMERIC;
    v_site_total NUMERIC;
    v_deal_total NUMERIC;
BEGIN
    -- Get deal category percentages
    SELECT
        origination_percent,
        site_percent,
        deal_percent
    INTO
        v_origination_percent,
        v_site_percent,
        v_deal_percent
    FROM deal
    WHERE id = NEW.deal_id;

    -- Calculate total amounts for each category from Payment AGCI
    v_origination_total := NEW.agci * COALESCE(v_origination_percent, 0) / 100;
    v_site_total := NEW.agci * COALESCE(v_site_percent, 0) / 100;
    v_deal_total := NEW.agci * COALESCE(v_deal_percent, 0) / 100;

    -- Update all broker splits for this payment
    UPDATE payment_split
    SET
        split_origination_usd = v_origination_total * COALESCE(split_origination_percent, 0) / 100,
        split_site_usd = v_site_total * COALESCE(split_site_percent, 0) / 100,
        split_deal_usd = v_deal_total * COALESCE(split_deal_percent, 0) / 100,
        split_broker_total = (
            (v_origination_total * COALESCE(split_origination_percent, 0) / 100) +
            (v_site_total * COALESCE(split_site_percent, 0) / 100) +
            (v_deal_total * COALESCE(split_deal_percent, 0) / 100)
        )
    WHERE payment_id = NEW.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_broker_splits_trigger
    AFTER INSERT OR UPDATE
    ON payment
    FOR EACH ROW
    EXECUTE FUNCTION update_broker_splits_on_agci_change();

-- TRIGGER 3: Auto-create payment splits on payment INSERT (keep this one - it's needed)
-- Re-create this trigger if you have the function for it
-- If you don't have auto_create_payment_splits_on_payment_insert() function, skip this
-- DROP TRIGGER IF EXISTS trigger_auto_create_splits_on_payment ON payment;
-- CREATE TRIGGER trigger_auto_create_splits_on_payment
--     AFTER INSERT
--     ON payment
--     FOR EACH ROW
--     EXECUTE FUNCTION auto_create_payment_splits_on_payment_insert();

-- ============================================================================
-- Done! You now have a clean set of triggers:
-- 1. calculate_payment_agci_trigger (BEFORE) - Calculates AGCI from payment amount
-- 2. update_broker_splits_trigger (AFTER) - Updates broker splits from AGCI
-- ============================================================================

-- Verify triggers were created
SELECT
    trigger_name,
    event_manipulation,
    action_timing,
    action_statement
FROM information_schema.triggers
WHERE event_object_table = 'payment'
ORDER BY action_timing, trigger_name;
