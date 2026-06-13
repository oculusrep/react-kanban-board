-- QuickBooks Commission Mapping
-- Migration: 20260129_qb_commission_mapping.sql
--
-- This migration creates the infrastructure needed to automatically create
-- QBO entries (Bills or Journal Entries) when broker/referral payments are marked as paid.
--
-- Broker Commission Flows:
-- - Arty: Journal Entry (Debit: Commission Paid Out: Santos Real Estate Partners, LLC / Credit: Santos Real Estate Commission Draw)
-- - Greg: Bill to vendor Bennett Retail Group (Debit: Commissions Paid Out: Bennett Retail Group)
-- - Referral Partners: Bill to vendor (Debit: Commissions Paid Out: Referral Fee to Other Broker)

-- ============================================================================
-- Add qb_vendor_id to broker table for linking brokers to QBO Vendors
-- ============================================================================
ALTER TABLE broker ADD COLUMN IF NOT EXISTS qb_vendor_id TEXT;
ALTER TABLE broker ADD COLUMN IF NOT EXISTS qb_vendor_name TEXT;

-- ============================================================================
-- Add qb_vendor_id to client table for linking referral partners to QBO Vendors
-- ============================================================================
ALTER TABLE client ADD COLUMN IF NOT EXISTS qb_vendor_id TEXT;
ALTER TABLE client ADD COLUMN IF NOT EXISTS qb_vendor_name TEXT;

-- ============================================================================
-- qb_commission_mapping: Stores the QBO configuration for each broker/referral
-- This determines how to create QBO entries when marking payments as paid
-- ============================================================================
CREATE TABLE IF NOT EXISTS qb_commission_mapping (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Entity reference (either broker or referral partner client)
    entity_type TEXT NOT NULL CHECK (entity_type IN ('broker', 'referral_partner')),
    broker_id UUID REFERENCES broker(id) ON DELETE CASCADE,
    client_id UUID REFERENCES client(id) ON DELETE CASCADE,

    -- QBO Vendor (for bills, not needed for journal entries)
    qb_vendor_id TEXT,
    qb_vendor_name TEXT,

    -- Payment method determines what QBO object to create
    payment_method TEXT NOT NULL CHECK (payment_method IN ('bill', 'journal_entry')),

    -- Debit account (expense account)
    qb_debit_account_id TEXT NOT NULL,
    qb_debit_account_name TEXT NOT NULL,

    -- Credit account (only used for journal entries; bills auto-credit AP)
    qb_credit_account_id TEXT,
    qb_credit_account_name TEXT,

    -- Description template (can include placeholders like {deal_name}, {payment_date})
    description_template TEXT,

    -- Whether this mapping is active
    is_active BOOLEAN DEFAULT true,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by_id UUID REFERENCES "user"(auth_user_id),
    updated_by_id UUID REFERENCES "user"(auth_user_id),

    -- Constraints
    CONSTRAINT broker_or_client_required CHECK (
        (entity_type = 'broker' AND broker_id IS NOT NULL AND client_id IS NULL) OR
        (entity_type = 'referral_partner' AND client_id IS NOT NULL AND broker_id IS NULL)
    ),
    CONSTRAINT credit_account_for_journal_entry CHECK (
        payment_method != 'journal_entry' OR
        (qb_credit_account_id IS NOT NULL AND qb_credit_account_name IS NOT NULL)
    ),
    CONSTRAINT vendor_for_bill CHECK (
        payment_method != 'bill' OR
        (qb_vendor_id IS NOT NULL AND qb_vendor_name IS NOT NULL)
    )
);

-- Ensure only one active mapping per broker
CREATE UNIQUE INDEX IF NOT EXISTS qb_commission_mapping_broker_unique
ON qb_commission_mapping (broker_id)
WHERE broker_id IS NOT NULL AND is_active = true;

-- Ensure only one active mapping per referral partner client
CREATE UNIQUE INDEX IF NOT EXISTS qb_commission_mapping_client_unique
ON qb_commission_mapping (client_id)
WHERE client_id IS NOT NULL AND is_active = true;

-- Indexes for lookups
CREATE INDEX IF NOT EXISTS qb_commission_mapping_entity_type_idx ON qb_commission_mapping (entity_type);
CREATE INDEX IF NOT EXISTS qb_commission_mapping_broker_id_idx ON qb_commission_mapping (broker_id) WHERE broker_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS qb_commission_mapping_client_id_idx ON qb_commission_mapping (client_id) WHERE client_id IS NOT NULL;

-- ============================================================================
-- qb_commission_entry: Tracks QBO entries created for commission payments
-- ============================================================================
CREATE TABLE IF NOT EXISTS qb_commission_entry (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    -- Link to the payment split that triggered this entry
    payment_split_id UUID NOT NULL REFERENCES payment_split(id) ON DELETE CASCADE,

    -- Which mapping was used
    commission_mapping_id UUID REFERENCES qb_commission_mapping(id),

    -- QBO entity created
    qb_entity_type TEXT NOT NULL CHECK (qb_entity_type IN ('Bill', 'JournalEntry')),
    qb_entity_id TEXT NOT NULL,  -- QBO Bill ID or Journal Entry ID
    qb_doc_number TEXT,          -- QBO document number

    -- Amount and date
    amount NUMERIC(12, 2) NOT NULL,
    transaction_date DATE NOT NULL,

    -- Status tracking
    status TEXT NOT NULL DEFAULT 'created' CHECK (status IN ('created', 'paid', 'voided', 'error')),
    error_message TEXT,

    -- Metadata
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    created_by_id UUID REFERENCES "user"(auth_user_id)
);

-- Ensure one QBO entry per payment split
CREATE UNIQUE INDEX IF NOT EXISTS qb_commission_entry_payment_split_unique
ON qb_commission_entry (payment_split_id)
WHERE status != 'voided';

-- Indexes
CREATE INDEX IF NOT EXISTS qb_commission_entry_mapping_idx ON qb_commission_entry (commission_mapping_id);
CREATE INDEX IF NOT EXISTS qb_commission_entry_date_idx ON qb_commission_entry (transaction_date DESC);
CREATE INDEX IF NOT EXISTS qb_commission_entry_status_idx ON qb_commission_entry (status);

-- ============================================================================
-- Updated_at trigger
-- ============================================================================
DROP TRIGGER IF EXISTS qb_commission_mapping_updated_at ON qb_commission_mapping;
CREATE TRIGGER qb_commission_mapping_updated_at
    BEFORE UPDATE ON qb_commission_mapping
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS qb_commission_entry_updated_at ON qb_commission_entry;
CREATE TRIGGER qb_commission_entry_updated_at
    BEFORE UPDATE ON qb_commission_entry
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE qb_commission_mapping ENABLE ROW LEVEL SECURITY;
ALTER TABLE qb_commission_entry ENABLE ROW LEVEL SECURITY;

-- QBO Commission Mapping: Admin only
CREATE POLICY "qb_commission_mapping_admin_all" ON qb_commission_mapping
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "user" u
            WHERE u.auth_user_id = auth.uid()
            AND u.ovis_role = 'admin'
        )
    );

-- QBO Commission Entry: Admin only
CREATE POLICY "qb_commission_entry_admin_all" ON qb_commission_entry
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "user" u
            WHERE u.auth_user_id = auth.uid()
            AND u.ovis_role = 'admin'
        )
    );

-- ============================================================================
-- Grant permissions to service role (for Edge Functions)
-- ============================================================================
GRANT ALL ON qb_commission_mapping TO service_role;
GRANT ALL ON qb_commission_entry TO service_role;

-- ============================================================================
-- Add 'journal_entry' to qb_sync_log sync_type if not already there
-- ============================================================================
ALTER TABLE qb_sync_log DROP CONSTRAINT IF EXISTS qb_sync_log_sync_type_check;
ALTER TABLE qb_sync_log ADD CONSTRAINT qb_sync_log_sync_type_check
    CHECK (sync_type IN ('invoice', 'payment', 'expense', 'customer', 'vendor', 'bill', 'journal_entry'));

-- ============================================================================
-- Insert initial mapping data (to be filled in with actual QBO account IDs)
-- ============================================================================
-- Note: These are placeholder entries. The actual QBO account IDs need to be
-- filled in after looking up the accounts in QuickBooks Online.

-- Example structure (commented out until QBO IDs are known):
-- INSERT INTO qb_commission_mapping (entity_type, broker_id, payment_method, qb_vendor_id, qb_vendor_name, qb_debit_account_id, qb_debit_account_name, qb_credit_account_id, qb_credit_account_name, description_template)
-- VALUES
--   -- Arty (Journal Entry)
--   ('broker', (SELECT id FROM broker WHERE name ILIKE '%arty%' OR name ILIKE '%santos%' LIMIT 1),
--    'journal_entry', NULL, NULL,
--    'TBD', 'Commission Paid Out: Santos Real Estate Partners, LLC',
--    'TBD', 'Santos Real Estate Commission Draw',
--    'Commission payment for {deal_name}'),
--
--   -- Greg (Bill)
--   ('broker', (SELECT id FROM broker WHERE name ILIKE '%greg%' OR name ILIKE '%bennett%' LIMIT 1),
--    'bill', 'TBD', 'Bennett Retail Group',
--    'TBD', 'Commissions Paid Out: Bennett Retail Group',
--    NULL, NULL,
--    'Commission payment for {deal_name}');

COMMENT ON TABLE qb_commission_mapping IS 'Stores QBO configuration for broker and referral partner commission payments';
COMMENT ON TABLE qb_commission_entry IS 'Tracks QBO entries (Bills/Journal Entries) created for commission payments';
