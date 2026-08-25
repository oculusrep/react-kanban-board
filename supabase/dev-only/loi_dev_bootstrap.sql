-- DEV-ONLY BOOTSTRAP — DO NOT SHIP, NOT A MIGRATION.
-- Provides the two helper functions the LOI clause-library migration depends on,
-- because the repo migration history is not self-contained (see supabase/dev-only/README.md).
--
-- WARNING: is_internal_user() is STUBBED to TRUE here. RLS behavior is NOT validated
-- by any run that uses this bootstrap. Never copy these definitions into prod/migrations.

-- Standard updated_at helper (universal body; matches how migrations use it).
CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- DEV STUB ONLY — always true. Real prod definition gates on internal users.
CREATE OR REPLACE FUNCTION public.is_internal_user()
RETURNS boolean AS $$
  SELECT true;
$$ LANGUAGE sql STABLE;
