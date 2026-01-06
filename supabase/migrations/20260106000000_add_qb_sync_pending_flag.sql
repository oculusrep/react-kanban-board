-- ============================================================================
-- Add QB Sync Pending Flag
-- ============================================================================
-- When payment_amount changes on a payment that's already linked to QuickBooks,
-- set a flag so the frontend knows to sync the updated amount.
-- ============================================================================

-- Add the qb_sync_pending column if it doesn't exist
ALTER TABLE payment
ADD COLUMN IF NOT EXISTS qb_sync_pending BOOLEAN DEFAULT FALSE;

-- Create function to set sync pending when amount changes
CREATE OR REPLACE FUNCTION set_qb_sync_pending_on_amount_change()
RETURNS TRIGGER AS $$
BEGIN
    -- Only set pending if:
    -- 1. payment_amount actually changed
    -- 2. The payment is linked to QuickBooks (has qb_invoice_id)
    IF NEW.payment_amount IS DISTINCT FROM OLD.payment_amount
       AND NEW.qb_invoice_id IS NOT NULL THEN
        NEW.qb_sync_pending := TRUE;
        RAISE NOTICE 'QB sync pending set for payment % (amount changed from % to %)',
            NEW.id, OLD.payment_amount, NEW.payment_amount;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Create the trigger
DROP TRIGGER IF EXISTS set_qb_sync_pending_trigger ON payment;

CREATE TRIGGER set_qb_sync_pending_trigger
    BEFORE UPDATE OF payment_amount ON payment
    FOR EACH ROW
    EXECUTE FUNCTION set_qb_sync_pending_on_amount_change();

-- Add comment
COMMENT ON COLUMN payment.qb_sync_pending IS
    'Set to true when payment_amount changes on a QB-linked payment. Frontend should sync and clear this flag.';

COMMENT ON FUNCTION set_qb_sync_pending_on_amount_change() IS
    'Automatically sets qb_sync_pending=true when payment_amount changes on a payment linked to QuickBooks.';
