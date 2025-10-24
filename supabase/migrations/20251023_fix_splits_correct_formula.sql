-- Fix broker split calculation using correct formula from deal category percentages
--
-- CORRECT CALCULATION FLOW:
-- 1. Payment AGCI (already calculated proportionally by previous trigger)
-- 2. Break down AGCI into categories using deal-level percentages:
--    - origination_usd = (deal.origination_percent / 100) * payment.agci
--    - site_usd = (deal.site_percent / 100) * payment.agci
--    - deal_usd = (deal.deal_percent / 100) * payment.agci
-- 3. Apply broker split percentages to each category:
--    - split_origination_usd = (split_origination_percent / 100) * origination_usd
--    - split_site_usd = (split_site_percent / 100) * site_usd
--    - split_deal_usd = (split_deal_percent / 100) * deal_usd
--    - split_broker_total = sum of the three
--
-- Example for Payment 1 ($9,810, AGCI $2,697.75):
--   Deal categories: Origination 50%, Site 25%, Deal 25%
--   - origination_usd = 50% * $2,697.75 = $1,348.88
--   - site_usd = 25% * $2,697.75 = $674.44
--   - deal_usd = 25% * $2,697.75 = $674.44
--   Broker gets 100% of each:
--   - split_origination_usd = 100% * $1,348.88 = $1,348.88
--   - split_site_usd = 100% * $674.44 = $674.44
--   - split_deal_usd = 100% * $674.44 = $674.44
--   - split_broker_total = $2,697.75

-- =====================================================
-- Update trigger to recalculate payment_splits correctly
-- =====================================================
CREATE OR REPLACE FUNCTION recalculate_payment_splits_on_amount_change()
RETURNS TRIGGER AS $function$
DECLARE
    deal_rec RECORD;
    payment_origination_usd NUMERIC;
    payment_site_usd NUMERIC;
    payment_deal_usd NUMERIC;
BEGIN
    -- Only recalculate if payment_amount or agci changed
    IF (NEW.payment_amount IS DISTINCT FROM OLD.payment_amount) OR
       (NEW.agci IS DISTINCT FROM OLD.agci) THEN

        -- Get deal category percentages
        SELECT
            COALESCE(origination_percent, 0) as origination_percent,
            COALESCE(site_percent, 0) as site_percent,
            COALESCE(deal_percent, 0) as deal_percent
        INTO deal_rec
        FROM deal
        WHERE id = NEW.deal_id;

        -- Calculate payment-level category amounts based on deal percentages
        payment_origination_usd := (deal_rec.origination_percent / 100) * NEW.agci;
        payment_site_usd := (deal_rec.site_percent / 100) * NEW.agci;
        payment_deal_usd := (deal_rec.deal_percent / 100) * NEW.agci;

        -- Update all payment_split records for this payment
        -- Apply broker split percentages to each payment category amount
        UPDATE payment_split
        SET
            split_origination_usd = (payment_origination_usd * COALESCE(split_origination_percent, 0) / 100),
            split_site_usd = (payment_site_usd * COALESCE(split_site_percent, 0) / 100),
            split_deal_usd = (payment_deal_usd * COALESCE(split_deal_percent, 0) / 100),
            split_broker_total = (
                (payment_origination_usd * COALESCE(split_origination_percent, 0) / 100) +
                (payment_site_usd * COALESCE(split_site_percent, 0) / 100) +
                (payment_deal_usd * COALESCE(split_deal_percent, 0) / 100)
            )
        WHERE payment_id = NEW.id;

        RAISE NOTICE 'Recalculated payment splits for payment % (AGCI: %, Orig: %, Site: %, Deal: %)',
            NEW.id, NEW.agci, payment_origination_usd, payment_site_usd, payment_deal_usd;
    END IF;

    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

COMMENT ON FUNCTION recalculate_payment_splits_on_amount_change() IS 'Recalculates broker commission splits based on payment AGCI and deal category percentages (origination/site/deal). Formula: split_usd = (category_percent × payment.agci) × broker_split_percent.';
