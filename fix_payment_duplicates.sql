-- ==============================================================================
-- Fix Payment Duplicate Issue
-- ==============================================================================
-- This script removes the problematic unique constraint and cleans up duplicates
-- before running the master migration script

-- Step 1: Drop the problematic unique index if it exists
DROP INDEX IF EXISTS idx_payment_sequence_unique;

-- Step 2: Create a better unique index that allows the UPSERT pattern
-- This will be added after the migration completes
-- For now, we just need to remove the blocking constraint

-- Step 3: Clean up any existing duplicate payment sequences
-- Keep the payment with the earliest created_at for each deal/sequence combo
WITH duplicates AS (
    SELECT
        id,
        ROW_NUMBER() OVER (
            PARTITION BY deal_id, payment_sequence
            ORDER BY
                CASE WHEN sf_id IS NOT NULL THEN 0 ELSE 1 END,  -- Prefer Salesforce records
                created_at ASC,
                id
        ) AS rn
    FROM payment
)
DELETE FROM payment
WHERE id IN (
    SELECT id FROM duplicates WHERE rn > 1
);

-- Step 4: Report on what we cleaned up
DO $$
DECLARE
    payment_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO payment_count FROM payment;
    RAISE NOTICE 'Total payments remaining after cleanup: %', payment_count;
END $$;
