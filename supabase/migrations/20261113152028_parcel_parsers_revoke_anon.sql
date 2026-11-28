-- Close anon/PUBLIC execute on the parcel-text parsers.
--
-- extract_parcel_numbers and extract_stated_acres carried the default grant to
-- PUBLIC plus an explicit anon grant, so they were callable as RPCs with the
-- publishable key. Both are pure text parsers (not SECURITY DEFINER, no table
-- access), so this closes a surface, not a leak. Both paths are revoked: revoking
-- anon alone leaves it reachable through PUBLIC.
--
-- authenticated + service_role keep EXECUTE: the parcel_numbers trigger calls
-- extract_parcel_numbers as whoever writes the row (browser review = authenticated,
-- research agent / edge functions = service_role), and set_municipal_project_
-- polygon_from_parcels (SECURITY DEFINER, owner postgres) calls extract_stated_acres.
-- Matches cites_partial_parcel's ACL.

REVOKE ALL ON FUNCTION public.extract_parcel_numbers(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extract_parcel_numbers(text) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.extract_stated_acres(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.extract_stated_acres(text) TO authenticated, service_role;
