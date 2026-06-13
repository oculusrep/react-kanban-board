-- Drop the problematic trigger that prevents payment amount updates
-- This trigger was incorrectly blocking legitimate override updates

DROP TRIGGER IF EXISTS trigger_protect_payment_amount_override ON payment;
DROP FUNCTION IF EXISTS protect_payment_amount_override();

-- Note: This trigger was preventing payment amounts from being updated
-- even when we explicitly wanted to override them. The 3-step update process
-- in the frontend (clear override, update amount, set override) handles
-- protection correctly without needing a database trigger.
