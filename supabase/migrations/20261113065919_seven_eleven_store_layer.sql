-- 7-Eleven / Speedway store layer (map toggle).
-- Store locations come from Google Places (statewide GA grid search); see
-- docs/SEVEN_ELEVEN_LAYER.md. Visibility: can_view_7eleven_layer permission
-- (user override > role) OR an active broker on the 7-Eleven client.

CREATE TABLE IF NOT EXISTS public.seven_eleven_store (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  brand               text NOT NULL CHECK (brand IN ('7-Eleven', 'Speedway')),
  google_place_id     text NOT NULL UNIQUE,
  name                text,
  formatted_address   text,
  latitude            numeric NOT NULL,
  longitude           numeric NOT NULL,
  verified_latitude   numeric,
  verified_longitude  numeric,
  business_status     text NOT NULL DEFAULT 'OPERATIONAL',
  last_fetched_at     timestamptz NOT NULL DEFAULT now(),
  created_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS seven_eleven_store_brand_idx ON public.seven_eleven_store (brand);

-- Access helper. SECURITY DEFINER so it can read user/role/client_broker
-- without granting those to the caller. Joins public."user", never auth.users.
CREATE OR REPLACE FUNCTION public.user_has_seven_eleven_access()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    EXISTS (
      SELECT 1
      FROM "user" u
      LEFT JOIN role r ON r.name = u.ovis_role
      WHERE u.auth_user_id = auth.uid()
        AND COALESCE(
          (u.permissions ->> 'can_view_7eleven_layer')::boolean,
          (r.permissions ->> 'can_view_7eleven_layer')::boolean,
          FALSE
        ) = TRUE
    )
    OR EXISTS (
      SELECT 1
      FROM client_broker cb
      JOIN "user" u ON u.id = cb.user_id
      JOIN client c ON c.id = cb.client_id
      WHERE u.auth_user_id = auth.uid()
        AND cb.is_active = TRUE
        AND c.client_name = '7-Eleven'
    );
$$;

ALTER TABLE public.seven_eleven_store ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS seven_eleven_store_select ON public.seven_eleven_store;
CREATE POLICY seven_eleven_store_select ON public.seven_eleven_store
  FOR SELECT TO authenticated
  USING ((SELECT public.user_has_seven_eleven_access()));

-- Grants: don't inherit the defaults, state what the app uses.
-- Read-only from the browser; rows are loaded by the ingest script (postgres).
REVOKE ALL ON public.seven_eleven_store FROM anon, authenticated;
GRANT SELECT ON public.seven_eleven_store TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.seven_eleven_store TO service_role;

REVOKE ALL ON FUNCTION public.user_has_seven_eleven_access() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.user_has_seven_eleven_access() TO authenticated;
