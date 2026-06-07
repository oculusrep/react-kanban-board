# Market Research Agent — Phase B: Research Run + Staging Schema

**Branch:** `feature/market-research-agent`
**Companion docs:** [`MARKET_RESEARCH_AGENT_V1_PLAN.md`](MARKET_RESEARCH_AGENT_V1_PLAN.md) (Phase B), [`MARKET_RESEARCH_AGENT_PHASE_A.md`](MARKET_RESEARCH_AGENT_PHASE_A.md)

Phase B lays down the four-table data model the agent and the approval UI will write against. No app code yet — the MCP edge function (Phase C) and the approval UI (Phase E) are the consumers.

---

## What this phase adds

| File | Purpose |
|---|---|
| `supabase/migrations/20260606130000_create_research_run_staging.sql` | 3 new tables + 5 new columns on `municipal_project` + RLS + indexes |

No TypeScript or UI changes.

### New tables

| Table | Purpose | Cardinality per site_submit |
|---|---|---|
| `research_run` | One row per "Start Research" click; lifecycle state for the whole run | N over time (re-research is allowed) |
| `research_checklist_item` | One row per municipality on a run; status tracking | typ. 5–25 per run |
| `municipal_project_staging` | Agent-discovered records pending review; mirror of `municipal_project` + agent fields + approval workflow | 0–50+ per run |

### New columns on `municipal_project`

- `source` (text, nullable) — free-text provenance ("Citizens Portal permit #X", "Winder CSV April 2026")
- `builder_developer` (text, nullable)
- `permit_url` (text, nullable)
- `permit_application_date` (date, nullable)
- `source_research_run_id` (uuid, FK → `research_run.id`, nullable) — provenance for agent-promoted rows. Importer rows leave this NULL.

All five are nullable so existing importer-sourced rows are unaffected. Partial index `municipal_project_source_run_idx` so agent-vs-importer filtering is cheap.

---

## Apply the migration

`supabase db push` is still blocked by the pre-May untracked-files backlog (see [`MIGRATION_HISTORY_CLEANUP_PLAN.md`](MIGRATION_HISTORY_CLEANUP_PLAN.md) on the `chore/migration-history-cleanup-plan` branch). Until that cleanup runs, apply via psql:

```bash
set -a; source .env; set +a
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260606130000_create_research_run_staging.sql

psql "$DATABASE_URL" \
  -c "INSERT INTO supabase_migrations.schema_migrations (version, name)
      VALUES ('20260606130000','create_research_run_staging');"
```

Applied + recorded on 2026-06-06.

---

## Acceptance — all five gates passed on 2026-06-06

```sql
-- 1. Three new tables exist
SELECT table_name FROM information_schema.tables
 WHERE table_schema='public'
   AND table_name IN ('research_run','research_checklist_item','municipal_project_staging');
-- → 3 rows

-- 2. Five new columns on municipal_project
SELECT column_name FROM information_schema.columns
 WHERE table_schema='public' AND table_name='municipal_project'
   AND column_name IN ('source','builder_developer','permit_url','permit_application_date','source_research_run_id');
-- → 5 rows

-- 3. RLS enabled + read-only policies present
SELECT c.relname, c.relrowsecurity,
       (SELECT array_agg(polname) FROM pg_policy WHERE polrelid=c.oid) AS policies
  FROM pg_class c
 WHERE c.oid IN ('public.research_run'::regclass,
                 'public.research_checklist_item'::regclass,
                 'public.municipal_project_staging'::regclass);
-- → 3 rows, rls_enabled=true, one read policy each

-- 4. End-to-end smoke test (full insert path + cascade delete) — see migration file for the DO $$ block

-- 5. FK / constraint integrity
\d public.research_run
\d public.research_checklist_item
\d public.municipal_project_staging
-- inspect by eye: site_submit FK, boundary_municipality FK, project_stage FK,
-- municipality FK, municipal_project FK all wired; CHECK constraints on state,
-- approval_state, radius_miles all present.
```

---

## Design decisions (locked in)

### RLS shape: read = authenticated, no user-writes
All authenticated OVIS users can READ research_run / checklist / staging rows (internal-only data, not customer-facing). **No INSERT/UPDATE/DELETE policies are exposed to authenticated users.** Two reasons:

1. The MCP edge function (Phase C) is the only writer of staged data, and it uses `SUPABASE_SERVICE_ROLE_KEY` which bypasses RLS automatically.
2. The Approve & Commit action (Phase E) will be implemented as a SECURITY DEFINER RPC that atomically promotes a staging row → `municipal_project` AND updates `staging.approval_state`. RPCs run with elevated privilege; users don't need direct DML rights.

This keeps RLS simple and prevents accidental mutation of staged data from the frontend.

### Re-research model: each click = new `research_run` row
Per V1 plan decision #5. Stale runs aren't deleted — they're left in state='archived' (when superseded) or 'failed' (when something went wrong). Audit trail by design.

### Lifecycle states
`pending → running → awaiting_review → approved | archived | failed`
- `pending`: row exists, OpenClaw hasn't acked
- `running`: agent is working
- `awaiting_review`: `submit_research_report` landed; UI shows for approval
- `approved`: Mike clicked Approve & Commit
- `archived`: superseded by a later run
- `failed`: agent error path

`completed_at` is set when state moves out of `running` (either to awaiting_review or failed).

### Staging row state vs run state
A row in `municipal_project_staging` has its own `approval_state` (pending / approved / rejected) that's INDEPENDENT of `research_run.state`. Mike can approve some rows and reject others on the same run. `research_run.state` flips to 'approved' when Mike clicks the final "Approve & Commit" button (signalling "I'm done reviewing this run"), regardless of how many individual rows were approved vs rejected.

### Dup detection happens server-side at submit time
The MCP `submit_research_report` tool (Phase C) populates `matched_existing_id` by querying `municipal_project` for normalized `(municipality_id, project_name, address)` matches. The agent never has to know about existing rows. The approval UI shows a "MATCHES EXISTING" badge so Mike can decide skip / overwrite / merge per-row.

### Indexes
- `research_run_site_idx (site_submit_id, triggered_at DESC)` — site_submit sidebar "past runs" list query
- `research_run_state_idx (state) WHERE state IN ('pending','running','awaiting_review')` — partial; for the rare "what's in-flight or waiting on me" dashboard query
- `research_checklist_item_run_priority_idx (research_run_id, priority)` — render checklist in distance order
- `municipal_project_staging_run_idx (research_run_id)` — approval UI "rows for this run"
- `municipal_project_staging_state_idx (approval_state)` — secondary filter
- `municipal_project_staging_matched_idx (matched_existing_id)` — "what got merged with existing"
- `municipal_project_source_run_idx (source_research_run_id) WHERE NOT NULL` — partial; "rows the agent found"

---

## Defaulted without asking (flag in PR review)

- **`radius_miles` CHECK constraint** is `BETWEEN 1 AND 50`. Spec text says 10mi; per-run override discussion landed on 3/5/10/15mi presets. The CHECK is generous so a future "expanded radius" experiment can use up to 50mi without a schema change.
- **`research_run.state` value `archived`** isn't in the V1 plan's state list explicitly — added for "this run is superseded by a newer one." Use case: re-running research on the same site_submit; the older awaiting_review run shouldn't sit forever pretending to need attention.
- **`research_run.state` value `failed`** added for the agent error path. Not enumerated in the V1 plan but obvious to need.
- **Cascade behavior on `research_run` delete** — children (`research_checklist_item`, `municipal_project_staging`) are `ON DELETE CASCADE`. If the user ever wants to hard-delete a run (e.g. accidentally triggered, never resolved), it cleans up its dependents in one shot. `municipal_project.source_research_run_id` is NOT cascaded — promoted rows survive the delete with their pointer set to a now-missing run. That's intentional (don't destroy promoted records when their source run is purged).
- **`research_checklist_item.notes`** — added as text column so the agent can record per-municipality color ("used builder forum instead of Citizens Portal because portal was down", "open records office said 4-week turnaround"). §4 mentions the agent should note alternative avenues; this is where they land.
- **`municipal_project_staging.raw_stages`** mirrors the importer's column shape (`jsonb DEFAULT '{}'`). Lets the agent surface arbitrary per-municipality stage data without schema changes.

---

## What this phase deliberately does NOT do

- No SECURITY DEFINER RPCs for the MCP tools — that's Phase C.
- No promotion RPC (`approve_research_staging_row` etc.) — that's Phase E.
- No app-side TypeScript types — those land when there's actually a UI/edge-function consumer.
- No seeding of `project_stage` rows for the agent's new statuses — V1 plan §3 calls for reusing the existing `project_stage` table; we'll seed any missing canonical stages just-in-time during Phase C if needed.
- No dup-detection function. That logic lives inside `submit_research_report` (Phase C) so it can be tuned without a migration.

---

## Open items still to resolve in Phase C

1. **Where the MCP edge function uses `pg_trgm` for fuzzy dup detection.** The simple normalized exact-match approach (`lower(trim(project_name))` + `lower(trim(address))`) catches obvious dups but not "Winder Crossing" vs "Winder Crossing Subdivision Phase 1." Decision: ship Phase C with exact match; add `pg_trgm` similarity as a Phase C.1 if real-world matches show false negatives.
2. **OpenClaw correlation lifecycle.** `openclaw_run_id` is a text field — does OpenClaw return a UUID, a sequence, or a free-form ID? Punt until Phase F wiring.
3. **What happens to `pending`/`running` runs if OpenClaw never responds.** Phase C should include a cleanup job or a UI-level "this run has been stuck for N hours — mark failed?" affordance. Deferred to Phase F.
