-- Sync Closed Paid deal payment amounts to match Salesforce exactly
-- For closed deals, Salesforce is the source of truth

-- Update OVIS payment amounts to match Salesforce for Closed Paid deals
UPDATE payment p
SET payment_amount = sf."Payment_Amount__c"
FROM "salesforce_Payment__c" sf
INNER JOIN deal d ON d.id = p.deal_id
INNER JOIN deal_stage ds ON ds.id = d.stage_id
WHERE p.sf_id = sf."Id"
  AND ds.label = 'Closed Paid'
  AND p.is_active = true
  AND sf."Payment_Amount__c" IS NOT NULL
  AND ABS(p.payment_amount - sf."Payment_Amount__c") > 0.01;  -- Only update if different

-- Show what was updated
SELECT
  d.deal_name,
  p.payment_sequence,
  sf."Payment_Amount__c" AS salesforce_amount,
  p.payment_amount AS new_ovis_amount,
  'Updated to match Salesforce' AS status
FROM payment p
INNER JOIN deal d ON d.id = p.deal_id
INNER JOIN deal_stage ds ON ds.id = d.stage_id
INNER JOIN "salesforce_Payment__c" sf ON sf."Id" = p.sf_id
WHERE ds.label = 'Closed Paid'
  AND p.is_active = true
  AND sf."Payment_Amount__c" IS NOT NULL
ORDER BY d.deal_name, p.payment_sequence;

-- Summary
DO $$
DECLARE
  updated_count INTEGER;
BEGIN
  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RAISE NOTICE 'Updated % payment amounts to match Salesforce for Closed Paid deals', updated_count;
END $$;

COMMENT ON TABLE payment IS 'Closed Paid deal payment amounts synced to Salesforce as source of truth';
