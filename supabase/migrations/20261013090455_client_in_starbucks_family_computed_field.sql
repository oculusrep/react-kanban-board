-- client.in_starbucks_family — PostgREST computed field for deal board membership.
--
-- Decision 2026-10-13 (Mike): the deal board's membership moves from the
-- per-client flag (client.starbucks_board_enabled, §2.14) to
-- client_in_starbucks_family() (20261012161837): the client OR any parent_id
-- ancestor has the flag. A new Starbucks child account then comes onto the
-- board, and into the Package Tracker, with no flag and no list.
--
-- PostgREST can filter on a function only when it takes the table's row type,
-- so this is a one-line wrapper. The board query selects
-- `client:…!inner ( …, in_starbucks_family )` and filters
-- `.eq('client.in_starbucks_family', true)`. One implementation of membership,
-- in the database, shared by the board, the package trigger and the views.
--
-- No BEGIN/COMMIT: apply with psql --single-transaction.

CREATE FUNCTION public.in_starbucks_family(public.client)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = public, pg_temp
AS $$ SELECT public.client_in_starbucks_family($1.id) $$;

COMMENT ON FUNCTION public.in_starbucks_family(public.client) IS
  'Computed field: client_in_starbucks_family(id). Deal board membership (decision 2026-10-13).';

REVOKE ALL ON FUNCTION public.in_starbucks_family(public.client) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.in_starbucks_family(public.client) TO authenticated;
