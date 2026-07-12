# Starbucks Quarterly Sales Import

Import the quarterly sales workbook that Starbucks sends. Takes ~30 seconds.

## TL;DR — run this

Drop the new `CONFIDENTIAL_OCULUS BROKER SALES_M.D.YY.xlsx` file into `data/incoming/starbucks/`, then from the repo root:

```bash
bun scripts/ingestStarbucks.ts "data/incoming/starbucks/CONFIDENTIAL_OCULUS BROKER SALES_M.D.YY.xlsx"
```

Replace `M.D.YY` with the date in the filename (e.g. `3.31.26`). The quotes are required because the filename contains a space.

The script prints `Snapshot date: YYYY-MM-DD` on the first line — sanity check that this matches the quarter you're importing before it proceeds.

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

## Expected columns (header row 1, first sheet)

The script reads by header name — column order doesn't matter, but names must match exactly (whitespace collapsed).

Store identity:
`Store #`, `Store Name`, `City`, `County`, `Market`, `Latitude`, `Longitude`, `Open Date`, `Relo Date`

Snapshot metrics:
`Ops Area`, `Store Type`, `Deal Type`, `Store Age`, `SF`, `Lease Exp Date`, `Optns Remain`, `Next Option Type`, `Annual Rent`, `Landlord`, `Rent as % of Sales`, `RTM Sales`, `RTM Contributn`, `RTM Cash Flow`, `TC %`, `Cash TC %`, `AWS Last 12 Wks`, `Sales Channel Mix`, `R52 Sales OTW`, `LHI Depreciation`

If Starbucks renames a column, edit the header string in [scripts/ingestStarbucks.ts:126-161](../scripts/ingestStarbucks.ts#L126-L161) to match.

## After the import (optional)

If this quarter's file added **new stores** that weren't in the prior quarter, and you want them to appear in the [Starbucks Site Analysis](STARBUCKS_SITE_ANALYSIS.md) tool with demographic data, also run:

```bash
bun scripts/enrichStarbucksDemographics.ts
```

This calls ESRI for each new store's demographics. Skip it if this quarter only updated sales figures on existing stores (the common case).

## Troubleshooting

- **`Cannot extract date from filename`** — the filename lacks a `M.D.YY` or `M.D.YYYY` date pattern. Rename the file to include one.
- **`Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY`** — `.env` isn't loaded, or is missing the service role key. This script uses the classic service role JWT (not the newer `sb_secret_` key).
- **Numbers wrong / null on the pin** — check the file's header row. If Starbucks changed a column name (e.g. `RTM Sales` → `TTM Sales`), the script silently reads `null` for that field. Fix the header string in the script.
- **Store missing from the map** — the store row needs non-null `Latitude` / `Longitude`. Fix in the source file and re-run.

## Import log

Keep a one-line note here each quarter so we can see history at a glance:

| Snapshot date | File | Ran by | Notes |
|---------------|------|--------|-------|
| 2026-03-31 | `CONFIDENTIAL_OCULUS BROKER SALES_3.31.26.xlsx` | | Initial import |
| 2026-07-08 | `CONFIDENTIAL_OCULUS BROKER SALES_7.8.26.xlsx` | Mike | 238 stores (4 more than prior quarter) |
