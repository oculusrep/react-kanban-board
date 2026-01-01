-- Migration: Add qb_item table for mapping Items to Income accounts
-- Items (products/services) in QuickBooks link to income accounts
-- This allows us to properly categorize invoice income in the P&L

CREATE TABLE IF NOT EXISTS qb_item (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    qb_item_id TEXT NOT NULL UNIQUE,  -- QBO Item ID
    name TEXT NOT NULL,
    fully_qualified_name TEXT,
    item_type TEXT,  -- 'Service', 'Inventory', 'NonInventory', etc.
    active BOOLEAN DEFAULT true,
    income_account_id TEXT,  -- QBO Account ID for income
    income_account_name TEXT,
    expense_account_id TEXT,  -- QBO Account ID for COGS/expense
    expense_account_name TEXT,
    description TEXT,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for lookups
CREATE INDEX IF NOT EXISTS qb_item_income_account_idx ON qb_item (income_account_id);
CREATE INDEX IF NOT EXISTS qb_item_active_idx ON qb_item (active) WHERE active = true;

-- Updated_at trigger
DROP TRIGGER IF EXISTS qb_item_updated_at ON qb_item;
CREATE TRIGGER qb_item_updated_at
    BEFORE UPDATE ON qb_item
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- RLS
ALTER TABLE qb_item ENABLE ROW LEVEL SECURITY;

-- Admin only
CREATE POLICY "qb_item_admin_all" ON qb_item
    FOR ALL
    USING (
        EXISTS (
            SELECT 1 FROM "user" u
            WHERE u.auth_user_id = auth.uid()
            AND u.ovis_role = 'admin'
        )
    );

-- Grant to service role
GRANT ALL ON qb_item TO service_role;

-- Comment
COMMENT ON TABLE qb_item IS 'QuickBooks Items (products/services) with income account mappings';
COMMENT ON COLUMN qb_item.income_account_id IS 'QBO Account ID where income from this item is posted';
