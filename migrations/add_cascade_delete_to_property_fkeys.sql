-- Add CASCADE DELETE to property foreign key constraints
-- This allows deleting properties that have related records by automatically deleting those records too

-- site_submit table
ALTER TABLE site_submit DROP CONSTRAINT IF EXISTS site_submit_property_id_fkey;
ALTER TABLE site_submit ADD CONSTRAINT site_submit_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE;

-- property_unit table
ALTER TABLE property_unit DROP CONSTRAINT IF EXISTS property_unit_property_id_fkey;
ALTER TABLE property_unit ADD CONSTRAINT property_unit_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE;

-- property_contact table
ALTER TABLE property_contact DROP CONSTRAINT IF EXISTS property_contact_property_id_fkey;
ALTER TABLE property_contact ADD CONSTRAINT property_contact_property_id_fkey
  FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE;

-- activity table
ALTER TABLE activity DROP CONSTRAINT IF EXISTS fk_activity_property_id;
ALTER TABLE activity ADD CONSTRAINT fk_activity_property_id
  FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE;

-- note_object_link table
ALTER TABLE note_object_link DROP CONSTRAINT IF EXISTS fk_note_object_link_property_id;
ALTER TABLE note_object_link ADD CONSTRAINT fk_note_object_link_property_id
  FOREIGN KEY (property_id) REFERENCES property(id) ON DELETE CASCADE;
