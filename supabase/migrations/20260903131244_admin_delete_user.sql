-- admin_delete_user: make "Delete" in User Management actually delete.
--
-- The bug: useUsers.deleteUser ran a plain `DELETE FROM "user"` from the
-- browser. public.user has RLS enabled with SELECT and UPDATE policies but no
-- DELETE policy, so the statement matched zero rows and returned NO error —
-- PostgREST reports a successful request for a delete that affected nothing.
-- The UI then said "User deleted successfully" while the row was untouched and
-- still on the list.
--
-- The second half of the old path was broken too: supabase.auth.admin
-- .deleteUser() requires a service_role key and the browser client is built
-- with the publishable key, so the auth.users row always survived. That is the
-- half that actually matters — an auth row that outlives its public.user row
-- can still sign in.
--
-- Fix: one admin-gated SECURITY DEFINER function that removes the public.user
-- row and revokes the login in a single transaction, and refuses loudly
-- (naming tables and row counts) when a foreign key would block it rather than
-- surfacing a raw FK error.
--
-- On the auth side it deletes auth.users when nothing references it, and
-- otherwise falls back to banning the account and dropping its sessions. That
-- fallback is the normal case, not an edge case: per-user rows such as
-- prospecting_settings.user_id point at auth.users with NO ACTION, so nearly
-- every real user is undeletable there. A banned auth row cannot sign in, and
-- unlike a cascade it destroys nothing the admin did not ask to destroy.

CREATE OR REPLACE FUNCTION public.admin_delete_user(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_caller_role text;
  v_caller_auth uuid := auth.uid();
  v_user record;
  r record;
  n bigint;
  v_blockers text[] := '{}';
  v_auth_blockers text[] := '{}';
  v_auth_action text := 'none';
BEGIN
  SELECT ovis_role INTO v_caller_role
  FROM public.user
  WHERE auth_user_id = v_caller_auth;

  -- Same gate as admin_update_user, so one role list governs user admin.
  IF v_caller_role IS NULL OR v_caller_role NOT IN ('admin', 'broker_full') THEN
    RAISE EXCEPTION 'Only administrators can delete user records'
      USING ERRCODE = '42501';
  END IF;

  SELECT id, auth_user_id, email, name INTO v_user
  FROM public.user
  WHERE id = p_user_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'User % not found', p_user_id USING ERRCODE = 'P0002';
  END IF;

  IF v_user.auth_user_id IS NOT NULL AND v_user.auth_user_id = v_caller_auth THEN
    RAISE EXCEPTION 'You cannot delete your own account.' USING ERRCODE = '42501';
  END IF;

  -- Pre-flight both sides. confdeltype 'a' = NO ACTION, 'r' = RESTRICT; 'n'
  -- (SET NULL) and 'c' (CASCADE) resolve themselves. Single-column FKs only —
  -- every FK onto "user".id / auth.users.id is single-column today, and a
  -- composite one would need its own value mapping rather than a wrong guess.
  FOR r IN
    -- DISTINCT: some tables carry duplicate FK constraints on the same
    -- column (activity.owner_id has two), which would list the same blocker twice.
    SELECT DISTINCT
           c.conrelid::regclass::text AS tbl,
           a.attname::text AS col,
           c.confrelid::regclass::text AS ref
    FROM pg_constraint c
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
    WHERE c.contype = 'f'
      AND c.confrelid IN ('public.user'::regclass, 'auth.users'::regclass)
      AND c.confdeltype IN ('a', 'r')
      AND array_length(c.conkey, 1) = 1
  LOOP
    IF r.ref = 'auth.users' AND v_user.auth_user_id IS NULL THEN
      CONTINUE;
    END IF;

    EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', r.tbl, r.col)
      INTO n
      USING CASE WHEN r.ref = 'auth.users' THEN v_user.auth_user_id ELSE v_user.id END;

    IF n > 0 THEN
      IF r.ref = 'auth.users' THEN
        v_auth_blockers := v_auth_blockers || format('%s.%s (%s)', r.tbl, r.col, n);
      ELSE
        v_blockers := v_blockers || format('%s.%s (%s)', r.tbl, r.col, n);
      END IF;
    END IF;
  END LOOP;

  -- Business records owned by this user block the delete outright: silently
  -- reassigning or nulling them is not this function's call to make.
  IF array_length(v_blockers, 1) > 0 THEN
    RAISE EXCEPTION 'Cannot delete % — still referenced by: %. Deactivate the user instead, or reassign these records first.',
      coalesce(v_user.name, v_user.email, p_user_id::text),
      array_to_string(v_blockers, ', ')
      USING ERRCODE = '23503';
  END IF;

  DELETE FROM public.user WHERE id = p_user_id;

  IF v_user.auth_user_id IS NOT NULL THEN
    IF array_length(v_auth_blockers, 1) IS NULL THEN
      DELETE FROM auth.users WHERE id = v_user.auth_user_id;
      v_auth_action := 'deleted';
    ELSE
      -- Can't remove the auth row; make it unusable instead. banned_until is
      -- what GoTrue checks on sign-in, and dropping sessions kills any live one.
      UPDATE auth.users
         SET banned_until = 'infinity'::timestamptz,
             updated_at = now()
       WHERE id = v_user.auth_user_id;
      DELETE FROM auth.sessions WHERE user_id = v_user.auth_user_id;
      v_auth_action := 'disabled';
    END IF;
  END IF;

  RETURN jsonb_build_object(
    'deleted', true,
    'user_id', p_user_id,
    'email', v_user.email,
    'name', v_user.name,
    'auth_action', v_auth_action,
    'auth_blockers', to_jsonb(v_auth_blockers)
  );
END;
$function$;

COMMENT ON FUNCTION public.admin_delete_user(uuid) IS
  'Deletes a public.user row and revokes its login in one transaction. Admin/broker_full only; refuses self-delete; raises 23503 listing the blocking tables when a NO ACTION/RESTRICT foreign key still references the user. Returns auth_action = deleted (auth.users row removed) or disabled (row banned + sessions dropped because something still references it).';

REVOKE ALL ON FUNCTION public.admin_delete_user(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_delete_user(uuid) TO authenticated;
