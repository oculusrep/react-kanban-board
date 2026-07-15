# Market Research — Dedupe Safety Net

Branch: `feature/research-dedupe-safety-net`

## Problem

Even with a windowed lookback, P&Z records and news bleed across date and
jurisdiction boundaries. A "deep follow-up" run reaching further back in time
will sometimes surface a project a prior run already staged/committed. Before
this change the staging → approval flow had one dedupe probe (see below) with
real gaps, so the reviewer risked either re-committing a duplicate or manually
eyeballing every candidate against the map.

## What already existed (before this branch)

- **Submit-time hard match** — `submit_research_report` set
  `municipal_project_staging.matched_existing_id` when a candidate's normalized
  `(project_name, address)` matched a committed `municipal_project` **in the same
  resolved municipality**.
- **Review UI** — `ResearchRunApprovalModal` shows a solid **"MATCHES EXISTING"**
  badge on those rows and excludes them from the default selection.
- **Approve-time fold-in** — `approve_research_staging_rows` catches anything that
  slips through via the `UNIQUE (municipality_id, address, project_name,
  phase_label)` constraint (`ON CONFLICT`).

**The gaps:** the hard match is exact-normalized AND municipality-scoped, so it
misses (a) the same project under a slightly different name/address, and (b) the
same project committed under a different municipality (annexation / city vs
unincorporated) — exactly the cross-boundary bleed case.

## What this branch adds

### 1. `permit_url` hard match (municipality-agnostic)

Migration: `20260715173138_submit_research_report_permit_url_match.sql`

`matched_existing_id` is now `COALESCE(permit_url_probe, name_address_probe)`.
`permit_url` is effectively a globally-unique identifier (a link to a specific
permit/application record), so it is matched **without** the municipality scope —
catching the annexation-bleed case the name/address probe cannot. Near-zero
false positives. The original name/address probe is retained verbatim as the
fallback for candidates that have no `permit_url`.

Everything else in `submit_research_report` (off-checklist guard,
idempotency/replace-on-resubmit, defensive casts) is carried forward unchanged.

### 2. Soft proximity signal (centroid within ~150m)

Migration: `20260715173150_find_nearby_municipal_projects_rpc.sql`
Function: `find_nearby_municipal_projects(p_points jsonb, p_radius_meters numeric)`

Read-only, additive, no writes. Takes `[{staging_id, lat, lng}, ...]` and returns
committed `municipal_project` rows whose indexed `centroid` is within the radius
(default 150m), **ignoring municipality**. This is the cheapest strong
same-project signal that survives a different name AND a different address with no
shared `permit_url`. It is deliberately **soft** — surfaced for the reviewer,
never auto-rejected — because dense areas can host genuinely distinct nearby
projects (we chose proximity over name-trigram precisely to avoid the noise of
"Truitt Preserve" vs "Truitt Townhomes" false positives).

### 3. Review UI

`ResearchRunApprovalModal.tsx`:

- On load, a non-blocking effect geocodes each **pending, not-yet-hard-matched**
  row (address present) and calls the RPC. Failures are swallowed with a
  `console.warn` — the dup check can never break approval.
- Rows with a nearby committed project get a dashed **"⚠ POSSIBLE DUPLICATE ·
  ~Nm"** chip (visually distinct from the solid "MATCHES EXISTING" badge). The
  chip `title` lists each nearby project's name, distance, municipality, and
  address so the reviewer can judge without leaving the modal.
- The bulk-controls summary shows a "checking for nearby projects…" indicator and
  an "N possible duplicates nearby" count.
- **Possible-dup rows stay selected by default** (unlike hard matches, which are
  deselected). A ~150m proximity hit is a flag to act on, not a decision — we
  don't want to silently drop a genuinely new project.

## Design notes / tradeoffs

- **Why geocode at review-load rather than persist coords on staging?** Candidates
  aren't geocoded until approval in the normal flow. Rather than add lat/lng
  columns + a write-RPC + refactor the approve path (persist-once, reuse), v1
  keeps this a pure read: geocode the handful of unmatched pending rows at load
  and pass points into the RPC. Cost is a few Google geocodes per modal open. If
  that latency/cost proves annoying, the upgrade is to persist the geocode on
  `municipal_project_staging` and have both the dup check and approve reuse it.
- **Radius** is a parameter (default 150m); tune in the RPC call site if dense
  suburban parcels produce false positives.

## Applying

Migrations are file-only on this branch — not yet pushed to the remote DB. Apply
with `supabase db push` (or the psql fallback) once the branch is validated /
merged. No changes to the submit or approve write paths beyond the
`matched_existing_id` computation, so the new RPC and the permit_url probe can be
applied independently.

## Production apply & rollback

Both migrations are **additive and non-destructive** — no `ALTER TABLE`, no
`UPDATE`/`DELETE`, no dropped columns, no constraint changes, no touch to the
commit path (`approve_research_staging_rows`). Migration A is a `CREATE OR
REPLACE` of `submit_research_report` whose ONLY delta vs the currently-deployed
20260714140000 definition is wrapping `matched_existing_id` in
`COALESCE(permit_url_probe, name_address_probe)` — verified line-for-line
identical everywhere else (all guards, casts, INSERT column list preserved).
Migration B is a brand-new function with no caller until the UI ships, so it is
inert on the DB until then. Both use `CREATE OR REPLACE`, so re-running is safe.

### Rollback

**Migration B** (`find_nearby_municipal_projects`) — drop it:
```sql
DROP FUNCTION IF EXISTS public.find_nearby_municipal_projects(jsonb, numeric);
```

**Migration A** (`submit_research_report` permit_url match) — restore the prior
definition by re-applying the *exact* pre-change body, which is the committed
file `supabase/migrations/20260714140000_submit_research_report_idempotent.sql`.
It's a `CREATE OR REPLACE` with the same signature, so re-running it reverts
`matched_existing_id` to the name/address-only probe. No data is touched — rows
already staged keep whatever `matched_existing_id` they were assigned; only the
computation for *future* submits changes back.
```sql
-- Paste the full body of 20260714140000_submit_research_report_idempotent.sql,
-- or dump it from the repo:
--   git show HEAD:supabase/migrations/20260714140000_submit_research_report_idempotent.sql
```
Neither rollback affects `municipal_project`, `municipal_project_staging`, or any
existing row.

## Not in this branch

Run depth tiers / lookback windowing + per-municipality "researched back to"
coverage is the second, separately-sequenced piece — tracked apart from this
dedupe work.
