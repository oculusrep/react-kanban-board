# Anonymous (publishable-key) exposure audit — 2026-09-28

Prompted by Supabase's notice that, **from 2026-10-30, new tables in `public` no longer get Data API grants automatically**. That change is about *future* tables; this audit covers the inverse problem it leaves untouched — tables and views that already exist and are reachable **with no authentication at all**.

Method: `has_table_privilege('anon', …)` to find candidates, then a decisive live test — real `curl` requests against `/rest/v1/` with `VITE_SUPABASE_PUBLISHABLE_KEY` and **no `Authorization` header**. Grant tables alone prove nothing here; several relations that looked exposed are in fact blocked by RLS, and reading the ACL would have produced a false positive list.

## Summary

- **~200 relations** in `public` grant `anon` SELECT/INSERT/UPDATE/DELETE. That is the `ALTER DEFAULT PRIVILEGES` default in this project, not a deliberate choice.
- For the ~175 with RLS enabled, **RLS is doing its job** — verified: `contact`, `deal`, `task` and the `security_invoker` views all return `[]` to an anonymous caller.
- **23 relations are genuinely exposed**, because RLS is either off (tables) or bypassed (views created without `security_invoker`). A view without `security_invoker` runs with its *owner's* privileges, so base-table RLS never applies to the caller — an `anon` SELECT grant on such a view is a full read of whatever it selects.

## Confirmed readable without authentication

Row counts are what an anonymous caller actually retrieved.

### Views without `security_invoker` (base-table RLS bypassed)

| Relation | Rows | What leaks |
|---|---|---|
| `portal_user_analytics` | 22 | **Contact first/last name, email address, portal access flags** — the worst of the set |
| `client_velocity_stats` | 564 | Client names + deal cycle metrics |
| `municipal_project_v` | 350 | Municipal project pipeline |
| `budget_vs_actual_monthly` | 223 | Monthly budget vs actual financials |
| `document_handoff_history` | 125 | Document handoff records |
| `v_prospecting_stale_targets` | 76 | Prospecting targets |
| `v_contact_tags` | 3 | Contact tags |
| `v_prospecting_target` | 1 | Company name, website, notes |
| `v_prospecting_weekly_metrics` | 1 | Prospecting metrics |
| `v_prospecting_daily_metrics` | n/a | Privileges pass; the query timed out (`57014`) before returning |
| `geography_columns`, `geometry_columns` | 8 | PostGIS metadata — harmless |

### Tables with RLS disabled

| Relation | Rows | Notes |
|---|---|---|
| `streetlight_usage_log` | 225 | StreetLight API usage/billing log |
| `streetlight_segment_metrics` | 170 | Purchased AADT metrics |
| `streetlight_segment` | large | Timed out at count; rows do return |
| `deal_submit_stage_map` | 9 | Lookup |
| `task_category` | 7 | Lookup |
| `streetlight_backfill_progress` | 2 | |
| `streetlight_quota_config` | 1 | Quota config — **writable**, see below |
| `streetlight_user_limit`, `streetlight_backfill_config`, `streetlight_usage_log_segment` | 0 | Empty today, exposed by grant |
| `spatial_ref_sys` | 8500 | PostGIS system table — harmless |

## Writes, not just reads

`anon` holds INSERT/UPDATE/DELETE on these too, and with RLS off nothing stands in the way. Confirmed by live INSERT probes that returned `22P02` (invalid input syntax — i.e. the request reached the table and failed on a *type cast*, not on a permission check) rather than `42501`:

- `task_category`, `deal_submit_stage_map`, `streetlight_quota_config`, `streetlight_usage_log`, `streetlight_segment`

So an anonymous caller can insert rows into these tables, including `streetlight_quota_config` (which governs paid StreetLight segment purchasing).

**Not proven separately:** UPDATE and DELETE. A zero-match `PATCH`/`DELETE` returns `204` whether or not the caller has privileges — the control test on RLS-protected `task` returned `204` as well, so that probe does not discriminate. The grants exist and RLS is off, so writes are permitted in principle; confirming it would require an actual mutation against production, which this audit did not do.

## Proposed fix

`supabase/migrations/20260928120000_revoke_anon_exposed_relations.sql` — **written but NOT applied.** It does two things:

1. `REVOKE ALL … FROM anon` on the 23 relations above. `authenticated` keeps its grants, so nothing in the app changes; OVIS has no pre-login screen that reads these.
2. `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;` so tables created by `postgres` (the psql migration path) stop inheriting anon grants. Caveat: default ACLs are per-granting-role, and there is a second entry owned by `supabase_admin` that this cannot touch — tables created by `supabase_admin` (dashboard-created tables) will still inherit anon grants until 2026-10-30.

Deliberately **not** in the migration, because both change behavior for authenticated users and need a decision:

- **Turning on `security_invoker`** for those views. It is the more correct fix — base-table RLS would then apply — but some of these views may be definer-by-design to aggregate across rows a user can't individually read (`client_velocity_stats`, `portal_user_analytics` both look like that). Flipping it could empty them for legitimate users.
- **Enabling RLS** on the `streetlight_*` tables, `task_category`, `deal_submit_stage_map`. After step 1 these are internal-only, which is likely fine; full RLS is the belt-and-braces version.

Verify after applying, with the same method used here — an anonymous `curl`, not a re-read of the grant tables.
