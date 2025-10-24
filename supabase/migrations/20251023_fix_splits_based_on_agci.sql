-- Fix broker split calculation to use payment AGCI instead of payment_amount
--
-- Problem: The trigger was calculating splits as percentages of payment_amount,
-- but splits should be calculated as percentages of payment AGCI (Agent Gross Commission Income).
--
-- Calculation flow:
-- 1. Payment Amount: $9,810
-- 2. Referral Fee (50%): $4,905
-- 3. GCI = Payment Amount - Referral Fee = $4,905
-- 4. House Cut (45% of GCI): $2,207.25
-- 5. AGCI = GCI - House Cut = $2,697.75
-- 6. Broker Split = percentage of AGCI (e.g., 100% of AGCI = $2,697.75)

-- =====================================================
-- Update trigger to recalculate payment_splits based on AGCI
-- =====================================================
CREATE OR REPLACE FUNCTION recalculate_payment_splits_on_amount_change()
RETURNS TRIGGER AS $function$
DECLARE
    agci_per_category NUMERIC;
    origination_agci NUMERIC;
    site_agci NUMERIC;
    deal_agci NUMERIC;
BEGIN
    -- Only recalculate if payment_amount or agci changed
    IF (NEW.payment_amount IS DISTINCT FROM OLD.payment_amount) OR
       (NEW.agci IS DISTINCT FROM OLD.agci) THEN

        -- AGCI is already calculated proportionally by the BEFORE UPDATE trigger
        -- Now we need to break down AGCI into the three categories based on deal-level percentages

        -- Get the deal-level category percentages from commission_split
        -- These percentages determine how AGCI is split into origination/site/deal categories
        DECLARE
            deal_origination_percent NUMERIC;
            deal_site_percent NUMERIC;
            deal_deal_percent NUMERIC;
            total_category_percent NUMERIC;
        BEGIN
            -- Get category percentages from deal's commission_split
            SELECT
                COALESCE(origination_percent, 0),
                COALESCE(site_percent, 0),
                COALESCE(deal_percent, 0)
            INTO
                deal_origination_percent,
                deal_site_percent,
                deal_deal_percent
            FROM commission_split
            WHERE deal_id = NEW.deal_id
            LIMIT 1;

            total_category_percent := deal_origination_percent + deal_site_percent + deal_deal_percent;

            -- If we have category percentages, split AGCI proportionally
            IF total_category_percent > 0 THEN
                origination_agci := (deal_origination_percent / total_category_percent) * NEW.agci;
                site_agci := (deal_site_percent / total_category_percent) * NEW.agci;
                deal_agci := (deal_deal_percent / total_category_percent) * NEW.agci;
            ELSE
                -- Fallback: split AGCI evenly across the three categories
                origination_agci := NEW.agci / 3;
                site_agci := NEW.agci / 3;
                deal_agci := NEW.agci / 3;
            END IF;
        END;

        -- Update all payment_split records for this payment
        -- Apply broker's split percentages to the AGCI category amounts
        UPDATE payment_split
        SET
            split_origination_usd = (origination_agci * COALESCE(split_origination_percent, 0) / 100),
            split_site_usd = (site_agci * COALESCE(split_site_percent, 0) / 100),
            split_deal_usd = (deal_agci * COALESCE(split_deal_percent, 0) / 100),
            split_broker_total = (
                (origination_agci * COALESCE(split_origination_percent, 0) / 100) +
                (site_agci * COALESCE(split_site_percent, 0) / 100) +
                (deal_agci * COALESCE(split_deal_percent, 0) / 100)
            )
        WHERE payment_id = NEW.id;

        RAISE NOTICE 'Recalculated payment splits for payment % based on AGCI %', NEW.id, NEW.agci;
    END IF;

    RETURN NEW;
END;
$function$ LANGUAGE plpgsql;

COMMENT ON FUNCTION recalculate_payment_splits_on_amount_change() IS 'Recalculates broker commission splits when payment_amount or agci changes. Splits are calculated as percentages of AGCI (not payment_amount), broken down by category (origination/site/deal).';
