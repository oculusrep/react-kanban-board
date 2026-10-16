# Starbucks Quarterly Sales Import

Import the quarterly sales workbook that Starbucks sends. Takes ~30 seconds.

## TL;DR — run this

Drop the new `CONFIDENTIAL_OCULUS BROKER SALES_M.D.YY.xlsx` file into `data/incoming/starbucks/`, then from the repo root:

```bash
bun scripts/ingestStarbucks.ts "data/incoming/starbucks/CONFIDENTIAL_OCULUS BROKER SALES_M.D.YY.xlsx"
```

Replace `M.D.YY` with the date in the filename (e.g. `9.30.26`). The quotes are required because the filename contains a space.

The script prints `Snapshot date: YYYY-MM-DD` and `Format: legacy|atlas` first — sanity check both. Add `--dry-run` to parse and print a summary without writing anything.

**Sanity check the file before importing.** The Q3 2026 file was first sent as the wrong region (682 VA/NC/SC stores, zero Georgia). The right file has ~270 open stores, mostly GA plus FL.

Nothing else to do. The map picks up the new snapshot automatically on next page load.

## What it does

1. Parses `snapshot_date` **from the filename** (`M.D.YY` → `20YY-M-D`). File must contain a date in that format anywhere in its name.
2. Upserts every row into two tables:
   - **`starbucks_store`** — store identity (`store_number`, name, city, county, market, lat/lng, open/relo dates). Keyed by `Store #`.
   - **`starbucks_snapshot`** — quarterly metrics (RTM Sales, Annual Rent, Rent % of Sales, AWS, TC %, etc.). Keyed by `(store_number, snapshot_date)`.
3. Idempotent — safe to re-run the same file. Re-running with a **corrected** file overwrites that quarter's snapshot; older quarters are untouched.
4. Uses `SUPABASE_SERVICE_ROLE_KEY` from `.env` — bypasses RLS.

## Map / slideout behavior (confirmed)

- **Map pin popup**: shows the **latest** snapshot for that store (Store Type, Deal Type, Store Age, Annual Rent, RTM Sales) with an "As of {snapshot_date}" line at the bottom. Uses whichever snapshot has the newest `snapshot_date` per store — driven by [StarbucksLayer.tsx:233-250](../src/components/mapping/layers/StarbucksLayer.tsx#L233-L250).
- **Slideout** (opens from the popup's "View Details" button): the **"Snapshot History"** section fetches **all** historical snapshots for that store from `starbucks_snapshot` ordered newest-first, and renders a **RTM Sales trend chart** if there are 2+ snapshots. Every quarter you import adds one more point to that chart. See [StarbucksSlideout.tsx:45-73](../src/components/mapping/slideouts/StarbucksSlideout.tsx#L45-L73).

So each quarterly import: (a) updates what the pin/popup shows, and (b) extends the historical trend in the slideout. Nothing is overwritten unless you re-import a file with the same snapshot date.

## File formats

The script detects the layout from the header row:

| Layout | Used for | Key column | Shape |
|---|---|---|---|
| **atlas** | Q3 2026 (`9.30.26`) onward — **current format** | `Store Number` | 116 columns, Starbucks Atlas export |
| **legacy** | Q1–Q2 2026 (`3.31.26`, `7.8.26`) | `Store #` | 29 columns, "OCULUS" sheet |

### Atlas → OVIS column map

**Store identity (`starbucks_store`)**

| OVIS column | Atlas header | Notes |
|---|---|---|
| store_number | `Store Number` | |
| store_name | `Store Name English` | |
| city | `City English` | |
| county | `County Name` | |
| market | `Market Name` | |
| state | `State` | Full name → 2-letter (`Georgia` → `GA`). Legacy files never set state. |
| latitude / longitude | `Latitude` / `Longitude` | |
| open_date | `Actual Open Dt` | |
| relo_date | — | **Not in Atlas.** The script leaves it alone so legacy relo dates survive. |

**Quarterly metrics (`starbucks_snapshot`)**

| OVIS column | Atlas header | Notes |
|---|---|---|
| ops_area | `Ops Area ID` | Same number as legacy `Ops Area` (39, 92, 106 …) |
| store_type | `Store Type` | Normalized: `Drive Thru` → `DT`, `Drive Thru Only` → `DTO`, `Cafe` → `Cafe`. The map logos and Site Story key on these codes. |
| deal_type | `Deal Type` | Normalized: `Standard Lease` → `Standard`, `Ground Lease` → `Ground`, `Purchase Deal` → `Purchase` |
| store_age | `Store Age` | |
| sf | `Store Sq Ft` | |
| lease_exp_date | `CO \ Lease Expiration` | |
| optns_remain | `CO \ Remaining Options` | |
| next_option_type | `CO \ Next Option Type` | Trailing " Option" dropped (`Fixed Option` → `Fixed`) |
| annual_rent | `CO \ Annual Base Rent` | |
| landlord | `CO \ Landlord Name` | |
| rent_pct_of_sales | `CO \ Rent as % of Sales` | |
| rtm_sales | `RTM Sales` | |
| rtm_contribution | `RTM Contribution` | |
| tc_pct | `TC %` | |
| cash_tc_pct | `Cash TC (%)` | |
| r52_sales_otw | `R52 Sales OTW` | |
| lhi_depreciation | `LHI` | |
| sales_channel_mix | the four `CO \ % of Total Sales: …` columns | Rebuilt into the legacy `Cafe: 15%  OTW: 48%  MOP: 24%  Del: 14%` string |
| rtm_cash_flow | — | **Not in Atlas.** Null from Q3 2026 on; slideout shows "—". |
| aws_last_12_wks | — | **Not in Atlas.** Null from Q3 2026 on. Nearest new figure is `ADT` (avg daily transactions), a different metric. |

If an Atlas value isn't in a normalization table (e.g. a new store type), the script prints `WARNING: unmapped values` and stores it as-is.

**Atlas columns not imported.** These have no OVIS column yet. Adding any of them needs a migration.
- Location: `Address English`, `Suite English`, `Postal Code`, `Minimarket Name`, `Urbanity` / `Urbanity Code`, `Ops District Role`, `Ops Region Name`
- IDs: `Site ID`, `Project Number`, `Atlas Site ID`
- Site attributes: `CO/ Store Format`, `Profile Type`, `Construction Type`, `CO \ Position`, `CO \ DT Stack`, `CO \ DT Queue`, `CO \ Parking Stalls`, `CO \ Cafe Seats`, `CO \ Patio Seats`, `CO \ Primary Bus Gen`, `Secondary Concept`, `Venue Name`
- Site scores (1–5, filled on ~45% of stores): `CO SC \ Retail Presence`, `Retail Quality`, `Tourist Presence`, `Ped Traffic`, `Vehicle Traffic`, `AM/PM Position`, `Site Access`, `Site Visibility`
- Performance: `ADT`, `R52 Trans`, `Impairment Status`, `Impairment/Recovered Dt`
- People: `CO \ N Store Deal Maker`, `CO \ E Store Deal Maker`, `CO \ Rep`
- Milestone dates: `Prospect Dt`, `Potential Dt`, `CO \ SSP Submitted Dt`, `CO \ SSP Approve Dt`, `CO \ Lease Approved Dt`, `CO \ Possession Dt`, `CO \ LOI Dt`, `Est. Open Dt`
- Always blank for company-operated stores: every `LS \ …` column, `Licensee Name`, `Segment`, `Temporary Closure Reason`, `Actual Close Dt`, `Actual Retired Dt`, `Market Planning Manager`, `R52 Sales`, `CO SC \ Strat Position`, `CO SC \ RE Quality`

### Date off-by-one (fixed 2026-10-16)

Before this fix, the script read Excel date cells with local-time getters, so every date stored from a real date cell landed **one day early** (lease expiration `2031-05-31` stored as `2031-05-30`). Legacy `Open Date` was a text column and wasn't affected; `Lease Exp Date` was. Q1/Q2 were corrected on 2026-10-16 by re-running both legacy files and then the Q3 file, in date order so the newest file's store details win.

## Legacy expected columns (header row 1, first sheet)

The script reads by header name — column order doesn't matter, but names must match exactly (whitespace collapsed).

Store identity:
`Store #`, `Store Name`, `City`, `County`, `Market`, `Latitude`, `Longitude`, `Open Date`, `Relo Date`

Snapshot metrics:
`Ops Area`, `Store Type`, `Deal Type`, `Store Age`, `SF`, `Lease Exp Date`, `Optns Remain`, `Next Option Type`, `Annual Rent`, `Landlord`, `Rent as % of Sales`, `RTM Sales`, `RTM Contributn`, `RTM Cash Flow`, `TC %`, `Cash TC %`, `AWS Last 12 Wks`, `Sales Channel Mix`, `R52 Sales OTW`, `LHI Depreciation`

If Starbucks renames a column, edit the header string in [scripts/ingestStarbucks.ts](../scripts/ingestStarbucks.ts) to match (the `atlas` branch for current files).

## After the import (optional)

If this quarter's file added **new stores** that weren't in the prior quarter, and you want them to appear in the [Starbucks Site Analysis](STARBUCKS_SITE_ANALYSIS.md) tool with demographic data, also run:

```bash
bun scripts/enrichStarbucksDemographics.ts
```

This calls ESRI for each new store's demographics. Skip it if this quarter only updated sales figures on existing stores (the common case).

## Troubleshooting

- **`Cannot extract date from filename`** — the filename lacks a `M.D.YY` or `M.D.YYYY` date pattern. Rename the file to include one.
- **`Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`** — `.env` isn't loaded, or is missing the service role key. `.env` holds the `sb_secret_` key under that name (the legacy JWTs are disabled).
- **`Parsed 0 stores`** — the header row matched neither layout's key column, or every row is blank. Check row 1 of the first sheet.
- **Numbers wrong / null on the pin** — check the file's header row. If Starbucks changed a column name (e.g. `RTM Sales` → `TTM Sales`), the script silently reads `null` for that field. Fix the header string in the script.
- **Store missing from the map** — the store row needs non-null `Latitude` / `Longitude`. Fix in the source file and re-run.

## Import log

Keep a one-line note here each quarter so we can see history at a glance:

| Snapshot date | File | Ran by | Notes |
|---------------|------|--------|-------|
| 2026-03-31 | `CONFIDENTIAL_OCULUS BROKER SALES_3.31.26.xlsx` | | Initial import |
| 2026-07-08 | `CONFIDENTIAL_OCULUS BROKER SALES_7.8.26.xlsx` | Mike | 238 stores (4 more than prior quarter) |
| 2026-09-30 | `CONFIDENTIAL_OCULUS BROKER SALES_9.30.26.xlsx` | Mike | First Atlas-format file. Final: 279 stores (234 GA, 41 FL, 4 SC); 41 new (all FL). Sent three times: wrong region (VA/NC/SC), then 269 stores missing 10 ops-area-92 Cobb/Paulding drive-thrus, then the full file. Each re-import overwrote the same quarter (no duplicates). Q1/Q2 re-imported the same day to fix dates. |
