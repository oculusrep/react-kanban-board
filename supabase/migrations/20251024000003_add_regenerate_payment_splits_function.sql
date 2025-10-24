-- ============================================================================
-- Utility Function: Regenerate Payment Splits for a Deal
-- ============================================================================
-- This function completely rebuilds payment_split records for a deal.
-- Use this to fix deals that got messed up during testing or migration.
--
-- Usage:
--   SELECT regenerate_payment_splits_for_deal('deal-id-here');
-- ============================================================================

CREATE OR REPLACE FUNCTION regenerate_payment_splits_for_deal(p_deal_id UUID)
RETURNS TEXT AS $$
DECLARE
    v_payment RECORD;
    v_commission_split RECORD;
    v_deal_origination_percent NUMERIC;
    v_deal_site_percent NUMERIC;
    v_deal_deal_percent NUMERIC;
    v_origination_total NUMERIC;
    v_site_total NUMERIC;
    v_deal_total NUMERIC;
    v_deleted_count INTEGER := 0;
    v_created_count INTEGER := 0;
BEGIN
    -- Get deal category percentages
    SELECT
        origination_percent,
        site_percent,
        deal_percent
    INTO
        v_deal_origination_percent,
        v_deal_site_percent,
        v_deal_deal_percent
    FROM deal
    WHERE id = p_deal_id;

    IF NOT FOUND THEN
        RETURN 'ERROR: Deal not found';
    END IF;

    -- Step 1: Delete all existing payment_splits for this deal
    DELETE FROM payment_split
    WHERE payment_id IN (
        SELECT id FROM payment WHERE deal_id = p_deal_id
    );
    GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

    -- Step 2: Recreate payment_splits for each payment × broker combination
    FOR v_payment IN
        SELECT id, payment_sequence, agci
        FROM payment
        WHERE deal_id = p_deal_id
        ORDER BY payment_sequence
    LOOP
        -- For each broker on this deal
        FOR v_commission_split IN
            SELECT
                broker_id,
                split_origination_percent,
                split_site_percent,
                split_deal_percent
            FROM commission_split
            WHERE deal_id = p_deal_id
        LOOP
            -- Calculate category totals from payment AGCI
            v_origination_total := COALESCE(v_payment.agci, 0) * COALESCE(v_deal_origination_percent, 0) / 100;
            v_site_total := COALESCE(v_payment.agci, 0) * COALESCE(v_deal_site_percent, 0) / 100;
            v_deal_total := COALESCE(v_payment.agci, 0) * COALESCE(v_deal_deal_percent, 0) / 100;

            -- Create payment_split
            INSERT INTO payment_split (
                payment_id,
                broker_id,
                split_origination_percent,
                split_site_percent,
                split_deal_percent,
                split_origination_usd,
                split_site_usd,
                split_deal_usd,
                split_broker_total,
                paid
            ) VALUES (
                v_payment.id,
                v_commission_split.broker_id,
                v_commission_split.split_origination_percent,
                v_commission_split.split_site_percent,
                v_commission_split.split_deal_percent,
                v_origination_total * COALESCE(v_commission_split.split_origination_percent, 0) / 100,
                v_site_total * COALESCE(v_commission_split.split_site_percent, 0) / 100,
                v_deal_total * COALESCE(v_commission_split.split_deal_percent, 0) / 100,
                (v_origination_total * COALESCE(v_commission_split.split_origination_percent, 0) / 100) +
                (v_site_total * COALESCE(v_commission_split.split_site_percent, 0) / 100) +
                (v_deal_total * COALESCE(v_commission_split.split_deal_percent, 0) / 100),
                false
            );

            v_created_count := v_created_count + 1;
        END LOOP;
    END LOOP;

    RETURN format('SUCCESS: Deleted %s old payment_splits, created %s new payment_splits',
                  v_deleted_count, v_created_count);
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION regenerate_payment_splits_for_deal(UUID) IS
    'Completely rebuilds payment_split records for a deal. Use to fix messed up data from testing or migration.';

-- ============================================================================
-- Example Usage:
-- ============================================================================
-- SELECT regenerate_payment_splits_for_deal('e8cdc938-48fc-4da7-8d1b-1b9791884587');
--
-- Returns: "SUCCESS: Deleted 6 old payment_splits, created 6 new payment_splits"
-- ============================================================================
