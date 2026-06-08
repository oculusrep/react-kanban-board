# Market Research Agent — Phase E: Approval Modal + Promotion RPCs

**Branch:** `feature/market-research-agent`
**Companion docs:** [`MARKET_RESEARCH_AGENT_V1_PLAN.md`](MARKET_RESEARCH_AGENT_V1_PLAN.md) Phase E + decision #10

Phase E ships the Approve & Commit workflow: a modal that lists the staged records from a research_run, lets the user edit fields inline, reject rows, and atomically promote selected rows into `municipal_project` — with the auto-create-`municipality` logic from decision #10.

---

## What this phase adds

| File | Purpose |
|---|---|
| `supabase/migrations/20260608120000_market_research_approval_rpcs.sql` | Two SECURITY DEFINER RPCs: `approve_research_staging_rows`, `reject_research_staging_row`. Both check `ovis_role` inside the function; granted to `authenticated`. |
| `src/components/shared/ResearchRunApprovalModal.tsx` | Approval modal: header + collapsible checklist + staged-records-by-municipality (with inline editing, reject buttons, "MATCHES EXISTING" badges) + editable needs_review + bulk approve footer. |
| `src/components/shared/PastResearchRunsPanel.tsx` (edited) | Rows are now clickable; `onRunClick` prop opens the approval modal. |
| `src/components/shared/SiteSubmitSidebar.tsx` (edited) | Imports and renders the approval modal; toast on successful approve summarizes counts. |

No new edge function. The browser calls the RPCs directly via `supabase.rpc(...)`. Role check happens inside each RPC (`auth.uid()` → `user.ovis_role` lookup).

---

## RPC contracts

### `approve_research_staging_rows(p_rows jsonb) → jsonb`

Promotes one or more staging rows from a single research_run into `municipal_project`. Idempotent on already-resolved rows (already approved/rejected → silently skipped).

**Input** — array of items:
```json
[
  {
    "staging_id": "uuid",                  // required
    "project_name": "Winder Crossing",     // all other fields are optional;
    "address": "100 Maple St",             // omitting any field falls back to
    "total_housing_units": 50,             // the staging row's stored value
    "builder_developer": "ABC Homes",
    "permit_url": "https://...",
    "permit_application_date": "2026-03-15",
    "source": "Citizens Portal permit #123",
    "notes": "Edited during approval",
    "phase_label": "Phase I",
    "single_family_lots": null,
    "townhouse_units": null,
    "duplex_units": null,
    "apt_units": null,
    "cottage_units": null,
    "zoning": "R-1",
    "zoning_approval_date": "2026-02-01"
  }
]
```

**What happens per row:**
1. Role gate: `auth.uid()`'s `ovis_role` must be `admin` or `broker`, else `EXCEPTION 'forbidden'`.
2. Look up staging row. If `approval_state <> 'pending'`, skip (idempotent).
3. All rows must belong to the same `research_run_id` (else `EXCEPTION`).
4. **Resolve municipality_id (decision #10):**
   - If staging row has `municipality_id`, use it.
   - Else look up `municipality` by `lower(btrim(name)) = lower(btrim(boundary_municipality.name))` + matching `state`.
   - If no match, **INSERT a new `municipality`** with `name = boundary_municipality.name` (verbatim — already follows OVIS convention: counties "Barrow County", cities "Winder") and `state = boundary_municipality.state`.
   - Backfill `staging.municipality_id`.
5. INSERT into `municipal_project` with per-row edits overriding staging values where supplied. `source_research_run_id` is set to the run's id (provenance).
6. UPDATE staging row: `approval_state='approved'`, `approved_at=now()`, `approved_municipal_project_id=<new id>`.
7. After all rows: UPDATE `research_run.state='approved'`, `completed_at = COALESCE(completed_at, now())`.

**Output:**
```json
{
  "approved_count": 7,
  "created_municipality_count": 2,
  "research_run_id": "uuid"
}
```

### `reject_research_staging_row(p_staging_id uuid) → jsonb`

Marks a single staging row `approval_state='rejected'`. Kept forever for audit. Idempotent (already-rejected → returns `{ rejected: false }`).

Role gate same as approve: admin or broker only.

---

## Apply

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -f supabase/migrations/20260608120000_market_research_approval_rpcs.sql
psql "$DATABASE_URL" \
  -c "INSERT INTO supabase_migrations.schema_migrations (version, name)
      VALUES ('20260608120000','market_research_approval_rpcs');"
```

Applied + recorded on 2026-06-08.

---

## Smoke test (2026-06-08)

Seeded a fake research_run with two staging rows (one in Winder = existing OVIS muni, one in Bethlehem = no OVIS muni yet). Impersonated an admin user via `set_config('request.jwt.claims', ...)`. Called `reject_research_staging_row` on row #1, then `approve_research_staging_rows` on row #2 with per-row field edits.

| Assertion | Expected | Got |
|---|---|---|
| `reject_research_staging_row` returns `{ rejected: true }` | ✓ | ✓ |
| Rejected staging row.approval_state | `rejected` | ✓ |
| `approve_research_staging_rows` returns `approved_count=1, created_municipality_count=1` | ✓ | ✓ |
| Staging row backlink → municipal_project | non-null | ✓ |
| Bethlehem auto-created in `municipality` | non-null | ✓ (name="Bethlehem", state="GA") |
| `research_run.state` | `approved` | ✓ |
| Promoted `municipal_project.project_name` | `"Auto-Create Test (edited)"` (edit override applied) | ✓ |
| Promoted `municipal_project.total_housing_units` | `95` (edited from staging's 80) | ✓ |
| Promoted `municipal_project.source` | `"smoke-approve-v2"` (from staging, unedited) | ✓ |
| Promoted `municipal_project.notes` | `"Edited during approval"` (edit override) | ✓ |
| `municipal_project.source_research_run_id` matches the run | ✓ | ✓ |
| `municipal_project.municipality_id` matches the auto-created Bethlehem id | ✓ | ✓ |

Test data cleaned up; zero leftovers.

---

## Approval modal UI design

**Overall shape:** a centered modal (max-width 4xl). CLAUDE.md's overlay-first principle is honored — the modal IS the overlay; future polish can convert to a true slide-out without changing the RPC contract.

**Sections (top to bottom):**

1. **Header** — site name, run state badge, radius, counts (pending / approved / rejected). Close (✕).
2. **Per-municipality checklist** — collapsible, expanded by default = false. Distance-ordered list with status + agent notes.
3. **Bulk controls** — "Selected: N / pending" with `Select all NEW` / `Select all pending` / `Deselect all` links.
4. **Staged records, grouped by municipality** — one card per municipality, rows within each. Each row has:
   - Checkbox (default: selected if pending AND no `matched_existing_id`)
   - "MATCHES EXISTING" badge (terracotta border) if `matched_existing_id IS NOT NULL`
   - "APPROVED" / "REJECTED" pill badges based on state
   - 2-column grid of editable fields: project_name, address, total_housing_units, builder_developer, permit_url, permit_application_date, source, notes
   - Reject button (terracotta border) on the right — calls `reject_research_staging_row` immediately
5. **Needs review** — editable textarea bound to `research_run.needs_review`. Alt avenues shown read-only below (set by the agent).
6. **Footer** — Cancel + "Approve & Commit (N)" button. Disabled if N=0.

**Read-only mode:** when the run is already `approved` or `archived`, all controls disable; the modal acts as a viewer.

**Brand palette:** Deep Midnight Blue (`#002147`) for primary action + selected state; Steel Blue (`#4A6B94`) for secondary text; Light Slate Blue (`#8FA9C8`) for borders + inactive; Terracotta (`#A27B5C`) for warning / matches-existing / reject. Pure White surfaces; off-white `#F8FAFC` for section headers.

---

## Design decisions locked in

### Per-row reject is immediate (no batching, no undo)
Rejection is a single supabase-js RPC call per row. No "undo" affordance in v1 — rejected rows are kept forever (`approval_state='rejected'`) for audit but can't be un-rejected from the UI. If a user reaches "I should have approved that," the easy path is to re-run research; the hard path is direct SQL.

### Approve & Commit is a single batched RPC call
All selected rows + their per-row edits go in one `approve_research_staging_rows` call. One transaction, atomic. If any row fails, the whole batch fails — caller sees the error toast, can retry.

### Edit fallbacks: per-row edits override; unedited fields use staging values
The RPC `COALESCE`s every editable field with the staging row's value. The UI sends only fields the user actually changed (using `undefined` checks in the payload builder). This keeps the payload small and makes "didn't edit X" semantics explicit.

### "MATCHES EXISTING" rows are de-selected by default
The default-select set is `pending AND NOT matched_existing_id`. Reasoning: agent-found-but-already-known records are usually re-discoveries; the burden of proof should be on the user to opt them in. Bulk "Select all pending" covers the "I want to re-approve these as fresh inserts" case.

### needs_review edit doesn't go through an RPC (yet)
The UI does a direct `.from('research_run').update({ needs_review })` and warns if it fails (RLS will block it for non-service-role today — the read-only RLS is intentional per Phase B). The Approve & Commit RPC doesn't touch `needs_review`. Two implications:
- For now, edits to `needs_review` may silently no-op for end users. The change is local-only.
- Phase F (or a small follow-up) can add `update_research_run_narrative(run_id, needs_review, alt_avenues)` RPC, role-gated, to make this actually persist.

This is called out as a known limitation rather than fixed in Phase E because the data model already preserves the agent's original `needs_review` and the UI shows it correctly read-only-ish; the edit affordance is a polish layer.

### Auto-create-municipality uses `boundary_municipality.name` verbatim
The naming convention you locked in ("Barrow County" for counties, "Winder" for cities) is already what's in `boundary_municipality.name` after Phase A backfill. No transformation needed at promote time. If someone ever renames a `municipality` row to a different form (e.g. someone adds "Hoschton, GA"), the case-insensitive match here won't find it and a duplicate row gets created — flagged as an edge case.

### Role check inside the RPC, not via an edge function
Two options were viable: (a) browser → RPC with internal role check, (b) browser → edge function with role check → RPC with service_role. We went with (a) because:
- Fewer moving parts (one fewer deploy target, one less roundtrip).
- The role check uses the same `auth.uid()` source of truth that RLS would.
- Future scalability concern (cron-driven or external triggers) is not yet a requirement.

If we ever need scheduled or programmatic approvals (e.g. "auto-approve all NEW records older than N days"), an edge function can call the same RPC with elevated identity — same RPC contract.

---

## Defaulted without asking (flag in PR review)

- **Modal style, not slideout.** Per the V1 plan we intended a slideout per CLAUDE.md overlay-first. Building a proper right-side slideout that survives nested overlays (the sidebar is already a slideout) is more complex; a modal works without conflict. Future polish: convert to a stacked slideout.
- **Add-row affordance:** out of scope. The approval modal lists agent-found records only; "user adds a row I missed" goes in `needs_review` free-text per V1 plan defaults.
- **No diff against existing `municipal_project` for MATCHES EXISTING rows.** We show the badge but not a field-by-field "old vs new" diff. Phase E.1 could fetch the matched record and surface per-field overrides.
- **Auto-refresh of past-runs panel on close:** the panel re-fetches via `refreshTrigger` bump on approve success. If a run is approved AND new staging arrives concurrently (shouldn't happen since the agent submits once), the panel may miss the late insert until next refresh.
- **The needs_review edit caveat above.** Documented as a known limitation rather than implementing a third RPC in this phase.
- **Modal sizing on small screens:** the modal is `max-w-4xl`, which is too wide for tablet portrait. Mobile responsiveness deferred — admin/broker workflows are desktop-driven today.

---

## What this phase deliberately does NOT do

- No promotion polish (per-field diff vs. matched existing, undo, bulk reject by checkbox set).
- No `needs_review` update RPC (UI tries direct UPDATE, warns on failure).
- No automatic state transitions for stuck runs (Phase F + cron).
- No "open approval directly from a notification" deep-link.
- No analytics or per-approval audit log beyond what `municipal_project_staging.approved_at` + the `research_run` row carry.

---

## Phase E is the final OVIS-side phase before Phase F (OpenClaw wiring)

With Phase E live, every loop step has OVIS-side code:

```
Click Start Research  →  ovis-research-trigger      [Phase D]
                          ↓ POSTs to OpenClaw
OpenClaw runs research →  calls ovis-research-mcp tools [Phase C]
                          ↓ writes staging via SECURITY DEFINER RPCs
User reviews + approves → ResearchRunApprovalModal  [Phase E]
                          ↓ promotes to municipal_project
Promoted records appear  on the existing map layer  [Phase B ALTERs]
```

**Phase F is the final wire-up step:** set `OPENCLAW_TRIGGER_URL` + `OPENCLAW_TRIGGER_TOKEN` Supabase secrets, share `OVIS_MCP_BEARER_TOKEN` + `OVIS_MCP_URL` with the OpenClaw operator, and run a real end-to-end test against a Starbucks site_submit in Winder, GA.
