-- ============================================================================
-- FIX: Deal Changes Should Update Payments
-- ============================================================================
-- Problem: When referral_fee_percent or house_percent changes on a deal,
-- the payment AGCI and broker splits don't recalculate automatically.
--
-- Root Cause: The calculate_payment_agci_trigger only fires on payment
-- table changes (payment_amount, amount_override). It doesn't know when
-- the deal table changes.
--
-- Solution: Create AFTER UPDATE trigger on deal table that recalculates
-- all payments for that deal when referral_fee_percent or house_percent
-- changes.
-- ============================================================================

CREATE OR REPLACE FUNCTION recalculate_payments_on_deal_change()
RETURNS TRIGGER AS $$
BEGIN
    -- When deal percentages change, force recalculation of all payments
    -- by updating them (which triggers calculate_payment_agci_trigger)
    UPDATE payment
    SET payment_amount = payment_amount  -- Dummy update to trigger recalculation
    WHERE deal_id = NEW.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS recalculate_payments_on_deal_change_trigger ON deal;

CREATE TRIGGER recalculate_payments_on_deal_change_trigger
    AFTER UPDATE OF referral_fee_percent, house_percent, origination_percent, site_percent, deal_percent
    ON deal
    FOR EACH ROW
    WHEN (
        OLD.referral_fee_percent IS DISTINCT FROM NEW.referral_fee_percent
        OR OLD.house_percent IS DISTINCT FROM NEW.house_percent
        OR OLD.origination_percent IS DISTINCT FROM NEW.origination_percent
        OR OLD.site_percent IS DISTINCT FROM NEW.site_percent
        OR OLD.deal_percent IS DISTINCT FROM NEW.deal_percent
    )
    EXECUTE FUNCTION recalculate_payments_on_deal_change();

-- ============================================================================
-- Comments
-- ============================================================================

COMMENT ON FUNCTION recalculate_payments_on_deal_change() IS
    'When deal percentages change (referral fee, house, category splits), this trigger forces recalculation of all payments and their splits by updating payment.payment_amount (dummy update). This ensures AGCI and broker splits stay in sync when deal-level percentages change.';

COMMENT ON TRIGGER recalculate_payments_on_deal_change_trigger ON deal IS
    'Fires when any deal percentage changes. Recalculates all payments and broker splits for the deal.';
