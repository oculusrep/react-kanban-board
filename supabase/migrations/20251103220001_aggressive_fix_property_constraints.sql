-- ============================================================================
-- Aggressive Fix - Drop ALL property_id foreign key constraints and rebuild
-- ============================================================================

-- Query to find all constraint names (for reference)
-- SELECT constraint_name, table_name
-- FROM information_schema.table_constraints
-- WHERE constraint_type = 'FOREIGN KEY'
-- AND constraint_name IN (
--   SELECT constraint_name FROM information_schema.key_column_usage
--   WHERE column_name = 'property_id'
--   AND table_name IN ('deal', 'site_submit', 'activity', 'note_object_link', 'property_contact', 'property_unit')
-- );

-- Drop ALL constraints on property_id columns (including unknown ones)
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN (
        SELECT tc.constraint_name, tc.table_name
        FROM information_schema.table_constraints tc
        JOIN information_schema.key_column_usage kcu
            ON tc.constraint_name = kcu.constraint_name
        JOIN information_schema.constraint_column_usage ccu
            ON tc.constraint_name = ccu.constraint_name
        WHERE tc.constraint_type = 'FOREIGN KEY'
            AND ccu.table_name = 'property'
            AND kcu.column_name = 'property_id'
            AND tc.table_name IN ('deal', 'site_submit', 'activity', 'note_object_link', 'property_contact', 'property_unit', 'property_special_layer')
    ) LOOP
        EXECUTE format('ALTER TABLE %I DROP CONSTRAINT IF EXISTS %I', r.table_name, r.constraint_name);
        RAISE NOTICE 'Dropped constraint % from table %', r.constraint_name, r.table_name;
    END LOOP;
END $$;

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
