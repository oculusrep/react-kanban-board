-- Board membership speedup: check the client's own flag first; walk the parent
-- chain only when the client has a parent.
--
-- The computed field client.in_starbucks_family (20261013090455) called the
-- recursive client_in_starbucks_family() for every client row the board query
-- joins. Measured 2026-10-22: the board's site_submit membership query ran
-- ~1.1s with it vs ~0.5s with the old per-client flag. 536 of 571 clients have
-- no parent_id, so for them the answer is just their own flag.
--
-- Same semantics: true when the client or any parent_id ancestor has
-- starbucks_board_enabled (client_in_starbucks_family(parent) walks the parent's
-- own chain, including the parent's flag).
--
-- No SET search_path, on purpose: a SQL function with a SET clause can't be
-- inlined by the planner, and inlining is what lets the flag test short-circuit
-- before the recursive call. Every reference is schema-qualified instead.
-- Rebuilt from the live definition (pg_get_functiondef, 2026-10-22).
-- CREATE OR REPLACE keeps the grants (EXECUTE: authenticated, service_role).
--
-- No BEGIN/COMMIT: apply with psql --single-transaction.

CREATE OR REPLACE FUNCTION public.in_starbucks_family(public.client)
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT COALESCE($1.starbucks_board_enabled, false)
         OR ($1.parent_id IS NOT NULL AND public.client_in_starbucks_family($1.parent_id))
$$;

COMMENT ON FUNCTION public.in_starbucks_family(public.client) IS
  'Computed field: own starbucks_board_enabled, else client_in_starbucks_family(parent_id). Deal board membership (decision 2026-10-13; fast path 2026-10-22).';
