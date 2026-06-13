-- Drop all triggers on payment_split table to allow manual control
-- These triggers are preventing correct broker split calculations when payment amounts are overridden

-- First, let's see what triggers exist (for documentation)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT tgname, pg_get_triggerdef(oid) as def
        FROM pg_trigger
        WHERE tgrelid = 'payment_split'::regclass
        AND NOT tgisinternal
    LOOP
        RAISE NOTICE 'Found trigger: % - %', r.tgname, r.def;
    END LOOP;
END $$;

-- Drop any existing triggers on payment_split
DROP TRIGGER IF EXISTS trg_payment_split_calculations ON payment_split;
DROP TRIGGER IF EXISTS trigger_calculate_payment_split_amounts ON payment_split;
DROP TRIGGER IF EXISTS trigger_sync_payment_splits ON payment_split;
DROP TRIGGER IF EXISTS trigger_recalculate_payment_splits ON payment_split;

-- Drop the associated functions if they exist
DROP FUNCTION IF EXISTS payment_split_calculations() CASCADE;
DROP FUNCTION IF EXISTS calculate_payment_split_amounts() CASCADE;
DROP FUNCTION IF EXISTS sync_payment_splits() CASCADE;

COMMENT ON TABLE payment_split IS 'Broker commission splits per payment. Values are managed by trigger on payment table (recalculate_payment_splits_on_amount_change) when payment.agci changes. Direct updates to this table are allowed for manual overrides.';
