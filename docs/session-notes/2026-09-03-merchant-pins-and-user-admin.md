# Merchant pin removal, favorite sharing, and User Management fixes — September 3, 2026

## Summary

Three things shipped to production in this session: a way to remove wrong
merchant pins from the map for everyone, sharing of merchant favorites between
users, and repairs to two User Management actions that had never worked —
deleting a user and creating one.

Deep write-ups live in their own docs; this note is the index and the record of
what was applied where.

- [MERCHANT_PIN_REMOVAL_AND_FAVORITE_SHARING.md](../MERCHANT_PIN_REMOVAL_AND_FAVORITE_SHARING.md)
- [USER_DELETE_FIX.md](../USER_DELETE_FIX.md)

## 1. Right-click → remove a wrong merchant pin (global)

**Problem:** Google Places puts the wrong business at an address often enough to
matter — a bike shop rendered as a burrito chain. There was no way to remove such
a pin, and a removal has to hold for every user, not one session.

**Solution:** soft delete. `merchant_location` is a Places cache and
`merchantIngestService.upsertMerchantLocation` keys on `google_place_id`, so a
hard `DELETE` is undone by the next ingest of that brand. New
`excluded_at / excluded_by / exclusion_reason` columns are filtered out of the
map query instead, and the ingest keeps refreshing a row nobody can see.

Excluding runs through `merchant_location_exclude()` — `SECURITY DEFINER`, open
to any authenticated user — so the admin-only UPDATE policy on
`merchant_location` (which guards coordinates, status, brand) didn't have to be
widened. `merchant_location_restore()` is the admin-only undo; no UI for it yet.

Right-click on a merchant pin is now available to **all** users; the pin-drag
verify item inside that menu stays gated on `can_verify_restaurant_locations`.

Migration `20260903110422_merchant_location_exclusion.sql`.

## 2. Sharing merchant favorites

`merchant_favorite_share` and its RLS already existed and had no UI — recipients
could read a favorite, `edit` recipients could change its brand set, and
share/delete were owner-only. **No migration was needed**; this was a missing
screen, not a missing feature.

Added `ShareMerchantFavoriteModal` and taught the drawer to derive an
`owner | edit | view` access level per favorite, with the row menu mirroring
those rules and badges for shared-with-you (`shared`) and shared-out (`↗n`).

## 3. User Management: Delete didn't delete

**Problem reported:** deleting Rob Powell said "User deleted successfully" and he
stayed on the list.

**Two silent failures stacked:**

1. `DELETE FROM "user"` ran from the browser against a table with RLS enabled and
   **no DELETE policy**, so it matched zero rows. Under RLS that isn't an error —
   PostgREST returns 2xx and the hook reported success.
2. `supabase.auth.admin.deleteUser()` needs a `service_role` key; the app client
   is built with the publishable key, so the auth half failed every time
   (warn-only). Deleted users could still sign in.

**Solution:** `admin_delete_user()` RPC — admin/broker_full only, refuses
self-delete, pre-flights every `NO ACTION`/`RESTRICT` foreign key on both
`public.user.id` and `auth.users.id` and raises `23503` naming the blocking
tables and counts instead of a raw FK error, then deletes the user row and
revokes the login.

The login half deletes `auth.users` when nothing references it and otherwise
bans the account (`banned_until = infinity`) and drops its sessions. **The
fallback is the common path:** per-user tables such as
`prospecting_settings.user_id` reference `auth.users` with `NO ACTION` and every
account has such a row. The UI now says which of the two happened.

Migration `20260903131244_admin_delete_user.sql`.

## 4. User Management: "+ Create User" never worked either

Same root cause — `createUser` called `supabase.auth.admin.createUser()` from the
browser without a service_role key. The whole operation moved into a new edge
function, `admin-create-user`, which re-checks that the caller's `public.user`
row carries `admin`/`broker_full` (mandatory: the function runs with
service_role, and `verify_jwt` only proves *someone* is signed in), validates
input, rejects duplicate emails with 409 before minting a login it would have to
undo, and deletes the auth user again if the `public.user` insert fails.

### Landmine worth remembering

This project's **legacy anon / service_role JWTs were disabled on 2025-10-23**.
The usual "build a second client from `SUPABASE_ANON_KEY` to identify the
caller" edge-function pattern is dead here — that client is rejected before it
can validate anything. Validate the token on the service client instead:
`admin.auth.getUser(token)`. The first deploy of `admin-create-user` used the
anon-key pattern and would have 401'd every caller; the end-to-end test caught
it.

## What was applied where

| Change | State |
|---|---|
| `20260903110422_merchant_location_exclusion.sql` | applied to prod DB, recorded in `schema_migrations` |
| `20260903131244_admin_delete_user.sql` | applied to prod DB, recorded in `schema_migrations` |
| `admin-create-user` edge function | deployed to the prod Supabase project |
| Front-end changes | merged to `main` (`405c7168`, `bfcf258a`) and deployed via Vercel |

## Verification

Both RPCs were exercised against the production database inside
`BEGIN … ROLLBACK`: exclusion stamps the right user and is refused for a
non-admin restore; delete covers the happy path, the FK-blocked path, the
self-delete guard and the non-admin guard.

`admin-create-user` was tested end-to-end against production with throwaway
accounts — happy path, duplicate email, short password, bad role (auth rollback
confirmed), non-admin caller, missing token — and the throwaway accounts were
then removed with `admin_delete_user` itself. Nothing was left behind; the user
list is unchanged apart from the intended work.

## Known gaps

- No admin screen for excluded merchant pins (list / restore / reasons). The
  data and the restore RPC exist; the Merchant admin page has no tab for them.
- `merchant_closure_alert` rows are still created for excluded locations, and the
  Closure Alerts tab doesn't filter them.
- Rob Powell was **not** deleted in this session — every delete test was rolled
  back deliberately. He can now be deleted from the UI for real.
