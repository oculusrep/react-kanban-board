-- Add qb_invoice_number to payment table for tracking QBO invoice numbers
-- This is separate from our internal invoice numbering to avoid conflicts
ALTER TABLE payment ADD COLUMN IF NOT EXISTS qb_invoice_number TEXT;

-- Index for looking up by QBO invoice number
CREATE INDEX IF NOT EXISTS idx_payment_qb_invoice_number ON payment (qb_invoice_number) WHERE qb_invoice_number IS NOT NULL;

-- Add bill_to fields to deal table (as specified in QUICKBOOKS_INTEGRATION_SPEC.md)
-- These fields store the billing contact/address which may differ from the Client

ALTER TABLE deal ADD COLUMN IF NOT EXISTS bill_to_contact_name TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS bill_to_company_name TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS bill_to_email TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS bill_to_address_street TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS bill_to_address_city TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS bill_to_address_state TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS bill_to_address_zip TEXT;
ALTER TABLE deal ADD COLUMN IF NOT EXISTS bill_to_phone TEXT;

-- Comment explaining the purpose
COMMENT ON COLUMN payment.qb_invoice_number IS 'QuickBooks invoice number (e.g., INV-001). Separate from OVIS internal numbering.';
COMMENT ON COLUMN deal.bill_to_contact_name IS 'Contact person name for invoice delivery';
COMMENT ON COLUMN deal.bill_to_company_name IS 'Company name for billing (may differ from Client)';
COMMENT ON COLUMN deal.bill_to_email IS 'Email address for invoice delivery';
COMMENT ON COLUMN deal.bill_to_address_street IS 'Billing street address';
COMMENT ON COLUMN deal.bill_to_address_city IS 'Billing city';
COMMENT ON COLUMN deal.bill_to_address_state IS 'Billing state';
COMMENT ON COLUMN deal.bill_to_address_zip IS 'Billing ZIP code';
COMMENT ON COLUMN deal.bill_to_phone IS 'Billing contact phone number';
