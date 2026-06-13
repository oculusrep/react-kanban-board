-- Migration to add team members who can be assigned tasks
-- These users don't need auth login, just need to exist for task assignment

-- Add Noree Corias
INSERT INTO "user" (
  email,
  first_name,
  last_name,
  name,
  is_active
) VALUES (
  'noree@oculusrep.com',
  'Noree',
  'Corias',
  'Noree Corias',
  true
)
ON CONFLICT (email) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  name = EXCLUDED.name,
  is_active = true;

-- Add Arty Santos
INSERT INTO "user" (
  email,
  first_name,
  last_name,
  name,
  is_active
) VALUES (
  'asantos@oculusrep.com',
  'Arty',
  'Santos',
  'Arty Santos',
  true
)
ON CONFLICT (email) DO UPDATE SET
  first_name = EXCLUDED.first_name,
  last_name = EXCLUDED.last_name,
  name = EXCLUDED.name,
  is_active = true;

-- Report results
DO $$
DECLARE
  user_count INTEGER;
BEGIN
  SELECT COUNT(*) INTO user_count
  FROM "user"
  WHERE name IN ('Noree Corias', 'Arty Santos') AND is_active = true;

  RAISE NOTICE '============================================';
  RAISE NOTICE 'Team Users Added';
  RAISE NOTICE '============================================';
  RAISE NOTICE 'Active team users found: %', user_count;
  RAISE NOTICE '============================================';
END $$;
