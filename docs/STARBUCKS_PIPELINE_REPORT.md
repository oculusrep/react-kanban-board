# Starbucks Pipeline Report

Route: `/reports/starbucks-pipeline` (also listed on the Reports page).

A ranked list of every Starbucks board card in **Pre-Submittal, Submitted-Reviewing,
Negotiating LOI and At Lease/PSA**, ordered by which deal we think moves next. Drag rows to
re-rank; **Export to Excel** writes the rows in exactly the order shown.

## Columns

| Column | Source |
|---|---|
| # | Position in the current order |
| Deal / Site Submit | `deal.deal_name` when the card has a deal, else `site_submit.site_submit_name`, else the board's name (property) |
| Stage | Board stage (same rules as the deal board — see `useStarbucksBoard`) |
| Status | Editable text — `starbucks_pipeline_report_row.status` |
| Package Status | Editable text for now — `package_status`. Will become a % complete fed by another tool |
| Notes | Editable text — `notes`. Report text for Starbucks; **not** the internal chat thread |
| Map | Google Maps link. Coordinates: site_submit verified → property verified → site_submit sf_property → property raw |

## Membership

Reuses `useStarbucksBoard` so the report and the board always agree: columns, the Ready and
To-classify bands, **and** the Parking lot (parked cards show a "parked" tag on screen). Account
switch (Starbucks / Coastal GA) is the board's account list; default is Starbucks.

## Storage

`public.starbucks_pipeline_report_row` (migration `20261010091850_starbucks_pipeline_report.sql`,
applied + recorded in prod 2026-10-10). Keyed like the board: `site_submit_id` when the card has
one, else `deal_id` (CHECK: exactly one). Deliberately separate from `deal_activity_state` —
writes there drive the board clock and post history into the chat.

- RLS: internal users only (`is_internal_user()`), SELECT / INSERT / UPDATE. No DELETE; rows
  cascade with their site_submit / deal.
- Grants: `authenticated` SELECT, INSERT, UPDATE; anon none. Verified by impersonation
  (internal insert/update/upsert OK, non-internal insert rejected by RLS, anon permission denied).

Ordering: drag saves the whole list as `sort_order` 1..n. Cards never ranked fall in after
ranked ones, furthest-along stage first. **Reset order** re-ranks everything by stage.

## Excel

`exportPipelineReport` (src/lib/starbucksPipelineReport.ts) on the shared `exportToExcel`:
Oculus logo + title, navy header, banded rows, autofilter, frozen header, landscape fit-to-width
with the header repeated on every printed page. `exportToExcel` gained a `landscape` option, and
its date detection now only converts whole-value dates (free text beginning with a date stays text).
