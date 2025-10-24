-- ============================================================================
-- Remove Conflicting Payment Split Trigger
-- ============================================================================
-- This trigger was interfering with our auto-sync system by recalculating
-- payment_split values BEFORE they could be saved, resulting in $0 amounts.
--
-- We don't need triggers on payment_split table - all calculations should
-- come from triggers on the payment and commission_split tables.
-- ============================================================================

-- Drop the conflicting trigger and function
DROP TRIGGER IF EXISTS trigger_calculate_payment_split ON payment_split;
DROP FUNCTION IF EXISTS calculate_payment_split() CASCADE;

COMMENT ON TABLE payment_split IS
    'Broker commission splits per payment. Values are calculated by triggers on payment and commission_split tables. NO triggers should exist on this table to prevent conflicts.';

-- Verify no triggers remain on payment_split
SELECT
    trigger_name,
    action_timing,
    event_manipulation
FROM information_schema.triggers
WHERE event_object_table = 'payment_split';
