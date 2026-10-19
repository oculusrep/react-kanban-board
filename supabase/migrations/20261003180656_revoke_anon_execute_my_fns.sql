-- Finish closing my own two functions: anon holds an EXPLICIT grant, not PUBLIC.
--
-- Revoking PUBLIC was not enough. Their ACL reads
--   postgres=X | anon=X | authenticated=X | service_role=X
-- because ALTER DEFAULT PRIVILEGES in this database grants EXECUTE ON FUNCTIONS
-- to anon at creation time (pg_default_acl, objtype 'f', for both the postgres
-- and supabase_admin owners). The 2026-09-28 audit revoked the default for
-- TABLES from anon; FUNCTIONS were left, so every function created since gets
-- anon EXECUTE explicitly.
--
-- So an anon-callable function can be reached two independent ways -- the PUBLIC
-- grant and the explicit anon grant -- and closing one tells you nothing about
-- the other. Both of my earlier revokes "succeeded" while the function stayed
-- open, each time for a different reason. Only the anonymous HTTP request
-- settles it.
--
-- ROLLBACK: GRANT EXECUTE ON FUNCTION <signature> TO anon;
REVOKE EXECUTE ON FUNCTION public.email_label_rule_proposals() FROM anon;
REVOKE EXECUTE ON FUNCTION public.email_label_rule_proposals_guard() FROM anon;
