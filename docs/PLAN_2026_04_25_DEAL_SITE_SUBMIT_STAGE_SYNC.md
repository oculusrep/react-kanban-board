# Deal ↔ Site Submit Stage Sync — Implementation Plan

**Date:** 2026-04-25
**Status:** Plan / pre-implementation (deferred — separate from portal email alerts feature)
**Owner:** Mike

## Background

Today there is no ongoing stage sync between `deal.stage_id` and `site_submit.submit_stage_id`. The two records drift independently after creation. The only existing sync between deal and site submit is `loi_date` (bidirectional, via Postgres triggers in [20260303_sync_loi_date_between_deal_and_site_submit.sql](../supabase/migrations/20260303_sync_loi_date_between_deal_and_site_submit.sql)).

Stages are touched in only one place programmatically: at the moment of conversion in [ConvertToDealModal.tsx:262-291](../src/components/ConvertToDealModal.tsx#L262), which writes `deal.stage_id = "Negotiating LOI"` and `site_submit.submit_stage_id = "LOI"` as a one-time, app-level action. After that, the two stages are independent.

User expectation (from 2026-04-25 conversation): once a site submit reaches LOI, its stage should sync bidirectionally with its corresponding deal — i.e. advancing the deal to `At Lease/PSA` should advance the site submit to the equivalent stage, and vice versa.

## Goal

Keep `deal.stage_id` and `site_submit.submit_stage_id` in sync from LOI onward, in both directions, so a single stage update propagates without the user having to update both records manually.

## Open questions to resolve before building

1. **Scope of sync — which stages?**
   - Only LOI-and-later, as the user stated? (Pre-LOI site submits often don't have a deal yet.)
   - All stages where both records exist?
   - The cleanest answer is probably: "sync only when `site_submit.deal_id` is non-null, regardless of stage." That naturally excludes pre-conversion site submits.

2. **Stage name mapping.** The two tables don't use identical labels:
   - `submit_stage` has `LOI` (and others — list TBD by reading the table).
   - `deal_stage` has `Negotiating LOI`, `At Lease/PSA`, etc.
   - Need an explicit mapping table or columns. Options:
     - **A)** Add a `submit_stage_id` FK column to `deal_stage` (or vice versa) so each row points at its counterpart. Simple but requires both stage tables to stay structurally aligned.
     - **B)** Dedicated `deal_submit_stage_map` table: `(deal_stage_id, submit_stage_id)`. More flexible (allows many-to-one if needed).
     - **C)** Hardcoded mapping in the trigger function. Worst option — drifts when stages are added.
   - Recommend **B**.

3. **Conflict resolution.** What if both records are updated in the same transaction (rare but possible)? Likely a non-issue given how the UI works, but worth thinking through.

4. **Audit trail.** Both tables should already have history tables once the portal-alerts feature lands (`deal_stage_history` exists; `site_submit_stage_history` is being added there). The sync trigger should set the history row's `changed_by` to the user who *originally* moved the stage, not the trigger itself, so the audit trail attributes the propagated change correctly. This matters for the portal email alerts — we don't want the email saying "OVIS changed the stage."

5. **Stages with no counterpart.** Some `submit_stage` values may have no `deal_stage` equivalent (e.g. very early "Pursuing" / "Submitted" stages that exist before a deal is created). Those rows in the mapping table simply won't have a counterpart, and the trigger should no-op for them.

6. **Deals with no site submit.** A small number of deals may not have a linked `site_submit_id` (or be linked to multiple — TBD). The trigger should handle null linkage gracefully.

## Proposed approach

Mirror the `loi_date` sync pattern exactly:

### Schema
```sql
CREATE TABLE deal_submit_stage_map (
  id uuid primary key default gen_random_uuid(),
  deal_stage_id uuid not null references deal_stage(id) on delete cascade,
  submit_stage_id uuid not null references submit_stage(id) on delete cascade,
  unique (deal_stage_id),
  unique (submit_stage_id)
);
```
Seed it with the agreed mappings (LOI ↔ Negotiating LOI, etc. — to be filled in with Mike).

### Triggers
Two triggers, mirroring the `loi_date` pair:

- `sync_deal_stage_to_site_submit()` — `AFTER UPDATE OF stage_id ON deal`. If `deal.site_submit_id` is non-null and a mapping exists, update `site_submit.submit_stage_id` to the mapped value. Use `pg_trigger_depth()` guard to prevent recursion.
- `sync_site_submit_stage_to_deal()` — `AFTER UPDATE OF submit_stage_id ON site_submit`. Mirror logic.

### UI
Probably none required. The mapping table is admin-only data; the existing stage-edit dropdowns on each page just work, and the sync happens transparently.

## Phasing

This is a small, self-contained piece of work. Probably one PR:

1. Migration: `deal_submit_stage_map` table + seeded mappings.
2. Two trigger functions.
3. Tests: insert a deal/site_submit pair, change one side's stage, assert the other follows. Repeat in the other direction.

## Estimated effort

Half a day, assuming the stage mappings are straightforward. The bulk of the work is agreeing on the mapping rows with Mike — once those are decided, the migration + triggers are mechanical.

## Dependencies / sequencing

- Should be built **after** `site_submit_stage_history` exists (it ships with the portal email alerts feature in [FEATURE_2026_04_25_PORTAL_CHAT_EMAIL_ALERTS.md](FEATURE_2026_04_25_PORTAL_CHAT_EMAIL_ALERTS.md)). That way the sync trigger can write to both history tables with proper attribution.
- Not blocked by anything else.
