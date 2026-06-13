-- Fix broker split calculation to use payment AGCI instead of payment_amount
--
-- Problem: The trigger was calculating splits as percentages of payment_amount,
-- but splits should be calculated as percentages of payment AGCI.
--
-- Simplified logic:
-- - Broker gets split_origination_percent + split_site_percent + split_deal_percent of the AGCI
-- - Since most brokers get 100% + 100% + 100% = 300%, they effectively get 100% of AGCI
-- - The three categories (origination/site/deal) are just different buckets, all from AGCI
--
-- Example:
-- Payment: $9,810
-- AGCI: $2,697.75 (after referral fee and house cut)
-- If broker gets 100% on all categories:
--   - split_origination_usd = AGCI * 100% / 300% = $899.25
--   - split_site_usd = AGCI * 100% / 300% = $899.25
--   - split_deal_usd = AGCI * 100% / 300% = $899.25
--   - split_broker_total = $2,697.75

-- =====================================================
-- Update trigger to recalculate payment_splits based on AGCI
-- =====================================================
CREATE OR REPLACE FUNCTION recalculate_payment_splits_on_amount_change()
RETURNS TRIGGER AS $function$
DECLARE
    total_split_percent NUMERIC;
BEGIN
    -- Only recalculate if payment_amount or agci changed
    IF (NEW.payment_amount IS DISTINCT FROM OLD.payment_amount) OR
       (NEW.agci IS DISTINCT FROM OLD.agci) THEN

        -- Update all payment_split records for this payment
        -- Calculate each category as a proportion of AGCI based on the split percentages
        UPDATE payment_split ps
        SET
            split_origination_usd = (
                NEW.agci *
                COALESCE(ps.split_origination_percent, 0) /
                NULLIF(COALESCE(ps.split_origination_percent, 0) + COALESCE(ps.split_site_percent, 0) + COALESCE(ps.split_deal_percent, 0), 0)
            ),
            split_site_usd = (
                NEW.agci *
                COALESCE(ps.split_site_percent, 0) /
                NULLIF(COALESCE(ps.split_origination_percent, 0) + COALESCE(ps.split_site_percent, 0) + COALESCE(ps.split_deal_percent, 0), 0)
            ),
            split_deal_usd = (
                NEW.agci *
                COALESCE(ps.split_deal_percent, 0) /
                NULLIF(COALESCE(ps.split_origination_percent, 0) + COALESCE(ps.split_site_percent, 0) + COALESCE(ps.split_deal_percent, 0), 0)
            ),
            split_broker_total = NEW.agci
        WHERE ps.payment_id = NEW.id;

        RAISE NOTICE 'Recalculated payment splits for payment % based on AGCI %', NEW.id, NEW.agci;
    END IF;

    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

COMMENT ON FUNCTION recalculate_payment_splits_on_amount_change() IS 'Recalculates broker commission splits based on payment AGCI. Broker gets 100% of AGCI (split_broker_total = agci), divided proportionally into origination/site/deal categories based on split percentages.';
