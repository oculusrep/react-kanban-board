-- Test if referral_fee_usd is being calculated correctly when payment is overridden

-- Check current state
SELECT
    p.id as payment_id,
    p.payment_amount,
    p.agci,
    p.referral_fee_usd,
    p.amount_override,
    d.referral_fee_percent,
    -- What referral fee SHOULD be based on payment amount
    (p.payment_amount * COALESCE(d.referral_fee_percent, 0) / 100) as calculated_referral_fee
FROM payment p
JOIN deal d ON p.deal_id = d.id
WHERE p.id = '22ba622d-79f7-4d83-a082-87ada8c8ad3d';

-- Trigger an update to see if it recalculates
UPDATE payment
SET payment_amount = 9812
WHERE id = '22ba622d-79f7-4d83-a082-87ada8c8ad3d';

-- Check after update
SELECT
    p.id as payment_id,
    p.payment_amount,
    p.agci,
    p.referral_fee_usd as actual_referral_fee,
    d.referral_fee_percent,
    (p.payment_amount * COALESCE(d.referral_fee_percent, 0) / 100) as expected_referral_fee,
    -- Check if they match
    CASE
        WHEN p.referral_fee_usd = (p.payment_amount * COALESCE(d.referral_fee_percent, 0) / 100)
        THEN '✓ CORRECT'
        ELSE '✗ WRONG'
    END as status
FROM payment p
JOIN deal d ON p.deal_id = d.id
WHERE p.id = '22ba622d-79f7-4d83-a082-87ada8c8ad3d';
