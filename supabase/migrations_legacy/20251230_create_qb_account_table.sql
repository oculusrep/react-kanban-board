-- QuickBooks Chart of Accounts Table
-- Migration: 20251230_create_qb_account_table.sql
-- Purpose: Store QBO Chart of Accounts for budget tracking

-- ============================================================================
-- qb_account: Cache of QBO Chart of Accounts with budget targets
-- ============================================================================
CREATE TABLE IF NOT EXISTS qb_account (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qb_account_id TEXT NOT NULL UNIQUE,  -- QBO Account ID
    name TEXT NOT NULL,
    account_type TEXT NOT NULL,  -- 'Expense', 'Cost of Goods Sold', 'Income', etc.
    account_sub_type TEXT,  -- Sub-classification
    fully_qualified_name TEXT,  -- Full hierarchy path (e.g., "Expenses:Office Supplies")
    active BOOLEAN DEFAULT true,
    current_balance NUMERIC(12, 2),  -- Current balance from QBO

    -- Budget fields (OVIS-only, not from QBO)
    budget_amount NUMERIC(12, 2),  -- Monthly budget target
    budget_notes TEXT,  -- Notes about this budget category

    -- Sync tracking
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS qb_account_type_idx ON qb_account (account_type);
CREATE INDEX IF NOT EXISTS qb_account_active_idx ON qb_account (active) WHERE active = true;
CREATE INDEX IF NOT EXISTS qb_account_name_idx ON qb_account (name);

-- Updated_at trigger
DROP TRIGGER IF EXISTS qb_account_updated_at ON qb_account;
CREATE TRIGGER qb_account_updated_at
    BEFORE UPDATE ON qb_account
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- ============================================================================
-- Row Level Security - Admin only
-- ============================================================================
ALTER TABLE qb_account ENABLE ROW LEVEL SECURITY;

CREATE POLICY "qb_account_admin_all" ON qb_account
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "user" u
            WHERE u.auth_user_id = auth.uid()
            AND u.ovis_role = 'admin'
        )
    );

-- Grant service role access for Edge Functions
GRANT ALL ON qb_account TO service_role;
