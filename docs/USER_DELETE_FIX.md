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

## "+ Create User" was broken the same way — also fixed

`createUser` in the same hook called `supabase.auth.admin.createUser()` from the
browser, which fails for exactly the reason the old delete path failed: no
service_role key. Creating a user has never worked from this screen.

The whole operation moved server-side to a new edge function,
[`admin-create-user`](../supabase/functions/admin-create-user/index.ts), which:

- validates the caller's JWT and requires `admin` / `broker_full` on their
  `public.user` row. This check is not optional: the function runs with
  service_role, so without it any signed-in user could mint an admin account.
  (`verify_jwt` only proves *someone* is signed in.)
- validates email / password length / name / role before creating anything, and
  rejects a duplicate email with 409 rather than creating a login it would have
  to roll back;
- creates the `auth.users` login, then the `public.user` row — and **deletes the
  login again if the row insert fails**, so a failed attempt doesn't leave a
  half-created account blocking the retry.

One deployment detail worth knowing: this project has its **legacy anon /
service_role API keys disabled** (as of 2025-10-23), so the usual
"build a second client from `SUPABASE_ANON_KEY` to identify the caller" pattern
is dead on arrival here — that client is rejected before it can check anything.
The function instead validates the token directly on the service client with
`admin.auth.getUser(token)`.

The hook now calls the function and unwraps the server's message: supabase-js
reports a non-2xx edge response as `FunctionsHttpError` whose `.message` is only
"Edge Function returned a non-2xx status code", with the real text in the
attached `Response`.

### Verified end-to-end against production

A throwaway admin and a throwaway user were created, exercised, and deleted
(nothing left behind — confirmed by a follow-up query):

| Case | Result |
|---|---|
| Admin creates a user | 200, auth login + user row created |
| Duplicate email | 409 "A user with email … already exists" |
| Password under 6 chars | 400 |
| Nonexistent role | 400 FK error, and the auth login was rolled back (verified absent) |
| Non-admin (VA) caller | 403 "Only administrators can create users" |
| No / non-user token | 401 |

The `admin_delete_user` RPC was also exercised for real (not just in a rolled-back
transaction) to remove the throwaway user: `auth_action: deleted`, no blockers.

**Deployment:** the function is already deployed to the production project
(`npx supabase functions deploy admin-create-user`). It is additive — nothing on
`main` calls it until this branch merges.
