-- Recalculate AGCI and splits for all existing overridden payments
--
-- This migration triggers the recalculation for all payments where amount_override = true
-- by touching the payment_amount field (setting it to itself), which fires the triggers

-- Update all overridden payments to trigger recalculation
-- The BEFORE trigger will recalculate AGCI
-- The AFTER trigger will recalculate splits
UPDATE payment
SET payment_amount = payment_amount
WHERE amount_override = true;

-- Also update any payments where splits might be incorrect
-- (this catches non-overridden payments that may have wrong splits)
UPDATE payment
SET payment_amount = payment_amount
WHERE id IN (
    SELECT DISTINCT p.id
    FROM payment p
    JOIN payment_split ps ON ps.payment_id = p.id
    JOIN deal d ON d.id = p.deal_id
    WHERE ps.split_broker_total > 0  -- Has splits
);
