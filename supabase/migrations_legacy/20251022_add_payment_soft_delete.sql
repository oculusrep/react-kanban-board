-- Add soft delete columns to payment table for payment lifecycle management
-- This supports automatic payment archiving when deals move to "Lost" stage
-- and payment restoration when deals move back to active stages

-- Add soft delete columns to payment table
ALTER TABLE payment
ADD COLUMN IF NOT EXISTS is_active BOOLEAN DEFAULT true,
ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add comment explaining the soft delete approach
COMMENT ON COLUMN payment.is_active IS 'Indicates if payment is active. Set to false when deal moves to Lost stage (for unpaid payments only)';
COMMENT ON COLUMN payment.deleted_at IS 'Timestamp when payment was archived/soft-deleted. NULL for active payments';

-- Create index for efficient querying of active payments
CREATE INDEX IF NOT EXISTS idx_payment_is_active ON payment(is_active);
CREATE INDEX IF NOT EXISTS idx_payment_deleted_at ON payment(deleted_at) WHERE deleted_at IS NOT NULL;

-- Update existing payments to be active
UPDATE payment SET is_active = true WHERE is_active IS NULL;
