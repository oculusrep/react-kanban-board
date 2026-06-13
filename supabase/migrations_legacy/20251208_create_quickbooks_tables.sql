-- QuickBooks Online Integration Tables
-- Migration: 20251208_create_quickbooks_tables.sql

-- ============================================================================
-- qb_connection: Stores OAuth tokens and connection status
-- ============================================================================
CREATE TABLE IF NOT EXISTS qb_connection (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    realm_id TEXT NOT NULL UNIQUE,  -- QBO Company ID
    access_token TEXT NOT NULL,
    refresh_token TEXT NOT NULL,
    access_token_expires_at TIMESTAMPTZ NOT NULL,
    refresh_token_expires_at TIMESTAMPTZ NOT NULL,
    connected_by UUID REFERENCES "user"(id),
    connected_at TIMESTAMPTZ DEFAULT NOW(),
    last_sync_at TIMESTAMPTZ,
    status TEXT NOT NULL DEFAULT 'connected' CHECK (status IN ('connected', 'expired', 'error')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Only one active connection allowed (single company-wide connection)
CREATE UNIQUE INDEX IF NOT EXISTS qb_connection_single_active
ON qb_connection (status) WHERE status = 'connected';

-- ============================================================================
-- qb_sync_log: Tracks sync history for admin visibility
-- ============================================================================
CREATE TABLE IF NOT EXISTS qb_sync_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sync_type TEXT NOT NULL CHECK (sync_type IN ('invoice', 'payment', 'expense', 'customer', 'vendor', 'bill')),
    direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('success', 'failed', 'pending')),
    entity_id UUID,  -- FK to the OVIS entity (payment, client, etc.)
    entity_type TEXT,  -- 'payment', 'client', 'broker', etc.
    qb_entity_id TEXT,  -- QBO entity ID
    error_message TEXT,
    retry_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for querying sync history
CREATE INDEX IF NOT EXISTS qb_sync_log_created_at_idx ON qb_sync_log (created_at DESC);
CREATE INDEX IF NOT EXISTS qb_sync_log_status_idx ON qb_sync_log (status) WHERE status = 'failed';
CREATE INDEX IF NOT EXISTS qb_sync_log_entity_idx ON qb_sync_log (entity_id, entity_type);

-- ============================================================================
-- qb_expense: Stores imported expenses from QBO
-- ============================================================================
CREATE TABLE IF NOT EXISTS qb_expense (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qb_transaction_id TEXT NOT NULL UNIQUE,  -- QBO transaction ID
    transaction_type TEXT,  -- 'Purchase', 'Bill', 'Expense', etc.
    transaction_date DATE NOT NULL,
    vendor_name TEXT,
    category TEXT,  -- QBO Chart of Accounts category name
    account_id TEXT,  -- QBO account ID
    account_name TEXT,  -- QBO account name
    description TEXT,  -- Memo/description
    amount NUMERIC(12, 2) NOT NULL,
    imported_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for expense queries
CREATE INDEX IF NOT EXISTS qb_expense_date_idx ON qb_expense (transaction_date DESC);
CREATE INDEX IF NOT EXISTS qb_expense_category_idx ON qb_expense (category);
CREATE INDEX IF NOT EXISTS qb_expense_account_idx ON qb_expense (account_id);

-- ============================================================================
-- Updated_at trigger function (reuse if exists)
-- ============================================================================
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply triggers
DROP TRIGGER IF EXISTS qb_connection_updated_at ON qb_connection;
CREATE TRIGGER qb_connection_updated_at
    BEFORE UPDATE ON qb_connection
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS qb_sync_log_updated_at ON qb_sync_log;
CREATE TRIGGER qb_sync_log_updated_at
    BEFORE UPDATE ON qb_sync_log
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

DROP TRIGGER IF EXISTS qb_expense_updated_at ON qb_expense;
CREATE TRIGGER qb_expense_updated_at
    BEFORE UPDATE ON qb_expense
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security
-- ============================================================================
ALTER TABLE qb_connection ENABLE ROW LEVEL SECURITY;
ALTER TABLE qb_sync_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE qb_expense ENABLE ROW LEVEL SECURITY;

-- QBO Connection: Admin only
CREATE POLICY "qb_connection_admin_all" ON qb_connection
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "user" u
            WHERE u.auth_user_id = auth.uid()
            AND u.ovis_role = 'admin'
        )
    );

-- QBO Sync Log: Admin only
CREATE POLICY "qb_sync_log_admin_all" ON qb_sync_log
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "user" u
            WHERE u.auth_user_id = auth.uid()
            AND u.ovis_role = 'admin'
        )
    );

-- QBO Expense: Admin only
CREATE POLICY "qb_expense_admin_all" ON qb_expense
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
GRANT ALL ON qb_connection TO service_role;
GRANT ALL ON qb_sync_log TO service_role;
GRANT ALL ON qb_expense TO service_role;
