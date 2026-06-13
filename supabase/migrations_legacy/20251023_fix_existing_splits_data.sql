-- One-time fix for existing payment_split data
-- This updates all existing payment splits to use the correct AGCI-based formula

-- Disable triggers temporarily to allow the update
ALTER TABLE payment_split DISABLE TRIGGER ALL;

-- Update all payment_split records with correct AGCI-based calculations
UPDATE payment_split ps
SET
  split_origination_usd = (d.origination_percent / 100) * p.agci * (ps.split_origination_percent / 100),
  split_site_usd = (d.site_percent / 100) * p.agci * (ps.split_site_percent / 100),
  split_deal_usd = (d.deal_percent / 100) * p.agci * (ps.split_deal_percent / 100),
  split_broker_total = (
    ((d.origination_percent / 100) * p.agci * (ps.split_origination_percent / 100)) +
    ((d.site_percent / 100) * p.agci * (ps.split_site_percent / 100)) +
    ((d.deal_percent / 100) * p.agci * (ps.split_deal_percent / 100))
  )
FROM payment p
JOIN deal d ON d.id = p.deal_id
WHERE ps.payment_id = p.id;

-- Re-enable triggers
ALTER TABLE payment_split ENABLE TRIGGER ALL;

-- Verify the fix for the specific deal we've been working on
SELECT
  p.payment_sequence,
  p.payment_amount,
  p.agci,
  ps.split_origination_usd,
  ps.split_site_usd,
  ps.split_deal_usd,
  ps.split_broker_total
FROM payment p
JOIN payment_split ps ON ps.payment_id = p.id
WHERE p.deal_id = 'be4b7d08-15ba-43cc-8743-65edec3fc4f8'
ORDER BY p.payment_sequence;
