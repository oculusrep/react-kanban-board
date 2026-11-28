# Data API exposure audit and lockdown — 2026-09-28

**Covers:** unauthenticated (publishable-key) access to `public`, RLS-disabled tables,
`SECURITY DEFINER` views that bypass RLS, RLS-enabled tables whose policies admit `public`,
locking portal users out of municipal and prospecting data, and making the company budget
admin-only. Seven migrations, all applied. Ends with an anonymous request to all 198
`anon`-granted relations — see "Closing sweep".

**See also:** [ROW_LEVEL_SECURITY_STRATEGY.md](ROW_LEVEL_SECURITY_STRATEGY.md) (the original plan,
now partly stale), [PORTAL_AUTHZ_HOTFIX.md](PORTAL_AUTHZ_HOTFIX.md) (the portal model this builds on),
[2026-04-22-security-definer-view-fixes.md](2026-04-22-security-definer-view-fixes.md) (the earlier
definer-view pass that missed the `anon` grants), and CLAUDE.md § "Every new table, view or RPC
needs an explicit grants block".

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

## Round two — decisions taken, 2026-09-28

Two questions from the first round were answered: **the company budget should be admin-only**, and **the coach role needs no access at all** (no coach engagement is active). A third instruction followed: **portal users must not see municipal project data or prospecting lists.** Three more migrations, all applied and recorded.

### `20260928160000_security_invoker_remaining_views.sql`

Flips the four views held back in round one. `scripts/view_invoker_harness.py` still reports "DO NOT FLIP" for all four — expected, since it flags any internal-role loss and cannot know the loss is now intended.

| View | After | Why it is now correct |
|---|---|---|
| `budget_vs_actual_monthly` | admin 223, everyone else 0 | Matches `account_budget`'s admin-only policy — the decision |
| `client_velocity_stats` | admin/broker_full/va 564, coach 0 | Coach needs nothing |
| `document_handoff_history` | admin/broker_full/va 125, coach 0 | Coach needs nothing |
| `portal_user_analytics` | admin/broker_full 22, va/coach 0 | The page already excludes va |

`v_prospecting_daily_metrics` was still **not** flipped — see below.

### `20260928170000_internal_only_municipal_prospecting.sql`

Every municipal and prospecting table read `USING (true)` for `authenticated`, which includes portal logins. Switched to `is_internal_user()` (admin, broker_full, broker_lite, va — excludes coach and portal), already the convention on `prospecting_activity`:

- `municipal_project`, `municipal_project_staging`, `municipal_import`, `municipality`, `municipality_stage_mapping`
- `prospecting_target` (read **and** write — insert/update/delete were also wide open), `prospecting_note`
- `target`, `target_signal` (the Hunter pipeline, same exposure)

All ten views over these tables were already `security_invoker`, so they inherited the restriction with no separate changes. Nothing under `src/pages/portal` or `src/components/portal` references any of these tables, so no portal screen changed.

### `20260928180000_prospecting_daily_metrics_internal_only.sql`

`v_prospecting_daily_metrics` was the last way a portal user could reach prospecting data, and the only remaining definer view in `public` that logged-in users can read (besides the two PostGIS ones). Locking the base tables did not help, because a definer view ignores them.

**`security_invoker` is the wrong fix here.** The view blends `prospecting_activity` (internal users read all rows) with `activity` (owner-scoped — admin sees all, others only their own). Flipping it would have given a broker complete prospecting totals but only their own activity totals: a silently half-populated scorecard. Reporting wrong numbers is worse than denying access.

So the guard went *inside* the view — `AND is_internal_user()` on the outer `WHERE`, since that helper is `SECURITY DEFINER` and resolves the caller. Definition was pulled from the live database with `pg_get_viewdef`, not rebuilt from an older migration file. Result: admin/broker_full/va keep all 121 rows unchanged, coach and portal get 0.

### UI change

`BrokerForecastDashboard` read `budget_vs_actual_monthly` with no role check, so after the flip non-admins would have seen `$0` expense and budget figures. The two tiles that depend on it — **YTD Expenses** and **Net Profit Forecast** (which nets off budgeted expenses) — are now gated on `isAdmin`, using the `userRole` the file already imported but never used. Typecheck: 8 pre-existing errors in that file before, 7 after — the change removed the "`userRole` is declared but never read" error and introduced none.

### Verified live, per role

| Relation | admin | broker_full | va | coach | portal |
|---|---|---|---|---|---|
| `municipal_project` / `_v` | 350 | 350 | 350 | **0** | **0** |
| `municipality` | 27 | 27 | 27 | **0** | **0** |
| `prospecting_target` / `v_prospecting_target` | 1 | 1 | 1 | **0** | **0** |
| `target` | 230 | 230 | 230 | **0** | **0** |
| `target_signal` | 350 | 350 | 350 | **0** | **0** |
| `v_hunter_dashboard` | 227 | 227 | 227 | **0** | **0** |
| `v_prospecting_daily_metrics` | 121 | 121 | 121 | **0** | **0** |
| `budget_vs_actual_monthly` | 223 | **0** | **0** | **0** | **0** |
| `client_velocity_stats` | 564 | 564 | 564 | **0** | 1 (own) |
| `document_handoff_history` | 125 | 125 | 125 | **0** | **0** |
| `portal_user_analytics` | 22 | 22 | **0** | **0** | 1 (own) |

Round-trip tests for all three held this time (`BEGIN`/`COMMIT` stripped from a copy first, per the CLAUDE.md caveat), confirmed by the absence of the `SAVEPOINT` error.

## Round three — a blind spot in this audit's own method

Found while merging to `main`, and it matters more than the finding itself: **the original sweep asked the wrong question.**

It looked for tables with RLS *disabled* and views without `security_invoker`. It never considered an RLS-**enabled** table whose policy is written `TO public USING (true)` — and `public` includes `anon`, so the publishable key reads it straight through. RLS being on proves nothing about who the policies admit.

Verified by anonymous request:

| Relation | Leaked | What it exposes |
|---|---|---|
| `role` | 7 rows | Role names and the `permissions` JSON — hands an attacker the authorization model |
| `goal` | 2 rows | Company revenue and deal-count targets |
| `site_submit_deal_type` | 7 rows | Lookup |
| `contact_contact_type` | 0 rows | Only because the table is empty; the policy is equally open |

`nces_private_school` (22,510 rows) also held `anon` grants, but its policy is `TO authenticated`, so RLS held. Its grants were revoked anyway — the grant is what made the others reachable.

Fixed by `20260928190000_anon_readable_rls_tables.sql`: `REVOKE ALL … FROM anon` on all five, plus `ALTER POLICY … TO authenticated` on the four open policies. `service_role` has `BYPASSRLS`, so edge functions are unaffected.

### Closing sweep — every `anon`-granted relation, tested

Rather than re-query the grant tables, all **198** relations `anon` still holds SELECT on were hit with a real anonymous request:

- **195 return `[]`** — the grant is still there, but RLS blocks every row. This is the intended end state: the grants are broad, the policies are the gate, and the gate holds.
- **3 return data**, all deliberate: `spatial_ref_sys`, `geometry_columns`, `geography_columns` — PostGIS-owned system metadata that client libraries expect to read.

`restaurant_trend` needs a note, because it looks like a leak and is not. An anonymous request to it returns `57014 statement timeout` rather than `[]`, so the API cannot prove the negative. Tested directly instead — `SET LOCAL ROLE anon; SELECT count(*)` returns **0**. The timeout is a *performance* finding: its policy calls `can_manage_operations()`, which is re-evaluated per row across 50,112 rows. **Fixed 2026-10-03 in `20261003113553`** — it now answers in 0.2s. See the correction below for why the first attempt did not.

### Method note for the next audit

Three passes over this surface each missed something the next one caught:

1. **2026-04-22** followed the Supabase linter's `SECURITY DEFINER` flags — and missed that a definer view only leaks in combination with a grant.
2. **This audit, round one** checked `relrowsecurity` and `reloptions` — and missed policies that admit `public`.
3. **Round three** is the only pass whose method was "send an unauthenticated request to everything."

Only the third generalizes. `has_table_privilege`, `relrowsecurity` and policy text are each a *partial* predicate for reachability; the request is the whole one.

## Round four — caller-blind policies (what a portal client can read)

The last class left open. These tables are **not** anon-reachable; the issue is that their SELECT policy is `USING (true)` for `authenticated`, so any logged-in account — including a client with a portal login — reads every row.

### Fixed in code

`PortalAnalyticsPage`'s access gate listed `broker_limited`, which is not a valid `ovis_role` (`broker_lite` is), so that entry matched nobody. It traces back to the role names in ROW_LEVEL_SECURITY_STRATEGY.md. Removed rather than corrected to `broker_lite`: `portal_user_analytics` became `security_invoker` in `20260928160000`, and `contact`'s SELECT policy excludes `broker_lite`, so such a user would load the page and see 1 of 22 rows.

### APPLIED 2026-10-03 -- migrations `20261003113119` and `20261003113553`

61 `ALTER POLICY` statements across 50 tables, applied and recorded. Verified per role before applying (rolled-back transaction) and again live afterwards: **portal → 0 rows on all 38 data tables, no change for admin, broker_full or va.**

Two tables were caught that had not existed when this was drafted — `merchant_brand_region_ingest` (806 rows) and `merchant_location_brand_reassignment` (1,132) arrived with the merchant-regions work carrying the same `USING (true)` default. Re-running the caller-blind query before applying is what found them; the drafted list alone would have missed both.

Predicate is `(select is_internal_user())`, parenthesised, so it is evaluated once per query as an InitPlan rather than once per row.

Measured effect (portal → 0 in every case, internal roles unchanged):

| Table | Rows a portal client can read today |
|---|---|
| `merchant_location` | 23,667 |
| `nces_private_school` | 22,510 |
| `restaurant_location` | 10,594 |
| `ipeds_institution` | 6,163 |
| `hunter_signal` | 1,061 |
| `deal_stage_history` | 749 |
| `boundary_municipality` | 697 |
| `site_submit_stage_history` | 471 (and **writable**) |
| `google_places_result` | 828 |
| `merchant_brand` | 401 |
| `streetlight_segment_metrics`, `research_run`, `qb_item`, `clause_type`, `legal_playbook`, `traffic_cache`, `research_thread`, `special_layer`, `portal_file_visibility`, `client_broker`, `restaurant_placer_rank`, `goal`, `hunter_source` | 2–170 each |

**One regression the test caught and prevented.** The first draft *dropped* the blanket `email_template_select` policy, leaving the per-user rule (`created_by = auth.uid() OR is_shared OR admin`). The two existing templates are admin-created and not flagged shared, so `broker_full` and `va` went 2 → 0. The revised version scopes the blanket policy to internal users instead: all three internal roles keep 2, portal gets 0. (Worth noting the per-user policy compares `u.id = auth.uid()` rather than `auth_user_id`, so it likely never matches anyone but admin — left alone.)

### Deliberately left permissive

The portal app genuinely reads these, so a blanket lock would break it. Each needs per-row scoping with `portal_user_client_ids()`, which is a larger change:

| Table | Status |
|---|---|
| `property_note` (3,308 rows) | **LOCKED 2026-10-03** — the assumption was wrong, see below |
| `role` | **LOCKED 2026-10-03** — no portal page calls `usePermissions` |
| `dropbox_mapping` (3,037 rows) | Still open — `PortalFilesTab` browses files via `useDropboxFiles` |
| `map_layer`, `map_layer_shape`, `map_layer_client_share` | Still open — `PortalMapPage` renders the shared `LayerManager` |
| `submit_stage`, `deal_stage`, `transaction_type`, other enum/label tables | Left permissive — stage and type *names*, not an exposure |

### `property_note` and `role` locked — `20261003165201`

Both were kept permissive on the assumption the portal read them. Neither does:

- **`property_note`** — `PortalChatTab` only *inserts*, mirroring a client comment into a note, and INSERT is a separate policy (`WITH CHECK true`) that was left alone. The only reader, `usePropertyTimeline`, is used by `PropertyActivityTab`, an internal page. Verified by impersonation **including a real INSERT probe as the portal role** (1 row, rolled back) — a read-only check would have missed a broken chat tab.
- **`role`** — read by `hooks/usePermissions.tsx`, which is in the portal's *import* tree but is not called by any portal page or component. (Another instance of import reachability ≠ entitlement.)

Live after applying: admin 3,308 notes / 7 roles unchanged; portal **0 / 0**.

### What the two remaining ones need decided

- **`map_layer*`** — the data model already answers it: a `map_layer_client_share` table exists and `mapLayerService` shares layers per client, so the policy should be internal-or-shared-to-my-client. Needs confirmation that "only layers explicitly shared with me" is the intended portal behavior, since a client currently sees all 16.
- **`dropbox_mapping`** — the hard one. Rows are polymorphic (`entity_type` + `entity_id`, no FK), and the portal needs to resolve a folder path for whatever the client is viewing. Two questions: which entity types may a client resolve, and should it be scoped in the policy or moved entirely behind a `SECURITY DEFINER` RPC? The portal already uses `get_dropbox_folder_path`; if resolution goes through that and the RPC does the client check, the table can be locked outright — simpler and tighter than a three-way polymorphic predicate with no FK to lean on.

### Method note

Static import reachability was the wrong tool for deciding what the portal needs. Seeding from `src/components/portal/` over-reached badly, because that directory holds *admin-side* components for managing the portal (`ClientBrokersSection` is imported only by `ClientOverviewTab`), and shared components like `SiteSubmitSidebar` pull in research panels and convert-to-deal modals. The import graph says what code *could* run, not what the portal is *entitled* to. What settled each case was checking which component actually renders inside the portal route tree, then measuring per-role row counts.

## Appendix — the prepared round-four migration (verified, not applied)

Preserved here because it originally lived only in a session scratchpad, which has
since been cleared. Verified against production in a rolled-back transaction on
2026-09-28: portal → 0 rows on every table below, **no change for admin,
broker_full or va**. To apply it, save as
`supabase/migrations/<new date +%Y%m%d%H%M%S>_internal_only_caller_blind_policies.sql`
and follow the psql path in CLAUDE.md (including the `schema_migrations` INSERT).

Note the predicate form: `(select is_internal_user())`, parenthesised, is evaluated
once per query as an InitPlan rather than once per row. That is what also fixes the
`restaurant_trend` statement timeout.

```sql
BEGIN;

-- Deal / site submit internals
ALTER POLICY "select_attachment"                             ON public.attachment                USING ((select is_internal_user()));
ALTER POLICY "Users can read deal stage history"             ON public.deal_stage_history        USING ((select is_internal_user()));
ALTER POLICY "Authenticated read site_submit_stage_history"  ON public.site_submit_stage_history USING ((select is_internal_user()));
ALTER POLICY "Authenticated write site_submit_stage_history" ON public.site_submit_stage_history USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated users full access to deal_rent_schedule" ON public.deal_rent_schedule USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated read client_broker"              ON public.client_broker             USING ((select is_internal_user()));
ALTER POLICY "Authenticated write client_broker"             ON public.client_broker             USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated read pending_client_comment_email"  ON public.pending_client_comment_email USING ((select is_internal_user()));
ALTER POLICY "Authenticated write pending_client_comment_email" ON public.pending_client_comment_email USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));

-- LOI / negotiation
ALTER POLICY "Authenticated users full access to legal_loi_decision"      ON public.legal_loi_decision      USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated users full access to legal_loi_round"         ON public.legal_loi_round         USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated users full access to legal_loi_session"       ON public.legal_loi_session       USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated users full access to legal_playbook"          ON public.legal_playbook          USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated users full access to legal_playbook_position" ON public.legal_playbook_position USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated users full access to negotiation_logs"        ON public.negotiation_logs        USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated users full access to clause_type"             ON public.clause_type             USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));
ALTER POLICY "Authenticated users full access to comment_templates"       ON public.comment_templates       USING ((select is_internal_user())) WITH CHECK ((select is_internal_user()));

-- Prospecting intel (same class as target / prospecting_target, done in 20260928170000)
ALTER POLICY hunter_contact_enrichment_select ON public.hunter_contact_enrichment USING ((select is_internal_user()));
ALTER POLICY hunter_feedback_select           ON public.hunter_feedback           USING ((select is_internal_user()));
ALTER POLICY hunter_run_log_select            ON public.hunter_run_log            USING ((select is_internal_user()));
ALTER POLICY hunter_signal_select             ON public.hunter_signal             USING ((select is_internal_user()));
ALTER POLICY hunter_source_select             ON public.hunter_source             USING ((select is_internal_user()));

-- Market research
ALTER POLICY research_checklist_item_read     ON public.research_checklist_item     USING ((select is_internal_user()));
ALTER POLICY research_run_read                ON public.research_run                USING ((select is_internal_user()));
ALTER POLICY research_sweep_read              ON public.research_sweep              USING ((select is_internal_user()));
ALTER POLICY research_sweep_chunk_read        ON public.research_sweep_chunk        USING ((select is_internal_user()));
ALTER POLICY research_thread_read             ON public.research_thread             USING ((select is_internal_user()));
ALTER POLICY research_thread_message_read     ON public.research_thread_message     USING ((select is_internal_user()));
ALTER POLICY research_thread_run_read         ON public.research_thread_run         USING ((select is_internal_user()));
ALTER POLICY research_thread_run_step_read    ON public.research_thread_run_step    USING ((select is_internal_user()));
ALTER POLICY research_thread_tool_result_read ON public.research_thread_tool_result USING ((select is_internal_user()));

-- Paid third-party data
ALTER POLICY google_places_api_log_select     ON public.google_places_api_log     USING ((select is_internal_user()));
ALTER POLICY google_places_result_select      ON public.google_places_result      USING ((select is_internal_user()));
ALTER POLICY google_places_saved_query_select ON public.google_places_saved_query USING ((select is_internal_user()));
ALTER POLICY "All authenticated users can read brands"     ON public.merchant_brand         USING ((select is_internal_user()));
ALTER POLICY "All authenticated users can read categories" ON public.merchant_category      USING ((select is_internal_user()));
ALTER POLICY "All authenticated users can read alerts"     ON public.merchant_closure_alert USING ((select is_internal_user()));
ALTER POLICY "All authenticated users can read locations"  ON public.merchant_location      USING ((select is_internal_user()));
ALTER POLICY restaurant_location_select    ON public.restaurant_location    USING ((select is_internal_user()));
ALTER POLICY restaurant_placer_rank_select ON public.restaurant_placer_rank USING ((select is_internal_user()));
ALTER POLICY restaurant_trend_select       ON public.restaurant_trend       USING ((select is_internal_user()));
ALTER POLICY "Allow authenticated read"    ON public.traffic_cache          USING ((select is_internal_user()));
ALTER POLICY "Allow authenticated read"    ON public.esri_data_vintage      USING ((select is_internal_user()));
ALTER POLICY nces_private_school_read      ON public.nces_private_school    USING ((select is_internal_user()));
ALTER POLICY ipeds_institution_read        ON public.ipeds_institution      USING ((select is_internal_user()));
ALTER POLICY boundary_municipality_read    ON public.boundary_municipality  USING ((select is_internal_user()));

-- StreetLight (paid traffic data; 20260928150000 created these as USING (true))
ALTER POLICY streetlight_segment_select           ON public.streetlight_segment           USING ((select is_internal_user()));
ALTER POLICY streetlight_segment_metrics_select   ON public.streetlight_segment_metrics   USING ((select is_internal_user()));
ALTER POLICY streetlight_usage_log_select         ON public.streetlight_usage_log         USING ((select is_internal_user()));
ALTER POLICY streetlight_usage_log_segment_select ON public.streetlight_usage_log_segment USING ((select is_internal_user()));
ALTER POLICY streetlight_quota_config_select      ON public.streetlight_quota_config      USING ((select is_internal_user()));
ALTER POLICY streetlight_user_limit_select        ON public.streetlight_user_limit        USING ((select is_internal_user()));
ALTER POLICY streetlight_backfill_config_select   ON public.streetlight_backfill_config   USING ((select is_internal_user()));
ALTER POLICY streetlight_backfill_progress_select ON public.streetlight_backfill_progress USING ((select is_internal_user()));

-- Finance / ops
ALTER POLICY "Authenticated users can view qb_item" ON public.qb_item USING ((select is_internal_user()));
ALTER POLICY "Anyone can read goals"                ON public.goal    USING ((select is_internal_user()));
ALTER POLICY "Allow all authenticated users to read special_layer" ON public.special_layer USING ((select is_internal_user()));
ALTER POLICY portal_file_visibility_select_all ON public.portal_file_visibility USING ((select is_internal_user()));

-- email_template has TWO SELECT policies: a per-user one ("Users can view own and
-- shared templates") and a blanket one that overrides it, since policies are OR-ed.
-- DROPPING the blanket one is WRONG and was caught in testing: the per-user rule is
-- `created_by = auth.uid() OR is_shared OR admin`, and the two existing templates are
-- admin-created and not flagged shared, so broker_full and va went 2 -> 0. Scope it
-- instead. (That per-user policy also compares `u.id = auth.uid()` rather than
-- auth_user_id, so it likely never matches anyone but admin — left alone.)
ALTER POLICY email_template_select ON public.email_template USING ((select is_internal_user()));

COMMIT;
```

Before applying, re-run the two checks that made this safe:

1. `scripts/view_invoker_harness.py` style per-role row counts before/after in one
   rolled-back transaction — strip `BEGIN`/`COMMIT` from a copy first, or the file
   commits itself (see CLAUDE.md).
2. An anonymous `curl` sweep afterwards.

## Correction -- the InitPlan fix needed a second half

`20261003113119` wrapped these policies in `(select is_internal_user())`, and that was claimed to fix the `restaurant_trend` timeout. **It did not**, and the post-apply check caught it still timing out. `EXPLAIN` showed why:

```
Seq Scan on restaurant_trend (actual rows=0)
  Filter: ((InitPlan 1).col1 OR can_manage_operations())
  Rows Removed by Filter: 50112          -- 4.6s, over the ~3s API timeout
```

Both restaurant tables carry a **second, older** policy whose qual is a bare `can_manage_operations()`. Policies are OR-ed, so an InitPlan on one operand only short-circuits when it is *true*. An internal user was always fast (37ms) because their InitPlan is true and the OR stops there. For anon or a portal user it is false, so Postgres still ran the per-row function across all 50,112 rows.

`20261003113553` wraps the second policy too. An anonymous request to `restaurant_trend` now answers in **0.2s** instead of timing out.

**Generalisable lesson:** wrapping one policy in `(select ...)` does not make a table fast -- *every* policy on it must be wrapped, because the planner can only skip the per-row operand when a cheaper one has already decided the row. Read `EXPLAIN` for a bare `function()` inside `Filter:` rather than assuming the rewrite worked.

### Still per-row -- about 28 policies on tables over 1,000 rows

Same one-line fix each. Not bundled here: it is a performance change with a different blast radius and deserves its own verification.

| Table | Approx rows | Policy qual |
|---|---|---|
| `portal_email_send` | 51,398 | `is_internal_user()` |
| `email_object_link` | 40,164 | `is_internal_user()` |
| `critical_date` | 7,889 | `can_manage_operations()`, `get_user_role() = ANY(...)` |
| `contact` | 5,925 | `can_manage_operations()`, `portal_user_contact_id()`, `get_user_role()` |
| `email_attachments` | 4,918 | `is_internal_user()` |
| `property` | 4,779 | `can_manage_operations()`, `get_user_role()` |
| `property_contact` | 4,441 | both |
| `salesforce_Property__c` | 3,542 | `can_manage_operations()` |
| `note_object_link` | 3,319 | `can_manage_operations()` |
| `site_submit` | 3,222 | `can_manage_operations()`, `portal_user_client_ids()`, `get_user_role()` |
| `gmail_label_event`, `site_submit_comment`, `dropbox_sync_cache`, `note`, `site_submit_activity`, `note_backup`, `email_label` | 1,500-3,300 | mixed |

All the functions are `STABLE`, so `(select f())` is semantically identical -- it changes only *when* the function runs, not what it returns. For the column-comparing ones, wrap just the call: `id = (select portal_user_contact_id())`.

## Remaining work

- Fix the `broker_limited` role string in `PortalAnalyticsPage` — it is not a valid `ovis_role` (`broker_lite` is), so that branch of the access gate never matches.
- If a coach engagement ever starts, `coach` now has no access to deals, prospecting, municipal data, budgets or handoff history. Granting it means real SELECT policies on `deal` and `prospecting_time_entry`, not re-widening the views.
- `v_prospecting_daily_metrics` is still the one definer view in `public` that internal users read. It is guarded, but if it is ever recreated the guard must be carried forward — `pg_get_viewdef` first.
- Nothing else in `public` is readable by `anon` or by portal users beyond their own records, as of the closing sweep above. Re-check with `scripts/view_invoker_harness.py` and an anonymous `curl` after any migration that adds a table or view.
- Wrap the ~28 remaining per-row policy function calls in `(select ...)`, per the table above.
- Scope `dropbox_mapping` and `map_layer*` for portal clients (see the two questions above). `property_note` and `role` are done.

## Original proposal (superseded by the above)


`supabase/migrations/20260928120000_revoke_anon_exposed_relations.sql` (since applied — see above). It does two things:

1. `REVOKE ALL … FROM anon` on the 23 relations above. `authenticated` keeps its grants, so nothing in the app changes; OVIS has no pre-login screen that reads these.
2. `ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;` so tables created by `postgres` (the psql migration path) stop inheriting anon grants. Caveat: default ACLs are per-granting-role, and there is a second entry owned by `supabase_admin` that this cannot touch — tables created by `supabase_admin` (dashboard-created tables) will still inherit anon grants until 2026-10-30.

Deliberately **not** in that first migration, because both change behavior for authenticated users; both were then handled by migrations 2 and 3 above, in the reduced scope the harness proved safe:

- **Turning on `security_invoker`** for those views. It is the more correct fix — base-table RLS would then apply — but some of these views may be definer-by-design to aggregate across rows a user can't individually read (`client_velocity_stats`, `portal_user_analytics` both look like that). Flipping it could empty them for legitimate users.
- **Enabling RLS** on the `streetlight_*` tables, `task_category`, `deal_submit_stage_map`. After step 1 these are internal-only, which is likely fine; full RLS is the belt-and-braces version.

Verify after applying, with the same method used here — an anonymous `curl`, not a re-read of the grant tables.

---

## Round three — RPCs, 2026-10-03. OPEN ITEM: the supabase_admin default

This audit covered **relations only** — its method was `has_table_privilege` plus
live `/rest/v1/` reads, and its closing sweep tested "all 198 `anon`-granted
**relations**." Database **functions were never in scope**, and neither
`EDGE_FUNCTION_JWT_AUDIT.md` nor this file classified a single one.

60 `SECURITY DEFINER` functions in `public` were anon-reachable (47 RPC-callable,
13 triggers, which PostgREST cannot call). `SECURITY DEFINER` removes RLS from the
question entirely, so this file's central finding — "for the ~175 with RLS enabled,
RLS is doing its job" — said nothing about them.

**Confirmed by anonymous HTTP and since closed** (migrations `20261003174916`,
`175011`, `180540`, `180610`, `180656`, `180839`, `211021`, `211145`):

| function | what it returned to an unauthenticated caller |
|---|---|
| `get_sweep_staging` | 2,610 bytes of research staging — project names, addresses, descriptions |
| `get_portal_user_clients` | `client_id` + `client_name` for a portal user |
| `get_dropbox_folder_path` | a real Dropbox folder path |
| `resolve_actor_kind` | `"broker"` for any auth user id |

Plus eight **writers** closed on inspection (never called): `submit_research_report`
(deletes a run's staging rows), `streetlight_record_spend` (the paid-API spend
ledger), `set/reset_portal_file_visibility`, `calculate_deal_payment_dates`,
`update_all_payment_estimates`, `update_behind_schedule_status`,
`record_portal_site_submit_view`, `create_orep_target_area`. And
`validate_portal_invite_token` is now read-only, with its `auth.identities`
DELETE moved to the `portal-invite-precheck` edge function.

### Why it took two revokes every time — read this before the next pass

A function in this database is anon-reachable by **two independent grants**:

1. the `PUBLIC` EXECUTE grant Postgres adds to every new function, and
2. an **explicit `anon` grant** from `ALTER DEFAULT PRIVILEGES` (`pg_default_acl`,
   objtype `f`).

Round one of this audit revoked the **table** default from `anon`; **functions were
left**. So `REVOKE … FROM anon` succeeds and changes nothing when the reach comes
from `PUBLIC`, and `REVOKE … FROM PUBLIC` succeeds and changes nothing when there
is also an explicit `anon` grant. Both happened, in that order, on the same
functions. **Closing one path tells you nothing about the other, and a revoke that
printed `REVOKE` is not evidence — only the anonymous HTTP request is.**

Closing `anon` also left `authenticated` holding EXECUTE on all nine writers from
the same default, so any logged-in account — portal clients included — could still
delete staging rows or fabricate spend. That needed its own migration.

### OPEN: the supabase_admin default privileges cannot be changed from here

Applied for the `postgres` owner, so migrations (which run as `postgres`) now
produce functions that `anon` cannot call unless granted explicitly — CLAUDE.md's
explicit-grants rule enforced by the database rather than by memory:

```sql
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
```

**The `supabase_admin` half fails:** `ERROR: permission denied to change default
privileges`. Established, not assumed:

- `pg_has_role('postgres','supabase_admin','MEMBER')` → **false**
- `SET ROLE supabase_admin` → `ERROR: permission denied to set role "supabase_admin"`
- `postgres` is **not** a superuser (`rolsuper = false`, `rolbypassrls = true`)

So no session we can open — psql or the dashboard SQL editor, which also connects
as `postgres` — can alter another role's default privileges. It needs Supabase
support or a platform-level change.

**Residual risk today is low and should not be overstated.** All 744
`supabase_admin`-owned functions in `public` are **PostGIS extension functions**
(`pg_depend` confirms: 744 of 744 belong to `extension postgis`, zero are
non-extension). They are pure computation and expected to be callable. The gap is
*future* objects created as `supabase_admin` — Supabase tooling or an extension
upgrade — which would inherit `anon` EXECUTE silently.

**Watch query**, cheap enough for any later audit:

```sql
select p.proname
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
left join pg_depend d on d.objid = p.oid and d.deptype = 'e'
where n.nspname = 'public'
  and pg_get_userbyid(p.proowner) = 'supabase_admin'
  and d.objid is null                     -- not from an extension
  and has_function_privilege('anon', p.oid, 'EXECUTE');
```

Zero rows today. Anything appearing there is a new anon-callable function nobody
granted.
