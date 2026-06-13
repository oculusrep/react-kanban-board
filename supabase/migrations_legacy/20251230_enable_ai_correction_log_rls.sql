-- Enable RLS on ai_correction_log table
-- The table already has policies defined but RLS was not enabled

ALTER TABLE ai_correction_log ENABLE ROW LEVEL SECURITY;

-- Note: The existing policies are:
-- - ai_correction_log_insert: Allows authenticated users to insert
-- - ai_correction_log_select: Allows authenticated users to select
