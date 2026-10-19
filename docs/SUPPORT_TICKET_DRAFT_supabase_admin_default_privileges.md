# Support ticket draft — changing `supabase_admin` default privileges

Not sent. Send from the dashboard support form, or reply to an existing thread.
Project ref: `rqbvcvwbziilnycqtmnc`.

**Try this first, it takes 30 seconds.** Paste into the dashboard SQL editor:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

Expect it to fail with `permission denied to change default privileges` — the
editor connects as `postgres`, the same role psql uses, and `postgres` is neither
a superuser nor a member of `supabase_admin`. If it succeeds, nothing needs
sending: verify with the query at the bottom and delete this file.

---

## Subject

Cannot revoke `anon` EXECUTE from `supabase_admin` default privileges in `public`

## Body

Project ref: `rqbvcvwbziilnycqtmnc`

We are locking down unauthenticated access to our Data API. Part of that is
stopping `anon` from receiving `EXECUTE` on newly created functions in `public`.

For the `postgres` owner this worked:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

`pg_default_acl` still carries a second entry for the `supabase_admin` owner:

```
defaclrole     | defaclobjtype | defaclacl
---------------+---------------+------------------------------------------------
supabase_admin | f             | postgres=X/supabase_admin | anon=X/supabase_admin
               |               | authenticated=X/supabase_admin | service_role=X/supabase_admin
```

So any function created in `public` **as `supabase_admin`** still grants `EXECUTE`
to `anon` automatically. We cannot change it:

```sql
ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;
-- ERROR: permission denied to change default privileges
```

And we cannot assume the role to do it ourselves:

- `pg_has_role('postgres','supabase_admin','MEMBER')` → `false`
- `SET ROLE supabase_admin` → `ERROR: permission denied to set role "supabase_admin"`
- `select rolsuper from pg_roles where rolname = 'postgres'` → `false`

Same error from the dashboard SQL editor, which appears to connect as `postgres`.

### What we are asking

Either

1. run those two `ALTER DEFAULT PRIVILEGES FOR ROLE supabase_admin` statements on
   our project, or
2. tell us the supported way to achieve it — if `supabase_admin`-owned functions in
   `public` are only ever extension objects and this default is intentional, we are
   happy to hear that and will close it out as by-design.

### Why it matters to us

Today the exposure is theoretical: all 744 `supabase_admin`-owned functions in
`public` belong to the `postgis` extension (confirmed via `pg_depend`), and
PostGIS functions being callable is expected. Our concern is *future* objects —
an extension upgrade or platform tooling creating a function in `public` as
`supabase_admin` would silently grant `anon` EXECUTE, and we would not notice
without re-auditing.

We recently found and closed several `SECURITY DEFINER` functions in `public` that
were callable with the publishable key and no `Authorization` header, so we would
rather have the default be safe than rely on catching each one.

### Environment

- Postgres version: (fill in from Settings → Infrastructure)
- Region: (fill in)
- The `postgres`-owner default privileges have already been changed by us; only
  the `supabase_admin` owner entry remains.

---

## Verification after support applies it

```sql
select defaclrole::regrole as owner, array_to_string(defaclacl, ' | ') as acl
from pg_default_acl
where defaclnamespace = 'public'::regnamespace and defaclobjtype = 'f';
```

The `supabase_admin` row should no longer list `anon=X`. Then re-run the watch
query in `SUPABASE_ANON_EXPOSURE_AUDIT.md` — it should stay at zero rows.
