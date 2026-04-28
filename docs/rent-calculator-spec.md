# Rent Calculator — Spec Stub

**Status:** Set aside. Captured at Mike's request during Legal Orchestration interview (Q13 follow-up). To be designed as its own focused interview after Legal Orchestration spec is complete.

## Scope

A **deal-level rent calculator** — usable on any deal, not just LOI-driven ones. Reused by:
- The Starbucks LOI playbook (Function B wizard's rent step pulls from this calculator instead of asking Mike to type a schedule manually).
- Future client playbooks (any client whose LOI includes a rent schedule).
- Standalone use on any deal where Mike wants to model rent over time.

## Inputs (per Mike)

- **Base term** (years)
- **Options** (count and length per option)
- **Square footage**
- **Annual percentage increases** — editable (could be flat, stepped, CPI-pegged, or custom per period)

## Likely output

A structured rent schedule (annual + monthly amounts per period) that maps cleanly onto the `deal_rent_schedule` table proposed in the Legal Orchestration schema audit. So this calculator becomes the canonical writer of `deal_rent_schedule` rows.

## Open questions (for later)

- Where on the deal record does this UI live? (Tab? Inline editor? Modal?)
- Does it support multiple "scenarios" (e.g., compare 3% increases vs 4% increases)?
- Print/export to PDF for landlord-facing rent sheets?
- Integration with TIA amortization? (Handbook is explicit: TIA shouldn't be rolled into rent, but the calculator might still need to display the implied effective rent if it were.)
- CPI/index-linked increases — how to model uncertainty?
- How does it interact with percentage rent (mall stores)?

## Dependency notes

- The Legal Orchestration Function B wizard's "Rent" step **depends on this** — without the calculator, Mike has to type the rent schedule by hand into the wizard. With it, he configures the calculator once and the schedule populates automatically.
- The schema migration for Legal Orchestration adds `deal_rent_schedule` already; the calculator can ship later without re-migrating.

## Sequencing

Build Legal Orchestration V1 first using a manual rent-schedule entry form (interim). Then design and build the rent calculator as a standalone deal-level feature, and rewire the wizard to use it.
