-- Cleanup duplicate payment splits caused by number_of_payments changes
-- This removes duplicate splits while keeping the most recent one

-- Step 1: Find and delete duplicate payment splits
-- Keep only one split per payment/broker combination (using ROW_NUMBER to pick one)
WITH duplicates AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY payment_id, broker_id
      ORDER BY created_at DESC NULLS LAST, updated_at DESC NULLS LAST
    ) as rn
  FROM payment_split
)
DELETE FROM payment_split
WHERE id IN (
  SELECT id
  FROM duplicates
  WHERE rn > 1  -- Delete all except the first one (most recent)
);

-- Step 2: Log the cleanup
DO $$
DECLARE
  deleted_count INTEGER;
BEGIN
  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RAISE NOTICE 'Deleted % duplicate payment splits', deleted_count;
END $$;

COMMENT ON TABLE payment_split IS 'Updated to prevent duplicates when number_of_payments changes';
