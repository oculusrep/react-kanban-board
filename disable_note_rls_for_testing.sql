-- ============================================
-- TEMPORARILY DISABLE RLS FOR TESTING
-- ============================================
-- This allows testing the notes functionality without authentication
-- ⚠️ FOR DEVELOPMENT ONLY - NOT FOR PRODUCTION

-- Disable RLS on note table temporarily
ALTER TABLE note DISABLE ROW LEVEL SECURITY;

-- Verify RLS is disabled
SELECT schemaname, tablename, rowsecurity
FROM pg_tables
WHERE tablename = 'note';

-- Test query - should return data now
SELECT 'RLS disabled - test query' as status, count(*) as total_notes FROM note;

-- Show some sample note data
SELECT
    'Sample notes' as info,
    id,
    title,
    CASE
        WHEN client_id IS NOT NULL THEN 'Client Note'
        WHEN deal_id IS NOT NULL THEN 'Deal Note'
        WHEN contact_id IS NOT NULL THEN 'Contact Note'
        ELSE 'Other Note'
    END as note_type,
    LEFT(body, 50) as content_preview
FROM note
LIMIT 5;