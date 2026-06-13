-- Third cleanup: Archive unpaid payments for Lost deals
-- Found 3 active unpaid payments on Lost deals that were missed by previous cleanups
-- These deals likely moved to Lost after the auto-archive trigger was created but
-- the trigger didn't fire (possibly due to direct database update or other issue)

-- Archive unpaid payments for all Lost deals
UPDATE payment p
SET is_active = false,
    deleted_at = NOW()
FROM deal d, deal_stage ds
WHERE p.deal_id = d.id
  AND d.stage_id = ds.id
  AND ds.label = 'Lost'
  AND p.payment_received = false  -- Only unpaid
  AND p.is_active = true;

-- Show results
SELECT
  COUNT(*) as payments_archived,
  COUNT(DISTINCT d.id) as deals_affected
FROM payment p
INNER JOIN deal d ON d.id = p.deal_id
INNER JOIN deal_stage ds ON ds.id = d.stage_id
WHERE ds.label = 'Lost'
  AND p.payment_received = false
  AND p.is_active = false
  AND p.deleted_at > NOW() - INTERVAL '1 minute';
