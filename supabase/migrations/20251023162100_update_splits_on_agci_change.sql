-- Update broker splits when payment AGCI changes
-- This ensures splits are recalculated when payment amount is overridden

CREATE OR REPLACE FUNCTION update_payment_splits_on_agci_change()
RETURNS TRIGGER AS $$
DECLARE
    d RECORD;
    origination_usd NUMERIC;
    site_usd NUMERIC;
    deal_usd NUMERIC;
BEGIN
    -- Get deal percentages
    SELECT
        origination_percent,
        site_percent,
        deal_percent
    INTO d
    FROM deal
    WHERE id = NEW.deal_id;

    -- Calculate category amounts from NEW AGCI
    origination_usd := NEW.agci * COALESCE(d.origination_percent, 0) / 100;
    site_usd := NEW.agci * COALESCE(d.site_percent, 0) / 100;
    deal_usd := NEW.agci * COALESCE(d.deal_percent, 0) / 100;

    -- Update all broker splits for this payment
    UPDATE payment_split
    SET
        split_origination_usd = origination_usd * COALESCE(split_origination_percent, 0) / 100,
        split_site_usd = site_usd * COALESCE(split_site_percent, 0) / 100,
        split_deal_usd = deal_usd * COALESCE(split_deal_percent, 0) / 100,
        split_broker_total = (
            (origination_usd * COALESCE(split_origination_percent, 0) / 100) +
            (site_usd * COALESCE(split_site_percent, 0) / 100) +
            (deal_usd * COALESCE(split_deal_percent, 0) / 100)
        )
    WHERE payment_id = NEW.id;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create trigger to update splits after payment AGCI is calculated
DROP TRIGGER IF EXISTS update_splits_after_agci_calculation ON payment;
CREATE TRIGGER update_splits_after_agci_calculation
    AFTER INSERT OR UPDATE OF agci, payment_amount, amount_override
    ON payment
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_splits_on_agci_change();

COMMENT ON FUNCTION update_payment_splits_on_agci_change() IS 'Updates all broker splits when payment AGCI changes, ensuring splits reflect the correct amounts after payment override.';
