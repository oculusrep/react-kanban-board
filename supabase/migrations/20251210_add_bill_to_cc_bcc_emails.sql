-- Add CC and BCC email fields to deal table for QuickBooks invoice email recipients
-- These complement the existing bill_to_email field

-- CC emails (comma-separated list of email addresses)
ALTER TABLE deal ADD COLUMN IF NOT EXISTS bill_to_cc_emails TEXT;

-- BCC emails (comma-separated list of email addresses)
ALTER TABLE deal ADD COLUMN IF NOT EXISTS bill_to_bcc_emails TEXT;

-- Comments explaining the purpose
COMMENT ON COLUMN deal.bill_to_cc_emails IS 'CC email addresses for invoice delivery (comma-separated). Auto-populated with deal team member emails.';
COMMENT ON COLUMN deal.bill_to_bcc_emails IS 'BCC email addresses for invoice delivery (comma-separated). Always includes mike@oculusrep.com by default.';
