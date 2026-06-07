# Supabase Migration History Cleanup — Plan

**Branch:** `chore/migration-history-cleanup-plan` (off `main`)
**Status:** Planning only. No DB changes proposed by this doc — execution is a separate PR.
**Created:** 2026-06-06
**Motivation:** `supabase db push` is blocked by 83 local migration files that lack a matching row in `supabase_migrations.schema_migrations`. Until that gap closes, every new migration on this project requires the psql-then-INSERT workaround. The block also prevents Supabase branch / dev-environment setup (per `project_supabase_sandbox` memory) which the upcoming MCP / market-research-agent work depends on.

---

## Current state (measured 2026-06-06)

| | count |
|---|---|
| Valid local migration files in `supabase/migrations/*.sql` | **181** |
| Rows in `supabase_migrations.schema_migrations` | **98** |
| Local files where `(version, name)` is tracked | 98 |
| **Local files that need to be reconciled** | **83** |
| Local file with no timestamp prefix at all (`automatic_payment_management.sql`) | 1 (separate edge case) |

The 83 split into two flavors:

| Class | Count | Description |
|---|---|---|
| **Shadow-duplicate** | 33 | File's date prefix IS in `schema_migrations`, but with a different `name`. Another file already claims that version. |
| **Orphan-prefix** | 50 | File's date prefix never appears in `schema_migrations` at all. |

The 2026-05-31 audit cleaned up the **May 4–29 2026 window** (25 `git mv` renames + 4 captured-from-remote files). It did not touch the Oct 2025 – April 2026 backlog, which is what this plan addresses.

---

## How the state got created

Three known mechanisms — most files probably came from #1:

1. **`psql -f file.sql` without `INSERT INTO supabase_migrations.schema_migrations`.** This is the dominant cause. Applying via psql runs the SQL but doesn't update tracking. The 26 commission-system files all prefixed `20251023_` are the textbook case: clearly applied in sequence one afternoon, none of them tracked.
2. **Supabase Studio SQL editor for ad-hoc DDL.** Same effect — schema changes, no tracking row.
3. **File renames after application.** Rename a file on disk; tracking row keeps the old name → CLI thinks the renamed file is unapplied. The May 31 realignment was cleaning *this* up for 25 files.

Going-forward discipline (one sentence): always pair the SQL apply with the `INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES (...);` — or use `supabase db push` once the chain is clean and let it do both.

---

## Risks

**Not risks** (worth stating up front):
- No DDL on existing tables. Cleanup only INSERTs into `supabase_migrations.schema_migrations` and renames local files.
- No downtime. INSERTs to that table don't lock anything app-facing.
- No data loss. Operations are purely additive — rollback is `DELETE FROM schema_migrations WHERE version IN (...)`.
- No RLS / auth change.

**Real risk: "false certification."**

If we mark a file as applied that *was never actually executed*, the cleanup silently bakes in a lie. Today the app keeps working because the missing schema effect doesn't matter to current behavior. Months from now, when a Supabase branch / dev environment / disaster-recovery rebuild runs `db reset`, the file gets skipped and something breaks subtly.

Mitigated by per-file verification (next section).

**Real but mild risk: in-flight concurrent migrations.** If anyone else runs `db push` during the cleanup window, race conditions are possible. Mitigation: announce a freeze window, do the cleanup in one focused session.

**Real but trivial risk: filename collisions during `git mv`.** A new timestamp picked at random could collide with an existing one. Mitigation: append a 6-digit time suffix derived from `git log -1 --format=%cd` of the file's creation commit when available; otherwise just pick `<original_date>HHMMSS` with HHMMSS = a monotonic counter within the date.

---

## Verification tactics (apply BEFORE marking a file as applied)

For each of the 83 files, prove the schema effect is in prod with one of these. Tactic 1 is cheapest; fall through to 2 and 3 as needed.

### Tactic 1 — Content match against `schema_migrations.statements`

For shadow-duplicate files (33), the prefix already has a tracking row. Check whether the file's SQL appears verbatim in *any* row's `statements` column:

```sql
SELECT version, name
FROM supabase_migrations.schema_migrations
WHERE EXISTS (
  SELECT 1
  FROM unnest(statements) AS s
  WHERE s LIKE '%<distinctive snippet from file.sql>%'
);
```

If a match exists, the file is a duplicate of an already-tracked migration → **delete the local file** (or skip — same outcome). No INSERT needed.

### Tactic 2 — Schema probe for named objects

For files that create named objects (`CREATE TABLE foo`, `CREATE FUNCTION bar`, `CREATE INDEX baz`, `ALTER TABLE x ADD COLUMN y`), check live prod:

```sql
SELECT to_regclass('public.foo');                              -- table exists?
SELECT 1 FROM pg_proc WHERE proname='bar';                     -- function exists?
SELECT 1 FROM pg_indexes WHERE indexname='baz';                -- index exists?
SELECT column_name FROM information_schema.columns
  WHERE table_name='x' AND column_name='y';                    -- column exists?
```

If the object exists in prod, the migration was applied → safe to mark applied with INSERT.

### Tactic 3 — Manual eyeball for ad-hoc DML / data-fix migrations

For files that mutate data without creating named objects (the `20251023_recalculate_existing_overrides.sql` flavor — many of the commission-fix files are this shape), neither tactic 1 nor 2 helps directly. Read the SQL, reason about whether the effect is present today (e.g., do current commission splits look like they reflect the fix), and document the reasoning in the PR.

If reasoning isn't conclusive, the safe move is to **skip the file** (do not mark applied). It stays untracked but harmless until someone investigates.

---

## Execution order

Three batches, easiest → hardest. Each batch ends in an acceptance check.

### Batch 0 — Safeguards (do once at the start)

```sql
-- Snapshot the tracking table so any mistake is one DELETE / INSERT away.
CREATE TABLE supabase_migrations.schema_migrations_backup_2026_06_06
  AS SELECT * FROM supabase_migrations.schema_migrations;

-- Sanity: should equal 98 on this date
SELECT COUNT(*) FROM supabase_migrations.schema_migrations_backup_2026_06_06;
```

Drop the snapshot table once the cleanup is verified-stable for a week.

### Batch 1 — 50 orphan-prefix files (no tracking row exists for the prefix)

These are the most mechanical: pick the file, verify the schema effect, INSERT a tracking row using the file's prefix + name as-is. **No renames needed** — the prefix is unused.

Sub-grouped by prefix (so you can spot-check related files together):

- `20251023` × 26 — commission/payment override system (verify via Tactic 3 + spot-check on the live `payment_split` schema)
- `20251024` × 1 — `complete_payment_auto_sync`
- `20251105` × 4 — restaurant tables + Salesforce coords (Tactic 2: tables exist?)
- `20260302` × 4 — payment dates + deal forecasting (Tactic 2 mostly)
- `20260422`–`20260427` × 7 — merchants layer + portal email alerts + point layer
- `20260501000000`–`20260504000003` × 7 — task system v2 phase 1 + streetlight initial schema

Acceptance after Batch 1:
```sql
-- Tracked count grows from 98 → ~148 (some files may be content-matched + deleted instead)
SELECT COUNT(*) FROM supabase_migrations.schema_migrations;
```

### Batch 2 — 33 shadow-duplicate files (prefix tracked under another name)

Each of these needs a per-file decision:

| Sub-class | Action |
|---|---|
| File's SQL is identical (or semantically equivalent) to the tracked row's `statements` | **Delete the local file** — it's a literal duplicate. No INSERT needed. |
| File's SQL is *different* from the tracked row's, and the schema effect IS in prod (Tactic 2) | **`git mv` to a unique timestamp** (e.g., `<date>HHMMSS_<name>.sql` where HHMMSS = a fresh time), then INSERT a tracking row. |
| File's SQL is different and the schema effect is NOT in prod | **Either:** apply now via psql + INSERT, **or:** delete the file as dead code. Choose per-file with a written note. |

Hand-fittable subgroups to expect (from the dump in the appendix):

- `20260112_*` × 3 — three "email visibility" files where one tracked. Likely two are renamed iterations of the third → content-match candidates.
- `20260130_*` × 3 — client portal RLS v1/v2/v3 — probably each ran successively; need rename + INSERT for the v2/v3 if tracking only captured one.
- `20260320_esri_geoenrichment_v{1..4}.sql` × 4 — classic versioned-iteration pattern; tracked row name is `esri_data_vintage` (a *different* migration entirely). Each `v` file is its own migration.
- 23 other one-offs.

Acceptance after Batch 2:
```sql
-- Tracked count grows toward total_local_files (minus deletions). The exact
-- target depends on how many files end up content-matched/deleted vs INSERT'd.
SELECT COUNT(*) FROM supabase_migrations.schema_migrations;
```

### Batch 3 — The one no-timestamp file

`supabase/migrations/automatic_payment_management.sql` has no `<timestamp>_<name>.sql` shape. The CLI skips it entirely. Decide: rename to a timestamped form and treat as Batch 1/2, or delete if its content is already captured elsewhere.

### Final acceptance

```bash
# When this prints "Remote database is up to date." the cleanup is done.
supabase db push
```

That output is the single source of truth that the chain is clean. Until then, the cleanup isn't finished.

---

## Going-forward discipline (post-cleanup)

After Batch 3 acceptance passes, only one practice matters:

1. Use `supabase db push` for every new migration. It runs the SQL AND records the tracking row in one step.
2. If `supabase db push` ever fails (CLI auth flake or otherwise), the fallback is **always two psql commands** — never just the first:
   ```
   psql "$DATABASE_URL" -f new_migration.sql
   psql "$DATABASE_URL" -c "INSERT INTO supabase_migrations.schema_migrations (version, name) VALUES ('<ts>','<name>');"
   ```

Update `reference_supabase_migration_workflow.md` memory after cleanup completes to reflect the new clean state.

---

## Estimated effort

- **Batch 0:** <5 minutes.
- **Batch 1 (50 orphans):** ~1 hour. The 26 `20251023_*` payment files are the slowest because they need Tactic 3 reasoning; the rest are Tactic 2 schema probes.
- **Batch 2 (33 shadow-duplicates):** ~1.5 hours. Per-file decisions are slower than batch INSERTs.
- **Batch 3 + final acceptance:** <15 minutes.

**Total:** ~3 focused hours. Block the time, do not interleave with feature work — the cleanup is most safely done as a single linear pass with the snapshot table as the bail-out.

---

## What this plan deliberately does NOT do

- Doesn't apply any migration, INSERT any tracking row, or rename any file. Execution is a separate PR after this plan is reviewed.
- Doesn't touch the `automatic_payment_management.sql` edge case beyond flagging it.
- Doesn't address the file `supabase/migrations/archive/` subdirectory (if any) or other non-`*.sql` files in the migrations folder.
- Doesn't propose backfilling `statements` / `created_by` columns on the new INSERTs. They can stay NULL; the schema only requires `version`.

---

## Appendix A — Full file list: 50 orphan-prefix files

Grouped by prefix. Each line is a file that needs Tactic 1/2/3 verification then INSERT (or delete).

### Prefix `20251023` — 26 files (commission/payment override system)

```
20251023_add_payment_amount_override.sql
20251023_auto_archive_lost_deal_payments.sql
20251023_cleanup_duplicate_payment_splits.sql
20251023_cleanup_lost_deal_payments.sql
20251023_cleanup_lost_deal_payments_round2.sql
20251023_create_override_payment_function.sql
20251023_drop_payment_split_triggers.sql
20251023_drop_protection_trigger.sql
20251023_fix_agci_and_splits_proportional_override.sql
20251023_fix_agci_calculation_subtract_fees.sql
20251023_fix_all_ambiguous_references.sql
20251023_fix_ambiguous_column_reference.sql
20251023_fix_automatic_payment_management.sql
20251023_fix_calculate_triggers_respect_override.sql
20251023_fix_existing_splits_data.sql
20251023_fix_payment_override_complete.sql
20251023_fix_payment_override_direct_calculation.sql
20251023_fix_record_assignment.sql
20251023_fix_splits_based_on_agci.sql
20251023_fix_splits_based_on_agci_v2.sql
20251023_fix_splits_correct_formula.sql
20251023_force_agci_calculation_in_update.sql
20251023_recalculate_existing_overrides.sql
20251023_simple_agci_fix.sql
20251023_sync_closed_paid_payments_to_salesforce.sql
20251023_update_triggers_respect_override.sql
```

### Prefix `20251024` — 1 file

```
20251024_complete_payment_auto_sync.sql
```

### Prefix `20251105` — 4 files (restaurant tables + Salesforce import)

```
20251105_add_source_year_to_locations.sql
20251105_create_restaurant_tables.sql
20251105_import_salesforce_verified_coords.sql
20251105_optimize_restaurant_queries.sql
```

### Prefix `20260302` — 4 files (payment date auto-calc + deal forecasting)

```
20260302_auto_calculate_payment_dates.sql
20260302_cleanup_lost_deal_payments_round3.sql
20260302_deal_forecasting_system.sql
20260302_fix_payment_estimates.sql
```

### Prefixes `20260422`–`20260427` — 7 files (merchants layer, portal email alerts, point layer)

```
20260422_merchants_map_layer_tables.sql
20260423_merchants_seed_brands.sql
20260424_merchants_brandfetch_domain_corrections.sql
20260425_merchants_logo_variant.sql
20260425_portal_email_alerts_cron.sql
20260425_portal_email_alerts_schema.sql
20260425_portal_email_alerts_triggers.sql
20260427_point_layer_support.sql
```

### Prefixes `20260501000000`–`20260504000003` — 7 files (task system v2 + streetlight initial schema)

```
20260501000000_task_system_v2_schema_phase1.sql
20260502000000_task_system_v2_timeline_post_check.sql
20260502010000_task_system_v2_backfill_v1.sql
20260503000000_streetlight_tables.sql
20260504000001_streetlight_atomic_spend.sql
20260504000002_streetlight_schema_fix.sql
20260504000003_streetlight_segment_id_bigint.sql
```

---

## Appendix B — Full file list: 33 shadow-duplicate files

Each line shows what IS tracked under the same prefix, so you can spot whether this file is the same migration under a different name or a sibling that needs its own row.

```
20251022_fix_payment_splits_on_number_change.sql       (prefix tracked as: add_payment_soft_delete)
20251103220000_fix_property_constraints.sql            (prefix tracked as: add_property_cascade_deletes)
20251106_enable_realtime_deal.sql                      (prefix tracked as: add_timeline_sync_to_critical_dates)
20251114_add_email_tracking_to_site_submit.sql         (prefix tracked as: add_dropbox_mapping_rls)
20251205_create_prospecting_target.sql                 (prefix tracked as: add_team_users)
20251205_fix_prospecting_target_view_security.sql      (prefix tracked as: add_team_users)
20251205_fix_security_warnings.sql                     (prefix tracked as: add_team_users)
20251208_create_quickbooks_tables.sql                  (prefix tracked as: add_qbo_invoice_number_and_bill_to_fields)
20251210_add_broker_user_fk.sql                        (prefix tracked as: add_bill_to_cc_bcc_emails)
20251211_gmail_gemini_integration.sql                  (prefix tracked as: email_agent_phase1)
20251230_enable_ai_correction_log_rls.sql              (prefix tracked as: create_qb_account_table)
20251231_add_qb_item_table.sql                         (prefix tracked as: add_expense_recategorization)
20260112_email_activity_visibility.sql                 (prefix tracked as: activity_email_visibility)
20260112_email_object_link_permissions.sql             (prefix tracked as: activity_email_visibility)
20260112_email_shared_visibility.sql                   (prefix tracked as: activity_email_visibility)
20260130_client_portal_rls_v2.sql                      (prefix tracked as: client_portal_rls)
20260130_client_portal_rls_v3.sql                      (prefix tracked as: client_portal_rls)
20260130_client_portal_schema.sql                      (prefix tracked as: client_portal_rls)
20260131_sync_auth_user_id.sql                         (prefix tracked as: portal_invite_accept_function)
20260201_custom_map_layers_rls_fix.sql                 (prefix tracked as: custom_map_layers)
20260201_portal_file_visibility.sql                    (prefix tracked as: custom_map_layers)
20260202_create_assets_storage_bucket.sql              (prefix tracked as: add_stroke_color_to_shapes)
20260202_enable_realtime_map_layer_shape.sql           (prefix tracked as: add_stroke_color_to_shapes)
20260204_portal_email_template_settings.sql            (prefix tracked as: admin_update_user_function)
20260205_fix_portal_invite_token_lookup.sql            (prefix tracked as: cleanup_orphaned_identities)
20260217_create_daily_metrics_view.sql                 (prefix tracked as: add_hidden_from_timeline)
20260220_portal_dropbox_mapping_access.sql             (prefix tracked as: fix_email_signature_rls)
20260221_property_activity_timeline.sql                (prefix tracked as: add_deal_property_fields)
20260226_google_places_search.sql                      (prefix tracked as: b_fix_google_places_rls)
20260320_esri_geoenrichment.sql                        (prefix tracked as: esri_data_vintage)
20260320_esri_geoenrichment_v2.sql                     (prefix tracked as: esri_data_vintage)
20260320_esri_geoenrichment_v3.sql                     (prefix tracked as: esri_data_vintage)
20260320_esri_geoenrichment_v4.sql                     (prefix tracked as: esri_data_vintage)
```
