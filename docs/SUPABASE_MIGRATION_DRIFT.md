# Supabase migration history drift — diagnosis and options

**Status as of 2026-09-01: Option 2 applied (bookkeeping half reconciled). `db push` still blocked. See [Where this stands](#where-this-stands).**

> ## ⚠️ Current procedure: `supabase db push` DOES NOT WORK
>
> It aborts with *"Remote migration versions not found in local migrations directory"* and suggests a `migration repair` command that **you should not run** (see [Option 1](#option-1-migration-repair---status-reverted--do-not-run)).
>
> **Option 2 did not change this.** It removed the risk of spurious re-application, but the CLI's check is on the *remote-only* side, which is untouched. See [What actually restores `db push`](#what-actually-restores-db-push).
>
> **Until this is resolved, apply migrations with the psql fallback:**
>
> ```bash
> set -a && . ./.env && set +a
> psql "$DATABASE_URL" -v ON_ERROR_STOP=1 --single-transaction \
>   -f supabase/migrations/<version>_<name>.sql
>
> psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -c \
>   "INSERT INTO supabase_migrations.schema_migrations (version, name)
>    VALUES ('<version>','<name>') ON CONFLICT (version) DO NOTHING;"
> ```
>
> **Both steps.** Skipping the second is how one of the drift categories below was created.
>
> `--single-transaction` matters: without it a mid-file failure leaves the schema half-migrated.
>
> The 2026-09-01 migrations (`20260901120000`, `20260901120100`, `20260901140000`, `20260901160000`) and `20260904120000` were applied this way.

---

## Measurements

| | Count |
|---|---:|
| Local `.sql` files | 138 |
| Rows in `supabase_migrations.schema_migrations` | 147 |
| Versions present in both | 107 |
| **Remote-only** (in DB history, no local file) | **40** |
| **Local-only** (file exists, not in DB history) | **31** |

Drift is **bidirectional**, which is what makes the CLI's suggested fix dangerous.

---

## Root cause

Migrations have been applied through **three different paths**, only one of which keeps the bookkeeping straight:

| Path | Records history? | Version stamped |
|---|---|---|
| `supabase db push` | ✅ | the local filename's timestamp |
| Supabase dashboard SQL editor / MCP `apply_migration` | ✅ | **a fresh timestamp of its own** |
| Raw `psql -f` with no INSERT | ❌ | none |

Path 2 is the main culprit. It records the migration under a timestamp that has no relationship to the local file's, so the *same* migration appears twice — once as remote-only, once as local-only. Neither side is wrong; they just don't recognize each other.

---

## What the 40 remote-only rows actually are

Not 40 lost migrations. Three distinct categories:

### A — 30 rows: same migration, different timestamp *(bookkeeping only)*

The content is in the repo. Only the version number differs. Verified examples:

| Name | Remote version | Local file |
|---|---|---|
| `project_stage_line_color` | `20260707210500` | `20260707150000_project_stage_line_color.sql` |
| `submit_research_report_idempotent` | `20260714200254` | `20260714140000_submit_research_report_idempotent.sql` |
| `comp_database_phase1` | `20260726014611` | `20260725180000_comp_database_phase1.sql` |

These 30 are the exact mirror of 30 of the 31 local-only versions. **Nothing is missing.**

### B — 10 rows: Starbucks Deal Board, applied from an unmerged branch

```
deal_activity_state                deal_activity_state_realtime
deal_activity_state_backfill       deal_activity_state_parked
deal_activity_state_seeded_fallback deal_activity_state_urgent
ball_in_court_nullable             blocked_on_restructure
drop_ready_blocker                 site_submit_pass_reason
```

All ten files exist in the `feature/starbucks-deal-board` worktree at `/Users/mike/Documents/GitHub/react-kanban-board-deal-board/supabase/migrations/`. They were applied to the shared production database from that branch, so `main` records the effect but not the file.

**This is the structural issue behind the drift, not just an accident:** one production database is shared across six worktrees/branches. Any branch that applies a migration puts `main` out of sync until it merges.

### C — 1 row: applied but never recorded under any name

`comp_lease_type_values` (`20260824120000_comp_lease_type_values.sql`) appears in **no** remote history row, yet its effect is live — the `lease_comp_lease_type_check` constraint in production reads `('ground_lease','bts_nnn','bts_nn','multi_tenant')`, exactly what that file sets. Applied via raw psql with the INSERT step skipped.

### The bottom line

**Every local migration's content is applied in production. Nothing is unapplied, and nothing is lost.** This is purely a bookkeeping problem. That is the single most important input to choosing an option below.

---

## Options

### Option 1 — `migration repair --status reverted` ❌ DO NOT RUN

What the CLI suggests: mark all 40 remote-only versions as reverted, removing them from the history table.

**Cost: potentially destructive.** With those rows gone, the next `db push` would try to apply all 31 local-only files against a database that **already has their effects**. Outcomes range from harmless to data-corrupting:

- Non-idempotent DDL (`ADD COLUMN` without `IF NOT EXISTS`, `CREATE TYPE`) → hard failure mid-push, leaving history half-repaired.
- **Data migrations re-running** — `deal_activity_state_backfill` is a backfill. Re-running it against already-backfilled rows is the real danger here, and it is not obviously reversible.

Would require auditing all 31 files for idempotency first. The audit costs more than Option 2 and the downside is worse.

### Option 2 — Reconcile bookkeeping only ✅ RECOMMENDED

Insert the 31 local-only versions into `schema_migrations` as already-applied. Run no SQL. Leave the 40 remote rows in place.

```sql
-- for each local-only version:
INSERT INTO supabase_migrations.schema_migrations (version, name)
VALUES ('<version>','<name>') ON CONFLICT (version) DO NOTHING;
```

- **Cost: low.** Nothing re-runs; zero risk to data.
- **Downside:** ~40 redundant historical rows remain. Harmless in normal operation, but a `db reset` or a new Supabase branch would replay local files in *local-timestamp* order, which is not the order they actually ran. Only matters if we start using branch environments (see [project_supabase_sandbox](#related)).
- **Effort:** ~15 minutes, scriptable.

> **APPLIED 2026-09-01.** 30 rows inserted (147 → 177). Local-only drift went 31 → 0.
>
> **Correction to this option's original write-up:** it was described here as "restores `supabase db push`". **It does not.** Verified with `supabase db push --dry-run` immediately afterward — the CLI still aborts with the same error and the same 40-version repair suggestion. Its precondition is that *every remote version has a local file*; the local-only side that Option 2 fixes is not what it checks.
>
> Option 2 was still worth doing: it eliminates the risk that a future `db push` (once unblocked) re-applies 31 already-applied files, which was the actual hazard. But it is a prerequisite, not the fix.

### Option 3 — Option 2, then delete the 30 duplicate rows

Same as Option 2, then `DELETE` the 30 category-A rows that name-match a local file. Keeps the 10 deal-board rows (legitimately applied; file lives on another branch).

- **Cost: low-medium.** Cleanest end state. Requires diffing each of the 30 pairs to confirm name-match really means same content — spot-checked 3, the other 27 unverified.
- **Recommendation:** do Option 2 first to unblock, then this as follow-up if the redundant rows bother us. Not urgent.

### Option 4 — Squash to a new baseline

`supabase db pull` a single baseline migration reflecting current production, archive the existing files.

- **Cost: high.** Loses granular history, and the deal-board branch's 10 migrations would conflict badly at merge time.
- **Only if** Options 2/3 somehow fail.

---

## Where this stands

| | Before | Now |
|---|---:|---:|
| History rows | 147 | 177 |
| Local-only (file not recorded) | 31 | **0** |
| Remote-only (recorded, no local file) | 40 | 40 |

**Done:** Option 2. **Still open:** the 40 remote-only rows, which are what blocks `db push`.

### Extra finding — a version-number collision

Two different local migrations share the version `20260702210000`:

```
20260702210000_starbucks_target_area_ops_area_filter.sql
20260702210000_merchant_favorite_relax_insert_policy.sql
```

Both contents are applied in production and both are recorded remotely, under their own out-of-band versions (`20260702210346` and `20260702210617`) — so nothing is missing. But the history table can only ever hold one row for `20260702210000`, so the two files are indistinguishable to the CLI.

### Proposed fix — and yes, it can wait for the deal-board merge

**Rename the later of the two, and record its version:**

```bash
git mv supabase/migrations/20260702210000_merchant_favorite_relax_insert_policy.sql \
       supabase/migrations/20260702210001_merchant_favorite_relax_insert_policy.sql

psql "$DATABASE_URL" -c \
  "INSERT INTO supabase_migrations.schema_migrations (version, name)
   VALUES ('20260702210001','merchant_favorite_relax_insert_policy')
   ON CONFLICT (version) DO NOTHING;"
```

Which one to rename is not arbitrary — pick `merchant_favorite_relax_insert_policy`, because production applied it *second* (`…210617` vs `…210346` for the target-area filter). Bumping it to `…210001` preserves the real execution order. Renaming the other one would invert it, and while these two are unrelated, a replay from a fresh baseline should still run in the order production did.

**No SQL re-runs.** Both files' contents are already applied; this is a filename and one history row.

**Risk: low, with one caveat.** A `git mv` rewrites nothing and breaks no reference — nothing in the codebase imports migration files by name. The caveat is that any *other* worktree with this file checked out will see it as a delete-plus-add on its next rebase. Harmless, but it will show up in a diff and should not be mistaken for a lost migration.

#### Can it wait for the deal-board merge? Yes — and it should

Three reasons:

1. **It is causing no harm today.** Both migrations are applied; both are recorded (under out-of-band versions); the collision only means the `…210000` history row is ambiguous about which file it refers to. Nothing reads that row.
2. **It only matters when `db push` works**, and `db push` is blocked by the 40 remote-only rows regardless. Fixing the collision first changes nothing observable.
3. **Path A touches the same rows.** Step 1 of Path A deletes the 30 category-A duplicates — which includes `…210346` and `…210617`, the very rows this collision's two files map to. Doing the rename separately means reasoning about those rows twice.

**Recommendation: fold it into Path A as a step 0**, at deal-board merge time. Bundle it with the rename, the 30 deletions, and the deal-board reconciliation in one reviewed change, rather than three separate touches of the history table.

The one thing that would change this: if a *new* migration ever needs the `20260702210000` version specifically, or if someone runs `db reset`/creates a Supabase branch before the merge. Neither is on the horizon.

## What actually restores `db push`

The CLI requires a local file for every remote version. Two ways to get there:

### Path A — delete the 30 duplicate rows, placeholder the 10 *(recommended)*

1. `DELETE` the 30 category-A rows (same migration, different timestamp). Their local counterparts are now recorded, so nothing is lost. Requires diffing each pair to confirm name-match means same content — 3 spot-checked, 27 not.
2. For the 10 deal-board rows, add comment-only placeholder files on `main` named for their remote versions, *or* merge `feature/starbucks-deal-board`.

Cost: medium (the 27-pair diff). End state: clean, `db push` works.

### Path B — placeholder files for all 40

Create 40 comment-only files named for the remote versions. No SQL, no deletes, nothing re-runs — a placeholder is empty precisely because its content already ran.

Cost: low. End state: `db push` works, but 40 inert files clutter the directory permanently and each one is a small lie about what ran.

**Recommendation: Path A**, deferred until the deal-board branch merges, since that merge changes the shape of step 2 anyway. Until then, keep using the psql fallback at the top of this document — it works and is not blocked by any of this.

## Preventing recurrence — one application path

The drift is structural: **one production database is shared by six worktrees**, and three different tools can write the history table with three different versioning behaviors. Reconciling without changing that guarantees a repeat.

**ADOPTED 2026-09-01.** Recorded in `CLAUDE.md` so it binds future sessions, and used for every migration since (`20260901120000` … `20260901160000`).

Single path — **file first, psql apply, explicit record**:

1. Every schema change starts as a file in `supabase/migrations/` with a `date +%Y%m%d%H%M%S` version. No exceptions — not for a one-line fix, not from the dashboard.
2. Apply with `psql -v ON_ERROR_STOP=1 --single-transaction -f <file>`.
3. Record with the explicit `INSERT … ON CONFLICT DO NOTHING` in the same session.
4. **Never** use MCP `apply_migration` or the dashboard SQL editor for anything that changes schema. Both stamp their own version and are the source of all 30 category-A rows. Use them for read-only queries only.
5. Branch worktrees follow the same rule and **note in the PR** which migrations they applied to shared prod, so the merge reconciles knowingly rather than by surprise.

This keeps version numbers under our control and makes history match the files by construction. It does not need `db push` to work — which is why it is worth adopting before, not after, Path A.

The real fix is a non-shared dev database: with a Supabase branch environment, branches would stop writing to production history at all and the root cause disappears. Currently unstarted.

Steps 1–5 are in effect. `CLAUDE.md` is the enforcement point — it is loaded into every session's context, so the rule is visible before anyone writes a migration rather than after.

---

## Drift diff (re-run to check state)

```bash
set -a && . ./.env && set +a
psql "$DATABASE_URL" -t -A -F'|' -c \
  "SELECT version, COALESCE(name,'(null)') FROM supabase_migrations.schema_migrations ORDER BY version;" \
  > /tmp/remote_versions.txt
cut -d'|' -f1 /tmp/remote_versions.txt | sort > /tmp/remote_v.txt
ls supabase/migrations/*.sql | sed 's|.*/||; s|_.*||' | sort > /tmp/local_v.txt

echo "remote-only:"; comm -23 /tmp/remote_v.txt /tmp/local_v.txt | wc -l
echo "local-only:";  comm -13 /tmp/remote_v.txt /tmp/local_v.txt | wc -l
```

Separating "same migration, different timestamp" from genuinely missing content:

```bash
comm -23 /tmp/remote_v.txt /tmp/local_v.txt | while read v; do
  grep "^$v|" /tmp/remote_versions.txt | cut -d'|' -f2
done | sort -u > /tmp/remote_only_names.txt
ls supabase/migrations/*.sql | sed 's|.*/||; s|^[0-9]*_||; s|\.sql$||' | sort -u > /tmp/local_names.txt

echo "=== timestamp mismatch only (content present) ==="
comm -12 /tmp/remote_only_names.txt /tmp/local_names.txt
echo "=== no local file anywhere on this branch ==="
comm -23 /tmp/remote_only_names.txt /tmp/local_names.txt
```

---

## Related

- [MARKET_RESEARCH_DISCOVERY_SOURCE.md](MARKET_RESEARCH_DISCOVERY_SOURCE.md) — the 2026-09-01 migrations applied via the fallback
- Worktrees sharing this production database: `feature/starbucks-deal-board`, `feature/starbucks-loi-tool`, `fix/sbux-atlas-logos-toggle`, `feature/sweep-rerun-gaps`, `worktree-pin-unit-count`
- A Supabase branch/sandbox environment would remove the shared-prod-DB root cause entirely; currently unstarted.
