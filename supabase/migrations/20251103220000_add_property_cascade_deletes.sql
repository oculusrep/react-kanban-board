-- ============================================================================
-- Add CASCADE and SET NULL Deletes for Property-Related Tables
-- ============================================================================
-- When a property is deleted:
--
-- AUTO-DELETE (CASCADE):
-- - Property contacts (link table, contact record stays)
-- - Property units (property-specific, no value without property)
-- - Activities (when property is deleted, related activities should be deleted)
-- - Notes (when property is deleted, related notes should be deleted via note_object_link)
--
-- KEEP BUT UNLINK (SET NULL):
-- - Site submits (exist independently of properties)
-- ============================================================================

-- ============================================================================
-- Part 1: CASCADE DELETES (auto-delete when property deleted)
-- ============================================================================

-- 1a. Property Contact → CASCADE (just a link table, contact record stays)
ALTER TABLE property_contact
DROP CONSTRAINT IF EXISTS property_contact_property_id_fkey,
ADD CONSTRAINT property_contact_property_id_fkey
    FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE;

-- 1b. Property Unit → CASCADE (property-specific, no value without property)
ALTER TABLE property_unit
DROP CONSTRAINT IF EXISTS property_unit_property_id_fkey,
ADD CONSTRAINT property_unit_property_id_fkey
    FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE;

-- 1c. Activity → CASCADE (when property is deleted, related activities should be deleted)
ALTER TABLE activity
DROP CONSTRAINT IF EXISTS fk_activity_property_id,
ADD CONSTRAINT fk_activity_property_id
    FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE;

-- 1d. Note Object Link → CASCADE (when property is deleted, related notes should be deleted)
ALTER TABLE note_object_link
DROP CONSTRAINT IF EXISTS fk_note_object_link_property_id,
ADD CONSTRAINT fk_note_object_link_property_id
    FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE;

-- ============================================================================
-- Part 2: SET NULL (keep record, just remove property reference)
-- ============================================================================

-- 2a. Site Submit → SET NULL (site submit exists independently)
ALTER TABLE site_submit
DROP CONSTRAINT IF EXISTS site_submit_property_id_fkey,
ADD CONSTRAINT site_submit_property_id_fkey
    FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE SET NULL;

-- ============================================================================
-- Cascade Chain Explanation:
-- ============================================================================
-- Delete Property
--   ↓
-- CASCADE (auto-delete):
--   → Property Contacts deleted (link only, contact record stays)
--   → Property Units deleted
--   → Activities deleted (where property_id matches)
--   → Note Object Links deleted (where property_id matches)
--
-- SET NULL (keep, unlink):
--   → Site Submits kept, property_id set to NULL
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
    AND ccu.table_name = 'property'
ORDER BY
    CASE rc.delete_rule
        WHEN 'CASCADE' THEN 1
        WHEN 'SET NULL' THEN 2
        WHEN 'NO ACTION' THEN 3
    END,
    tc.table_name;
