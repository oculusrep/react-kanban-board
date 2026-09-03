# Deleting a user in User Management didn't delete anything

**Reported 2026-09-03:** deleting Rob Powell showed "User deleted successfully",
but he stayed on the list.

## What was actually happening

Two separate silent failures in `useUsers.deleteUser`:

1. **`DELETE FROM "user"` from the browser matched zero rows.** `public.user`
   has RLS enabled with a SELECT policy and an "update own profile" UPDATE
   policy — and **no DELETE policy**. Under RLS a delete with no matching policy
   isn't an error; it just affects nothing. PostgREST returns 2xx, the hook saw
   no error, and the UI announced success.
2. **`supabase.auth.admin.deleteUser()` cannot work from this app.** The
   `auth.admin.*` namespace requires a `service_role` key; the browser client is
   built with `VITE_SUPABASE_PUBLISHABLE_KEY`. That call was already
   `console.warn`-only, so it failed quietly every time.

Net effect: nothing was deleted, in either place, ever — and the admin was told
it worked.

## The fix

New RPC [`admin_delete_user(p_user_id uuid)`](../supabase/migrations/20260903131244_admin_delete_user.sql)
— `SECURITY DEFINER`, gated to `admin` / `broker_full` (the same role list
`admin_update_user` uses), and called from the hook instead of the raw delete.

It does four things:

- **Refuses self-delete.**
- **Pre-flights the foreign keys** onto both `public.user.id` and
  `auth.users.id`, counting rows behind every `NO ACTION` / `RESTRICT`
  constraint. If business records still point at the user it raises `23503`
  naming the tables and counts — e.g. *"Cannot delete Arty Santos — still
  referenced by: activity.owner_id (4883), assignment.owner_id (108), …
  Deactivate the user instead, or reassign these records first."* Silently
  reassigning or nulling someone's deals is not this function's call to make.
- **Deletes the `public.user` row.**
- **Revokes the login.** It deletes the `auth.users` row when nothing
  references it; otherwise it sets `banned_until = 'infinity'` and drops the
  user's sessions.

### Why the auth fallback is the normal path, not an edge case

Many `public` tables have FKs onto `auth.users` with `NO ACTION` — including
per-user rows like `prospecting_settings.user_id`, which **every** user has. So
a plain `DELETE FROM auth.users` fails for essentially every real account. A
banned auth row can't sign in (GoTrue checks `banned_until`), and unlike a
cascade it destroys nothing the admin didn't ask to destroy. The UI now says
which of the two happened rather than implying a clean delete.

Rob Powell specifically: zero references on the `public.user` side, one on the
auth side (`prospecting_settings`), so he deletes cleanly with the login
disabled. Verified in a transaction against production, then rolled back.

## Verified

All against the production database inside `BEGIN … ROLLBACK`:

| Case | Result |
|---|---|
| Admin deletes Rob Powell | user row gone, `banned_until = infinity`, sessions dropped, `auth_action: disabled` |
| Admin deletes a user who owns records | `23503` listing the blocking tables |
| Admin deletes themselves | "You cannot delete your own account." |
| Non-admin (VA role) deletes anyone | "Only administrators can delete user records" |

## Related bug, not fixed here

`createUser` in the same hook calls `supabase.auth.admin.createUser()`, which
fails for the same key reason as the old delete path. **"+ Create User" cannot
work from the browser as written** — it needs an edge function with the
service_role key, or an invite flow. Out of scope for this fix.
