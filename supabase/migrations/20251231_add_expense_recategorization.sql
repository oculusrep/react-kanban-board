-- Migration: Add columns for expense recategorization
-- These columns enable updating expense categories back to QuickBooks

-- Add sync_token for optimistic locking (required for QBO updates)
ALTER TABLE qb_expense ADD COLUMN IF NOT EXISTS sync_token TEXT;

-- Add entity tracking columns
-- qb_entity_type: 'Purchase' or 'Bill' (the actual QBO entity type)
-- qb_entity_id: The QBO entity ID (not the line item, the parent entity)
-- qb_line_id: The line item index within the entity
ALTER TABLE qb_expense ADD COLUMN IF NOT EXISTS qb_entity_type TEXT;
ALTER TABLE qb_expense ADD COLUMN IF NOT EXISTS qb_entity_id TEXT;
ALTER TABLE qb_expense ADD COLUMN IF NOT EXISTS qb_line_id TEXT;

-- Index for looking up expenses by QBO entity
CREATE INDEX IF NOT EXISTS qb_expense_entity_idx ON qb_expense (qb_entity_type, qb_entity_id);

-- Comment explaining the schema
COMMENT ON COLUMN qb_expense.sync_token IS 'QuickBooks SyncToken for optimistic locking during updates';
COMMENT ON COLUMN qb_expense.qb_entity_type IS 'QuickBooks entity type: Purchase or Bill';
COMMENT ON COLUMN qb_expense.qb_entity_id IS 'QuickBooks entity ID (the parent Purchase/Bill, not line item)';
COMMENT ON COLUMN qb_expense.qb_line_id IS 'Line item identifier within the QBO entity';
