-- Comp Database — lease_comp rent-capture refinements.
-- Base rent & TI are entered as ANNUAL dollars, lease term in YEARS, plus rent-bump cadence and
-- free-text option periods. (base_rent_psf / ti_psf / lease_term_months are kept and derived so
-- existing PSF-based comparisons/indexes still work.)

ALTER TABLE lease_comp ADD COLUMN IF NOT EXISTS ti_annual NUMERIC;
ALTER TABLE lease_comp ADD COLUMN IF NOT EXISTS lease_term_years NUMERIC;
ALTER TABLE lease_comp ADD COLUMN IF NOT EXISTS rent_bump_frequency TEXT
  CHECK (rent_bump_frequency IN ('annual', 'every_5_years', 'other'));

-- option_periods was an unused jsonb column; recapture it as free text (e.g. "4 × 5-year options").
ALTER TABLE lease_comp DROP COLUMN IF EXISTS option_periods;
ALTER TABLE lease_comp ADD COLUMN option_periods TEXT;
