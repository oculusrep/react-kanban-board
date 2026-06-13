-- Add payment tracking columns to qb_expense for accurate Cash basis reporting
-- Migration: 20260114_add_bill_payment_tracking.sql

-- Add payment status columns to qb_expense
ALTER TABLE qb_expense ADD COLUMN IF NOT EXISTS is_paid BOOLEAN DEFAULT NULL;
ALTER TABLE qb_expense ADD COLUMN IF NOT EXISTS payment_date DATE DEFAULT NULL;
ALTER TABLE qb_expense ADD COLUMN IF NOT EXISTS balance NUMERIC(12, 2) DEFAULT NULL;

-- For Bills: is_paid = false means unpaid, is_paid = true means paid
-- For Invoices: is_paid = false means uncollected, is_paid = true means collected
-- For Purchases/SalesReceipts: is_paid = NULL (always considered paid immediately)

-- Index for filtering by payment status (useful for Cash basis queries)
CREATE INDEX IF NOT EXISTS qb_expense_is_paid_idx ON qb_expense (is_paid) WHERE is_paid = false;
CREATE INDEX IF NOT EXISTS qb_expense_payment_date_idx ON qb_expense (payment_date) WHERE payment_date IS NOT NULL;

COMMENT ON COLUMN qb_expense.is_paid IS 'Payment status: true=paid, false=unpaid, null=immediate payment (Purchase/SalesReceipt)';
COMMENT ON COLUMN qb_expense.payment_date IS 'Date payment was received/made (for Cash basis reporting)';
COMMENT ON COLUMN qb_expense.balance IS 'Remaining balance (0 = fully paid)';
