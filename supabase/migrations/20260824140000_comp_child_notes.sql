-- Comp Database — per-record free-text notes on individual lease / sale / OM comps
-- (distinct from the comp_property-level comp_note thread).

ALTER TABLE lease_comp ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE sale_comp ADD COLUMN IF NOT EXISTS notes TEXT;
ALTER TABLE operating_memorandum ADD COLUMN IF NOT EXISTS notes TEXT;
