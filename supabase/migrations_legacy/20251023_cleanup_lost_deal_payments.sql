-- Clean up all existing Lost deals by archiving unpaid payments
-- This brings existing data in line with the payment lifecycle management system

-- Archive unpaid payments for all Lost deals
UPDATE payment p
SET
  is_active = false,
  deleted_at = NOW()
FROM deal d, deal_stage ds
WHERE p.deal_id = d.id
  AND d.stage_id = ds.id
  AND ds.label = 'Lost'
  AND p.payment_received = false  -- Only unpaid payments
  AND p.is_active = true;  -- Only currently active payments

-- Show what was archived
SELECT
  d.deal_name,
  COUNT(p.id) AS payments_archived,
  STRING_AGG('Payment ' || p.payment_sequence::text, ', ') AS payment_numbers
FROM payment p
INNER JOIN deal d ON d.id = p.deal_id
INNER JOIN deal_stage ds ON ds.id = d.stage_id
WHERE ds.label = 'Lost'
  AND p.is_active = false
  AND p.deleted_at IS NOT NULL
GROUP BY d.deal_name
ORDER BY d.deal_name;

-- Summary statistics
DO $$
DECLARE
  total_lost_deals INTEGER;
  total_archived_payments INTEGER;
  total_preserved_payments INTEGER;
BEGIN
  -- Count Lost deals
  SELECT COUNT(DISTINCT d.id) INTO total_lost_deals
  FROM deal d
  INNER JOIN deal_stage ds ON ds.id = d.stage_id
  WHERE ds.label = 'Lost';

  -- Count archived payments
  SELECT COUNT(*) INTO total_archived_payments
  FROM payment p
  INNER JOIN deal d ON d.id = p.deal_id
  INNER JOIN deal_stage ds ON ds.id = d.stage_id
  WHERE ds.label = 'Lost'
    AND p.is_active = false;

  -- Count preserved paid payments
  SELECT COUNT(*) INTO total_preserved_payments
  FROM payment p
  INNER JOIN deal d ON d.id = p.deal_id
  INNER JOIN deal_stage ds ON ds.id = d.stage_id
  WHERE ds.label = 'Lost'
    AND p.is_active = true
    AND p.payment_received = true;

  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Lost Deal Payment Cleanup Summary';
  RAISE NOTICE '==========================================';
  RAISE NOTICE 'Total Lost deals: %', total_lost_deals;
  RAISE NOTICE 'Unpaid payments archived: %', total_archived_payments;
  RAISE NOTICE 'Paid payments preserved: %', total_preserved_payments;
  RAISE NOTICE '==========================================';
END $$;
