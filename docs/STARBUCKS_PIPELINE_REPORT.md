# Starbucks Pipeline Report

Route: `/reports/starbucks-pipeline`. Reached from the nav menu (both hamburgers, under Starbucks
Deal Board), the Reports page card, and a dim **Report** link in the deal board header (next to
← Pipeline). The report header has a Deal Board button back.

A ranked list of every Starbucks board card in **Pre-Submittal, Submitted-Reviewing,
Negotiating LOI and At Lease/PSA**, ordered by which deal we think moves next. Drag rows to
re-rank; **Export to Excel** writes the rows shown, in the order shown.

## Accounts

**All** · Starbucks · Coastal GA — the board's account list (`useStarbucksBoard`), plus All.
Default is Starbucks; the choice is remembered per browser. The All view shows each row's account
token and adds an **Account** column to the export.

## Columns

| Column | Source / behaviour |
|---|---|
| # | Rank in the full order (unchanged by filters) |
| Deal / Site Submit | `deal.deal_name` when the card has a deal, else `site_submit_name`, else the board's name. **Click** opens the map's `SiteSubmitSidebar` (context `deal`) — the site submit with its deal tab, or deal-direct mode for a card with no site submit |
| Status | The stage. Pre-Submittal adds what we're waiting on, edited by a dropdown (see below) |
| Court | Us / Them / Not set, plus the party label. **Click** opens the court editor |
| Days in Court | Days on the board clock + "since" date. Terracotta when the board calls it warm, bold when hot. **Click** opens the court editor |
| Package Status | Editable text (`package_status`). Will become a % complete fed by another tool |
| Notes | Editable text (`notes`). Report text for Starbucks; **not** the internal chat thread |
| Map | Google Maps link. Coordinates: site_submit verified → property verified → site_submit sf_property → property raw |

## Status (Pre-Submittal)

*Waiting on LL Pricing and Site Plan* / *LL Pricing* / *LL Site Plan* / *Site Control*,
*Ready to Submit*, or *Not set*. Writes `deal_activity_state` with the same patch the board's
classify controls save (`savePreStatus` → `upsertBoardState`): blocker choices imply court Them,
Ready implies Us, Not set returns the card to unclassified. It's a touch — the clock restarts now.

## Court editor

Ball in court (Us / Them / Clear), party ("Landlord"), and **Court started** date. A new court
defaults to today; any date up to today can be picked, so a court that changed on a day nobody
recorded (LOI comments came back on the 3rd) can be corrected. Today stamps now; an earlier date
stores that day's local midnight, which is what the board's `daysSince()` counts from.
`saveCourt` writes only court / party / since / seeded_fallback — blockers are untouched.
Both editors write the **board's** state, so the deal board reflects them (realtime), and the
history trigger posts court changes to the card's chat.

## Filters

Search (name, city, notes, package, party, status), Stage chips (with counts), Status (every
status present), Court (Us / Them / Not set), and Days ≥ N. Remembered per browser. Dragging
works while filtered: a row is re-ranked against its visible neighbours, hidden rows keep their
place. Export writes only the filtered rows and notes the filter in the subtitle.

## Membership

Reuses `useStarbucksBoard`, so the report and the board always agree: columns, the Ready and
To-classify bands, **and** the Parking lot (parked cards show a "parked" tag on screen).

## Storage

`public.starbucks_pipeline_report_row` (migration `20261010091850_starbucks_pipeline_report.sql`,
applied + recorded in prod 2026-10-10; its `status` column dropped by
`20261010094132_starbucks_pipeline_report_drop_status.sql` while the table was empty). Keyed like
the board: `site_submit_id` when the card has one, else `deal_id` (CHECK: exactly one). Holds
`sort_order`, `package_status`, `notes`. Deliberately separate from `deal_activity_state` —
writes there drive the board clock and post history into the chat.

- RLS: internal users only (`is_internal_user()`), SELECT / INSERT / UPDATE. No DELETE; rows
  cascade with their site_submit / deal.
- Grants: `authenticated` SELECT, INSERT, UPDATE; anon none. Verified by impersonation.

Ordering: drag saves the whole list as `sort_order` 1..n. Cards never ranked fall in after
ranked ones, furthest-along stage first. **Reset order** re-ranks everything by stage.

## Excel

`exportPipelineReport` (src/lib/starbucksPipelineReport.ts) on the shared `exportToExcel`:
Oculus logo + title, navy header, banded rows, autofilter, frozen header, landscape fit-to-width
with the header repeated on every printed page. Columns: #, (Account), Deal / Site Submit, City,
Status, Court (with party), Court Since, Days in Court (number), Package Status, Notes, Map.
`exportToExcel` has a `landscape` option, and only converts whole-value dates (free text
beginning with a date stays text).
