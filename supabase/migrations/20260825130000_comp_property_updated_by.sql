-- Comp Database — track who last modified a comp record (created_by_id/created_at/updated_at exist).
ALTER TABLE comp_property ADD COLUMN IF NOT EXISTS updated_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
