-- Add user_id foreign key to broker table to link brokers to their user accounts
-- This enables querying broker emails directly via the relationship

-- Add user_id column with foreign key constraint
ALTER TABLE broker ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES "user"(id);

-- Create index for the foreign key
CREATE INDEX IF NOT EXISTS idx_broker_user_id ON broker(user_id);

-- Update existing brokers to link to their user accounts by name matching
UPDATE broker b
SET user_id = u.id
FROM "user" u
WHERE LOWER(b.name) = LOWER(u.name) AND b.user_id IS NULL;

-- Add comment explaining the relationship
COMMENT ON COLUMN broker.user_id IS 'Foreign key to user table - links broker to their system user account for email lookup';
