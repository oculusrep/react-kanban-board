-- ============================================================================
-- Fix Property Foreign Key Constraints - Clean Up Duplicates and Add Deal
-- ============================================================================

-- First, drop ALL existing property_id constraints to clean up duplicates
ALTER TABLE property_contact DROP CONSTRAINT IF EXISTS property_contact_property_id_fkey;
ALTER TABLE property_contact DROP CONSTRAINT IF EXISTS property_contact_property_id_fkey1;
ALTER TABLE property_contact DROP CONSTRAINT IF EXISTS property_contact_property_id_fkey2;

ALTER TABLE property_unit DROP CONSTRAINT IF EXISTS property_unit_property_id_fkey;

ALTER TABLE activity DROP CONSTRAINT IF EXISTS fk_activity_property_id;
ALTER TABLE activity DROP CONSTRAINT IF EXISTS activity_property_id_fkey;

ALTER TABLE note_object_link DROP CONSTRAINT IF EXISTS fk_note_object_link_property_id;
ALTER TABLE note_object_link DROP CONSTRAINT IF EXISTS note_object_link_property_id_fkey;

ALTER TABLE site_submit DROP CONSTRAINT IF EXISTS site_submit_property_id_fkey;

ALTER TABLE deal DROP CONSTRAINT IF EXISTS deal_property_id_fkey;

-- Now add them back with the correct CASCADE/SET NULL behavior
-- CASCADE (auto-delete when property is deleted)
ALTER TABLE property_contact ADD CONSTRAINT property_contact_property_id_fkey
    FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE;

ALTER TABLE property_unit ADD CONSTRAINT property_unit_property_id_fkey
    FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE;

ALTER TABLE activity ADD CONSTRAINT activity_property_id_fkey
    FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE;

ALTER TABLE note_object_link ADD CONSTRAINT note_object_link_property_id_fkey
    FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE;

-- SET NULL (keep record, just remove property reference)
ALTER TABLE site_submit ADD CONSTRAINT site_submit_property_id_fkey
    FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE SET NULL;

ALTER TABLE deal ADD CONSTRAINT deal_property_id_fkey
    FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE SET NULL;

-- Verify the constraints
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
