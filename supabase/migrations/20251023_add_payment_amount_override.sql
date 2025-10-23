-- Add amount_override flag to payment table
-- This allows manual override of payment amounts that won't be recalculated by triggers

-- Add amount_override column
ALTER TABLE payment
ADD COLUMN IF NOT EXISTS amount_override BOOLEAN DEFAULT false;

-- Add audit columns for tracking overrides
ALTER TABLE payment
ADD COLUMN IF NOT EXISTS override_by UUID REFERENCES auth.users(id),
ADD COLUMN IF NOT EXISTS override_at TIMESTAMP WITH TIME ZONE;

-- Add comments
COMMENT ON COLUMN payment.amount_override IS 'If true, payment_amount has been manually overridden and should not be auto-recalculated';
COMMENT ON COLUMN payment.override_by IS 'User ID who set the override';
COMMENT ON COLUMN payment.override_at IS 'Timestamp when override was set';

-- Create index for querying overridden payments
CREATE INDEX IF NOT EXISTS idx_payment_amount_override ON payment(amount_override) WHERE amount_override = true;
