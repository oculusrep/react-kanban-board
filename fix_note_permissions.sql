-- ============================================
-- FIX NOTE TABLE RLS PERMISSIONS
-- ============================================
-- This script enables access to the note table for authenticated users

-- Check current RLS status on note table
SELECT schemaname, tablename, rowsecurity, hasrlspolicy
FROM pg_tables
LEFT JOIN (
    SELECT schemaname, tablename, TRUE as hasrlspolicy
    FROM pg_policies
    WHERE tablename = 'note'
    GROUP BY schemaname, tablename
) p USING (schemaname, tablename)
WHERE tablename = 'note';

-- Show existing policies on note table
SELECT policyname, cmd, permissive, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'note';

-- Enable RLS on note table (if not already enabled)
ALTER TABLE note ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if they exist to avoid conflicts
DROP POLICY IF EXISTS "Users can view all notes" ON note;
DROP POLICY IF EXISTS "Users can insert notes" ON note;
DROP POLICY IF EXISTS "Users can update notes" ON note;
DROP POLICY IF EXISTS "Users can delete notes" ON note;

-- Create comprehensive access policies for authenticated users
CREATE POLICY "Users can view all notes" ON note
    FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Users can insert notes" ON note
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Users can update notes" ON note
    FOR UPDATE
    TO authenticated
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Users can delete notes" ON note
    FOR DELETE
    TO authenticated
    USING (true);

-- Verify policies were created
SELECT 'Policies created' as status;
SELECT policyname, cmd, permissive, roles, qual, with_check
FROM pg_policies
WHERE tablename = 'note';

-- Test query to ensure data is accessible
SELECT 'Test query' as status, count(*) as total_notes FROM note;