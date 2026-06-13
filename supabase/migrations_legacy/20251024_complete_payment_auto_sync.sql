-- ============================================================================
-- COMPLETE PAYMENT AUTO-SYNC SYSTEM
-- ============================================================================
-- This migration creates a complete auto-sync system where:
-- 1. Payment AGCI is calculated automatically when payment amount changes
-- 2. Payment splits update automatically when payment is overridden
-- 3. Payment splits are created automatically when broker is added
-- 4. Payment splits update automatically when broker percentages change
-- 5. Payment splits are deleted automatically when broker is removed
--
-- This preserves the October 23rd payment override fix while adding
-- auto-sync for broker commission changes.
-- ============================================================================

-- ============================================================================
-- PART 1: PAYMENT TABLE TRIGGERS (From Oct 23 - Payment Override System)
-- ============================================================================

-- TRIGGER 1: Calculate Payment AGCI (BEFORE INSERT/UPDATE on payment)
-- Purpose: Calculates payment.agci and payment.referral_fee_usd when amount changes
-- Formula: Payment AGCI = (Payment Amount - Referral Fee) - (House % × Payment GCI)
-- ============================================================================
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

DROP TRIGGER IF EXISTS calculate_payment_agci_trigger ON payment;

CREATE TRIGGER calculate_payment_agci_trigger
    BEFORE INSERT OR UPDATE OF payment_amount, amount_override
    ON payment
    FOR EACH ROW
    EXECUTE FUNCTION calculate_payment_agci();

COMMENT ON FUNCTION calculate_payment_agci() IS
    'Calculates Payment AGCI and referral fee when payment amount changes. Used for payment overrides.';

-- ============================================================================
-- TRIGGER 2: Update Broker Splits (AFTER UPDATE on payment)
-- Purpose: Updates existing payment_split records when payment AGCI changes
-- Use case: Payment amount overrides
-- ============================================================================
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

DROP TRIGGER IF EXISTS update_broker_splits_trigger ON payment;

CREATE TRIGGER update_broker_splits_trigger
    AFTER UPDATE OF agci, payment_amount, amount_override
    ON payment
    FOR EACH ROW
    EXECUTE FUNCTION update_broker_splits_on_agci_change();

COMMENT ON FUNCTION update_broker_splits_on_agci_change() IS
    'Updates all broker splits when payment AGCI changes. Used for payment overrides.';

-- ============================================================================
-- PART 2: COMMISSION_SPLIT TABLE TRIGGERS (NEW - Auto-Sync System)
-- ============================================================================

-- ============================================================================
-- TRIGGER 3: Create Payment Splits for New Broker (AFTER INSERT on commission_split)
-- Purpose: When broker is added to a deal, create payment_split records for that broker
--          across all existing payments on that deal
-- User workflow: User adds a broker in Commission tab → splits auto-created
-- ============================================================================
CREATE OR REPLACE FUNCTION create_payment_splits_for_broker()
RETURNS TRIGGER AS $$
DECLARE
    v_payment RECORD;
    v_deal_origination_percent NUMERIC;
    v_deal_site_percent NUMERIC;
    v_deal_deal_percent NUMERIC;
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
        v_deal_origination_percent,
        v_deal_site_percent,
        v_deal_deal_percent
    FROM deal
    WHERE id = NEW.deal_id;

    -- For each payment on this deal, create a payment_split for this broker
    FOR v_payment IN
        SELECT id, agci
        FROM payment
        WHERE deal_id = NEW.deal_id
        ORDER BY payment_sequence
    LOOP
        -- Calculate category totals from payment AGCI
        v_origination_total := COALESCE(v_payment.agci, 0) * COALESCE(v_deal_origination_percent, 0) / 100;
        v_site_total := COALESCE(v_payment.agci, 0) * COALESCE(v_deal_site_percent, 0) / 100;
        v_deal_total := COALESCE(v_payment.agci, 0) * COALESCE(v_deal_deal_percent, 0) / 100;

        -- Create payment_split for this broker on this payment
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
            NEW.broker_id,
            NEW.split_origination_percent,
            NEW.split_site_percent,
            NEW.split_deal_percent,
            v_origination_total * COALESCE(NEW.split_origination_percent, 0) / 100,
            v_site_total * COALESCE(NEW.split_site_percent, 0) / 100,
            v_deal_total * COALESCE(NEW.split_deal_percent, 0) / 100,
            (v_origination_total * COALESCE(NEW.split_origination_percent, 0) / 100) +
            (v_site_total * COALESCE(NEW.split_site_percent, 0) / 100) +
            (v_deal_total * COALESCE(NEW.split_deal_percent, 0) / 100),
            false
        );
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS create_payment_splits_for_new_broker_trigger ON commission_split;

CREATE TRIGGER create_payment_splits_for_new_broker_trigger
    AFTER INSERT ON commission_split
    FOR EACH ROW
    EXECUTE FUNCTION create_payment_splits_for_broker();

COMMENT ON FUNCTION create_payment_splits_for_broker() IS
    'Creates payment_split records for a new broker across all payments on the deal';

-- ============================================================================
-- TRIGGER 4: Update Payment Splits When Broker Percentages Change (AFTER UPDATE on commission_split)
-- Purpose: When broker commission percentages are edited, update all payment_split records
--          for that broker across all payments on that deal
-- User workflow: User changes broker % in Commission tab → splits auto-updated
-- Example: Change Broker A from 50/25/25 to 60/20/20 → all splits recalculated
-- ============================================================================
CREATE OR REPLACE FUNCTION update_payment_splits_for_broker()
RETURNS TRIGGER AS $$
DECLARE
    v_payment RECORD;
    v_deal_origination_percent NUMERIC;
    v_deal_site_percent NUMERIC;
    v_deal_deal_percent NUMERIC;
    v_origination_total NUMERIC;
    v_site_total NUMERIC;
    v_deal_total NUMERIC;
BEGIN
    -- Only proceed if percentages actually changed
    IF (NEW.split_origination_percent IS DISTINCT FROM OLD.split_origination_percent) OR
       (NEW.split_site_percent IS DISTINCT FROM OLD.split_site_percent) OR
       (NEW.split_deal_percent IS DISTINCT FROM OLD.split_deal_percent) THEN

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
        WHERE id = NEW.deal_id;

        -- For each payment on this deal, update this broker's payment_split
        FOR v_payment IN
            SELECT id, agci
            FROM payment
            WHERE deal_id = NEW.deal_id
            ORDER BY payment_sequence
        LOOP
            -- Calculate category totals from payment AGCI
            v_origination_total := COALESCE(v_payment.agci, 0) * COALESCE(v_deal_origination_percent, 0) / 100;
            v_site_total := COALESCE(v_payment.agci, 0) * COALESCE(v_deal_site_percent, 0) / 100;
            v_deal_total := COALESCE(v_payment.agci, 0) * COALESCE(v_deal_deal_percent, 0) / 100;

            -- Update payment_split for this broker on this payment
            UPDATE payment_split
            SET
                split_origination_percent = NEW.split_origination_percent,
                split_site_percent = NEW.split_site_percent,
                split_deal_percent = NEW.split_deal_percent,
                split_origination_usd = v_origination_total * COALESCE(NEW.split_origination_percent, 0) / 100,
                split_site_usd = v_site_total * COALESCE(NEW.split_site_percent, 0) / 100,
                split_deal_usd = v_deal_total * COALESCE(NEW.split_deal_percent, 0) / 100,
                split_broker_total = (
                    (v_origination_total * COALESCE(NEW.split_origination_percent, 0) / 100) +
                    (v_site_total * COALESCE(NEW.split_site_percent, 0) / 100) +
                    (v_deal_total * COALESCE(NEW.split_deal_percent, 0) / 100)
                )
            WHERE payment_id = v_payment.id
              AND broker_id = NEW.broker_id;
        END LOOP;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS update_payment_splits_for_broker_trigger ON commission_split;

CREATE TRIGGER update_payment_splits_for_broker_trigger
    AFTER UPDATE ON commission_split
    FOR EACH ROW
    EXECUTE FUNCTION update_payment_splits_for_broker();

COMMENT ON FUNCTION update_payment_splits_for_broker() IS
    'Updates payment_split records when broker commission percentages are changed';

-- ============================================================================
-- TRIGGER 5: Delete Payment Splits When Broker Removed (AFTER DELETE on commission_split)
-- Purpose: When broker is removed from a deal, delete all payment_split records
--          for that broker across all payments on that deal
-- User workflow: User removes broker from Commission tab → splits auto-deleted
-- ============================================================================
CREATE OR REPLACE FUNCTION delete_payment_splits_for_broker()
RETURNS TRIGGER AS $$
BEGIN
    -- Delete all payment_split records for this broker on this deal
    DELETE FROM payment_split
    WHERE broker_id = OLD.broker_id
      AND payment_id IN (
          SELECT id FROM payment WHERE deal_id = OLD.deal_id
      );

    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS delete_payment_splits_for_broker_trigger ON commission_split;

CREATE TRIGGER delete_payment_splits_for_broker_trigger
    AFTER DELETE ON commission_split
    FOR EACH ROW
    EXECUTE FUNCTION delete_payment_splits_for_broker();

COMMENT ON FUNCTION delete_payment_splits_for_broker() IS
    'Deletes payment_split records when a broker is removed from a deal';

-- ============================================================================
-- VERIFICATION: List all triggers we just created
-- ============================================================================
SELECT
    event_object_table as table_name,
    trigger_name,
    action_timing || ' ' || event_manipulation as fires_on,
    action_statement as executes
FROM information_schema.triggers
WHERE trigger_name IN (
    'calculate_payment_agci_trigger',
    'update_broker_splits_trigger',
    'create_payment_splits_for_new_broker_trigger',
    'update_payment_splits_for_broker_trigger',
    'delete_payment_splits_for_broker_trigger'
)
ORDER BY
    event_object_table,
    CASE action_timing
        WHEN 'BEFORE' THEN 1
        WHEN 'AFTER' THEN 2
    END,
    trigger_name;

-- ============================================================================
-- SUMMARY
-- ============================================================================
-- Payment Table Triggers (2):
--   1. calculate_payment_agci_trigger - BEFORE INSERT/UPDATE - Calculates AGCI
--   2. update_broker_splits_trigger - AFTER UPDATE - Updates splits on override
--
-- Commission Split Table Triggers (3):
--   3. create_payment_splits_for_new_broker_trigger - AFTER INSERT - Creates splits
--   4. update_payment_splits_for_broker_trigger - AFTER UPDATE - Updates splits
--   5. delete_payment_splits_for_broker_trigger - AFTER DELETE - Deletes splits
--
-- Total: 5 triggers
-- No triggers on payment_split table (prevents conflicts from Oct 23)
-- ============================================================================
