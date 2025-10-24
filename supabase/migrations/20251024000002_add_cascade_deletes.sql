-- ============================================================================
-- Add CASCADE and SET NULL Deletes for Deal-Related Tables
-- ============================================================================
-- When a deal is deleted:
--
-- AUTO-DELETE (CASCADE):
-- - Payments (deal-specific, no value without deal)
-- - Commission splits (deal-specific)
-- - Payment splits (via payment CASCADE)
-- - Deal contacts (just a link table, contact record stays)
-- - Activities (user wants these deleted)
-- - Notes (user wants these deleted via note_object_link)
--
-- KEEP BUT UNLINK (SET NULL):
-- - Assignments (keep task, remove deal reference)
-- - Property units (exist independently of deals)
-- - Site submits (exist independently of deals)
-- ============================================================================

-- ============================================================================
-- Part 1: CASCADE DELETES (auto-delete when deal deleted)
-- ============================================================================

-- 1a. Payment → CASCADE
ALTER TABLE payment
DROP CONSTRAINT IF EXISTS payment_deal_id_fkey,
ADD CONSTRAINT payment_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES deal(id) ON DELETE CASCADE;

-- 1b. Commission Split → CASCADE
ALTER TABLE commission_split
DROP CONSTRAINT IF EXISTS commission_split_deal_id_fkey,
ADD CONSTRAINT commission_split_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES deal(id) ON DELETE CASCADE;

-- 1c. Payment Split → CASCADE (when payment is deleted)
ALTER TABLE payment_split
DROP CONSTRAINT IF EXISTS payment_split_payment_id_fkey,
ADD CONSTRAINT payment_split_payment_id_fkey
    FOREIGN KEY (payment_id) REFERENCES payment(id) ON DELETE CASCADE;

-- 1d. Deal Contact → CASCADE (just a link table, contact record stays)
ALTER TABLE deal_contact
DROP CONSTRAINT IF EXISTS deal_contact_deal_id_fkey,
ADD CONSTRAINT deal_contact_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES deal(id) ON DELETE CASCADE;

-- 1e. Activity → CASCADE (user wants activities deleted with deal)
ALTER TABLE activity
DROP CONSTRAINT IF EXISTS activity_deal_id_fkey,
ADD CONSTRAINT activity_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES deal(id) ON DELETE CASCADE;

-- 1f. Note Object Link → CASCADE (user wants notes deleted with deal)
ALTER TABLE note_object_link
DROP CONSTRAINT IF EXISTS note_object_link_deal_id_fkey,
ADD CONSTRAINT note_object_link_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES deal(id) ON DELETE CASCADE;

-- ============================================================================
-- Part 2: SET NULL (keep record, just remove deal reference)
-- ============================================================================

-- 2a. Assignment → SET NULL (keep task, just remove deal link)
ALTER TABLE assignment
DROP CONSTRAINT IF EXISTS assignment_deal_id_fkey,
ADD CONSTRAINT assignment_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES deal(id) ON DELETE SET NULL;

-- 2b. Property Unit → SET NULL (property exists independently)
ALTER TABLE property_unit
DROP CONSTRAINT IF EXISTS property_unit_deal_id_fkey,
ADD CONSTRAINT property_unit_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES deal(id) ON DELETE SET NULL;

-- 2c. Site Submit → SET NULL (site submit exists independently)
ALTER TABLE site_submit
DROP CONSTRAINT IF EXISTS site_submit_deal_id_fkey,
ADD CONSTRAINT site_submit_deal_id_fkey
    FOREIGN KEY (deal_id) REFERENCES deal(id) ON DELETE SET NULL;

-- ============================================================================
-- Cascade Chain Explanation:
-- ============================================================================
-- Delete Deal
--   ↓
-- CASCADE (auto-delete):
--   → Payments deleted
--     → Payment Splits deleted (via payment CASCADE)
--   → Commission Splits deleted
--   → Deal Contacts deleted (link only, contact record stays)
--   → Activities deleted
--   → Note Object Links deleted
--
-- SET NULL (keep, unlink):
--   → Assignments kept, deal_id set to NULL
--   → Property Units kept, deal_id set to NULL
--   → Site Submits kept, deal_id set to NULL
-- ============================================================================

-- Verification: Check the new delete rules
SELECT
    tc.table_name,
    kcu.column_name,
    rc.delete_rule,
    CASE
        WHEN rc.delete_rule = 'CASCADE' THEN '✅ Auto-deletes'
        WHEN rc.delete_rule = 'SET NULL' THEN '⚠️ Sets to NULL'
        WHEN rc.delete_rule = 'NO ACTION' THEN '❌ Still orphans'
        ELSE '❓ ' || rc.delete_rule
    END as what_happens
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND ccu.table_name = 'deal'
ORDER BY
    CASE rc.delete_rule
        WHEN 'CASCADE' THEN 1
        WHEN 'SET NULL' THEN 2
        WHEN 'NO ACTION' THEN 3
    END,
    tc.table_name;
-- Delete Deal
--   ↓
-- → Auto-deletes Payments (via payment.deal_id CASCADE)
--   ↓
--   → Auto-deletes Payment Splits (via payment_split.payment_id CASCADE)
-- → Auto-deletes Commission Splits (via commission_split.deal_id CASCADE)
--
-- Result: One DELETE on deal cleans up everything
-- ============================================================================

-- Verification: Check the new delete rules
SELECT
    tc.table_name,
    kcu.column_name,
    ccu.table_name AS foreign_table_name,
    rc.delete_rule
FROM information_schema.table_constraints AS tc
JOIN information_schema.key_column_usage AS kcu
    ON tc.constraint_name = kcu.constraint_name
JOIN information_schema.constraint_column_usage AS ccu
    ON ccu.constraint_name = tc.constraint_name
JOIN information_schema.referential_constraints AS rc
    ON rc.constraint_name = tc.constraint_name
WHERE tc.constraint_type = 'FOREIGN KEY'
    AND tc.table_name IN ('payment', 'commission_split', 'payment_split')
    AND ccu.table_name IN ('deal', 'payment')
ORDER BY tc.table_name;
