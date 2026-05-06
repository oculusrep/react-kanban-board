# Project G — Data Audit Agent

**Status:** Planning scaffold — pending detailed interview
**Source:** [ovis-openclaw-agent-architecture-specs.md §2.G](ovis-openclaw-agent-architecture-specs.md)

---

## Goal

Different from the UX audit (Project F). This one checks **OVIS data integrity** — orphaned records, broken relationships, overdue tasks, deal pipeline inconsistencies, missing required fields.

## Current State

Nothing built. Data quality issues surface when they cause user-visible bugs (the worst time to find them).

## Target Architecture

OpenClaw agent, scheduled weekly. Pulls structured findings from OVIS tools, summarizes, optionally suggests cleanup actions.

## OVIS Tools to Build

Per the architecture doc:
- `find_orphaned_records(table)` — records without expected parent relationships
- `find_overdue_tasks` — past-due, unflagged
- `find_pipeline_inconsistencies` — deals in weird/impossible states
- `find_data_quality_issues` — missing required fields on key records

## Output

Email or dashboard report with findings + suggested cleanup actions. Likely also tasks created in the task system for fix work.

## Cost Profile

Lightweight. Most of the work is SQL inside OVIS tools; agent just summarizes findings. A few dollars per week.

## Dependencies

- Defined invariants — what *should* be true about the data
- Notification/delivery channel for findings (email, Telegram, dashboard)

## Open Questions for Interview

1. **Inventory of invariants:** What are the rules that should always hold? (e.g., "every site_submit must have a client_id", "every closed-won deal must have a commission record")
2. **Severity grading:** Are some violations "alarm" and others "informational"?
3. **Auto-fix scope:** Should the agent ever fix things (e.g., flip an obviously-stale flag) or strictly read-only?
4. **Pipeline inconsistency definition:** What counts as a "weird state"? (Deal closed-won but no signed agreement? Deal in negotiation past N days?)
5. **Output channel:** Email? OVIS dashboard? Tasks auto-created? All of the above?
6. **Tables in scope:** All OVIS tables, or focused subset (deals, contacts, properties, activity)?
7. **Trend tracking:** Does the agent compare this week's findings to last week's (improving vs. degrading)?
8. **False-positive tolerance:** How noisy is acceptable before you stop reading the report?
9. **Overlap with bookkeeper:** The bookkeeper does some categorization/reconciliation — clear line between its work and the data auditor's?
10. **Source of truth for invariants:** Code/migrations? Documented separately? Maintained by the agent itself over time?

## Build Effort Estimate

OVIS query tools: 3–5 days.
Agent logic: ~2 days once tools exist.
Most effort is defining the invariants, not coding them.
