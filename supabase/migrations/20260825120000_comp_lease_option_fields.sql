-- Comp Database — break lease "option periods" into structured fields:
-- number of options + option term length (years). UI defaults term to 5. The old free-text
-- option_periods column is left in place (unused) to avoid touching any captured data.

ALTER TABLE lease_comp ADD COLUMN IF NOT EXISTS option_count INTEGER;
ALTER TABLE lease_comp ADD COLUMN IF NOT EXISTS option_term_years NUMERIC;
