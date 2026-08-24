-- Comp Database — track who last modified each lease / sale / OM record.
-- created_by_id + created_at + updated_at already exist; add updated_by_id (set on UPDATE by the app).

ALTER TABLE lease_comp ADD COLUMN IF NOT EXISTS updated_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE sale_comp ADD COLUMN IF NOT EXISTS updated_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
ALTER TABLE operating_memorandum ADD COLUMN IF NOT EXISTS updated_by_id UUID REFERENCES auth.users(id) ON DELETE SET NULL;
