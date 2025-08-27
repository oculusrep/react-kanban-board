-- Completely remove the payment split trigger
-- We'll handle all calculations in the frontend using React hooks

DROP TRIGGER IF EXISTS trigger_calculate_payment_split ON payment_split;
DROP FUNCTION IF EXISTS calculate_payment_split();

-- That's it - no more database-side interference with percentage changes