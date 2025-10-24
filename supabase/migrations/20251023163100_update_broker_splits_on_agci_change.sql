-- Update broker splits when Payment AGCI changes
-- Each broker split is calculated as:
-- split_origination_usd = Payment AGCI × deal.origination_percent × payment_split.split_origination_percent
-- split_site_usd = Payment AGCI × deal.site_percent × payment_split.split_site_percent
-- split_deal_usd = Payment AGCI × deal.deal_percent × payment_split.split_deal_percent

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

-- Drop existing trigger if it exists
DROP TRIGGER IF EXISTS update_broker_splits_trigger ON payment;

-- Create trigger that fires AFTER the AGCI is calculated
CREATE TRIGGER update_broker_splits_trigger
    AFTER INSERT OR UPDATE OF agci, payment_amount, amount_override
    ON payment
    FOR EACH ROW
    EXECUTE FUNCTION update_broker_splits_on_agci_change();

COMMENT ON FUNCTION update_broker_splits_on_agci_change() IS 'Updates broker splits when Payment AGCI changes. Each split = Payment AGCI × deal category % × broker split %';
