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

## What was applied (2026-09-28)

All three applied to the production database and recorded in `supabase_migrations.schema_migrations`.

### 1. `20260928120000_revoke_anon_exposed_relations.sql` — the hole is closed

`REVOKE ALL … FROM anon` on all 20 relations (the 3 PostGIS ones left alone), plus `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon`.

Verified the way the exposure was found — anonymous `curl`, no `Authorization` header: **all 20 now return `42501 permission denied`**, reads and inserts alike. `authenticated` was untouched, so nothing in the app changed.

### 2. `20260928140000_security_invoker_safe_views.sql` — 5 of 10 views flipped

`scripts/view_invoker_harness.py` measured row counts per role (`admin`, `broker_full`, `broker_lite`, `va`, `coach`, `portal`) before and after `security_invoker = on`, in one rolled-back transaction. **Six of the ten would have broken for staff**, which is why they are not flipped:

| View | Effect of flipping | Action |
|---|---|---|
| `municipal_project_v` | no change, any role | flipped |
| `v_prospecting_target` | no change | flipped |
| `v_prospecting_stale_targets` | no change | flipped |
| `v_prospecting_weekly_metrics` | no change | flipped |
| `v_contact_tags` | coach/portal 3 → 0; both already cannot read `contact` at all | flipped |
| `client_velocity_stats` | coach 564 → 0 | **left definer** |
| `document_handoff_history` | coach 125 → 0 | **left definer** |
| `v_prospecting_daily_metrics` | broker_full 121 → 11, coach → 0 | **left definer** |
| `budget_vs_actual_monthly` | broker_full/va/coach 223 → 0 | **left definer** |
| `portal_user_analytics` | broker_lite 22 → 1, va/coach → 0 | **left definer** |

The four zero-change flips are defense in depth: they alter nothing today (base policies are permissive for `authenticated`) but stop the view bypassing those policies if they are ever tightened.

**Two real findings fell out of this**, neither fixed here:

- **Every logged-in user can read the company operating budget.** `account_budget`'s SELECT policy is admin-only, but `BrokerForecastDashboard` reads `budget_vs_actual_monthly` with no role gate, and the definer view bypasses the policy. The policy, the view and the UI disagree; which one is right is a product decision.
- **`coach` cannot read `deal` at all** (`can_manage_operations()` excludes it), so three of these views are the *only* reason the coach role sees anything. Coaching works today by bypassing RLS. Flipping them requires giving `coach` real SELECT policies first.
- Minor, adjacent: `PortalAnalyticsPage` gates on `['admin','broker_full','broker_limited']` — `broker_limited` is not a valid `ovis_role` (`broker_lite` is), so that branch of the gate never matches.

### 3. `20260928150000_rls_on_unprotected_tables.sql` — RLS on all 10 tables

Policies were set from who actually uses each table: the `streetlight_*` tables are read-only from the browser and written only by edge functions (service_role bypasses RLS), so they get `FOR SELECT TO authenticated USING (true)`; `task_category` is written from the UI (3 call sites) so it gets `FOR ALL`; `deal_submit_stage_map` is referenced from neither `src/` nor `supabase/functions/` and gets SELECT.

Verified live per role after applying, including a no-op UPDATE probe on `task_category`: **no role lost any read or write**, and the only intended change (coach/portal losing `v_contact_tags`) is present.

### Process note — the round-trip test applied the migration

The round-trip verification for migrations 2 and 3 did not roll back. Both files contain their own `BEGIN; … COMMIT;`, and `\i`-ing them inside an outer transaction ran that `COMMIT`, ending the outer transaction and committing the changes for real; the trailing `ROLLBACK` then did nothing. It also committed the harness's impersonation fixture — a `broker_lite` row in `public."user"` — which was deleted immediately afterward (`DELETE 1`, no other `broker_lite` rows exist).

Net effect was benign, because the per-role harness had already cleared both migrations before that run. CLAUDE.md now documents the trap and the `sed` workaround.

## Remaining work

- Decide the `budget_vs_actual_monthly` question above.
- Give `coach` real SELECT policies on `deal` / `prospecting_time_entry`, then flip the remaining four views.
- Fix the `broker_limited` role string in `PortalAnalyticsPage`.
- **Separate exposure, not covered here:** portal users (your clients) can read all 350 `municipal_project` rows and all prospecting targets — those base tables have `USING (true)` for every `authenticated` role, portal included. Flipping the views does not help, because the policy itself is permissive.

## Original proposal (superseded by the above)


`supabase/migrations/20260928120000_revoke_anon_exposed_relations.sql` (since applied — see above). It does two things:

1. `REVOKE ALL … FROM anon` on the 23 relations above. `authenticated` keeps its grants, so nothing in the app changes; OVIS has no pre-login screen that reads these.
2. `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;` so tables created by `postgres` (the psql migration path) stop inheriting anon grants. Caveat: default ACLs are per-granting-role, and there is a second entry owned by `supabase_admin` that this cannot touch — tables created by `supabase_admin` (dashboard-created tables) will still inherit anon grants until 2026-10-30.

Deliberately **not** in that first migration, because both change behavior for authenticated users; both were then handled by migrations 2 and 3 above, in the reduced scope the harness proved safe:

- **Turning on `security_invoker`** for those views. It is the more correct fix — base-table RLS would then apply — but some of these views may be definer-by-design to aggregate across rows a user can't individually read (`client_velocity_stats`, `portal_user_analytics` both look like that). Flipping it could empty them for legitimate users.
- **Enabling RLS** on the `streetlight_*` tables, `task_category`, `deal_submit_stage_map`. After step 1 these are internal-only, which is likely fine; full RLS is the belt-and-braces version.

Verify after applying, with the same method used here — an anonymous `curl`, not a re-read of the grant tables.
