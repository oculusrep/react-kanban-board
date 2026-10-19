-- Bring my own four migrations from 2026-10-03 into line with CLAUDE.md's
-- "every new table, view or RPC needs an explicit grants block".
--
-- The rule was added 2026-09-28 (3708ee36) and had been followed five times for
-- five. Today's label-rule migrations (20261003165934, 170127, 170246, 170315)
-- granted EXECUTE to authenticated without revoking PUBLIC, so both functions
-- carry the default PUBLIC grant the rule exists to prevent. Found while
-- auditing the same defect in 54 other functions.
--
-- Not exploitable -- email_label_rule_proposals returns 400 P0001
-- "internal users only" to an anonymous caller, verified over HTTP -- but the
-- grant should not be there, and a guard is a worse place to rely on than a
-- grant.
--
-- ROLLBACK: GRANT EXECUTE ON FUNCTION <signature> TO PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_label_rule_proposals() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.email_label_rule_proposals_guard() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.email_label_rule_proposals() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.email_label_rule_proposals_guard() TO authenticated, service_role;
