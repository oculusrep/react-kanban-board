-- Enable RLS on dropbox_mapping table if not already enabled
ALTER TABLE dropbox_mapping ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist
DROP POLICY IF EXISTS "Users can view dropbox mappings" ON dropbox_mapping;
DROP POLICY IF EXISTS "Users can insert dropbox mappings" ON dropbox_mapping;
DROP POLICY IF EXISTS "Users can update dropbox mappings" ON dropbox_mapping;
DROP POLICY IF EXISTS "Users can delete dropbox mappings" ON dropbox_mapping;

-- Allow authenticated users to view all dropbox mappings
CREATE POLICY "Users can view dropbox mappings"
ON dropbox_mapping
FOR SELECT
TO authenticated
USING (true);

-- Allow authenticated users to insert dropbox mappings
CREATE POLICY "Users can insert dropbox mappings"
ON dropbox_mapping
FOR INSERT
TO authenticated
WITH CHECK (true);

-- Allow authenticated users to update dropbox mappings
CREATE POLICY "Users can update dropbox mappings"
ON dropbox_mapping
FOR UPDATE
TO authenticated
USING (true);

-- Allow authenticated users to delete dropbox mappings
CREATE POLICY "Users can delete dropbox mappings"
ON dropbox_mapping
FOR DELETE
TO authenticated
USING (true);

-- Add comment for documentation
COMMENT ON TABLE dropbox_mapping IS 'Maps entities (property, property_unit, etc.) to their Dropbox folder paths';
