/**
 * Starbucks store data ETL
 * Usage: bun scripts/ingestStarbucks.ts <path-to-xlsx>
 *
 * Extracts snapshot_date from filename (e.g. "SALES_3.31.26.xlsx" → 2026-03-31).
 * Upserts starbucks_store (keyed by Store #) then starbucks_snapshot (store + date).
 * --dry-run parses and prints a summary without writing.
 * Uses service role key — bypasses RLS intentionally.
 */

import ExcelJS from 'exceljs';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config();

const url  = process.env.VITE_SUPABASE_URL!;
const key  = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function parseDateFromFilename(filePath: string): string {
  const name = path.basename(filePath);
  // Match patterns like 3.31.26 or 3.31.2026
  const m = name.match(/(\d{1,2})\.(\d{1,2})\.(\d{2,4})/);
  if (!m) throw new Error(`Cannot extract date from filename: ${name}`);
  const month = m[1].padStart(2, '0');
  const day   = m[2].padStart(2, '0');
  const yr    = m[3].length === 2 ? `20${m[3]}` : m[3];
  return `${yr}-${month}-${day}`;
}

function toFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  if (typeof v === 'number') return v;
  // Strip currency symbols and commas: "$1,330,632" → 1330632
  const s = String(v).replace(/[$,\s]/g, '');
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

function toInt(v: unknown): number | null {
  const f = toFloat(v);
  return f !== null ? Math.round(f) : null;
}

function toDate(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null;
  if (v instanceof Date) {
    // Excel dates are naive; exceljs returns them as UTC midnight, so read UTC
    // parts (local getters land on the previous day in Eastern time).
    const y = v.getUTCFullYear();
    const m = String(v.getUTCMonth() + 1).padStart(2, '0');
    const d = String(v.getUTCDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
  if (typeof v === 'string') {
    // e.g. "7/21/2017"
    const parts = v.split('/');
    if (parts.length === 3) {
      const m = parts[0].padStart(2, '0');
      const d = parts[1].padStart(2, '0');
      const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
      return `${y}-${m}-${d}`;
    }
  }
  return null;
}

function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const xlsxPath = process.argv.slice(2).find(a => !a.startsWith('--'));
const dryRun = process.argv.includes('--dry-run');
if (!xlsxPath) {
  console.error('Usage: bun scripts/ingestStarbucks.ts <path-to-xlsx>');
  process.exit(1);
}

const snapshotDate = parseDateFromFilename(xlsxPath);
console.log(`Snapshot date: ${snapshotDate}`);

const wb = new ExcelJS.Workbook();
await wb.xlsx.readFile(xlsxPath);
const ws = wb.worksheets[0];

// Build column index from header row
const headers: Record<string, number> = {};
ws.getRow(1).eachCell({ includeEmpty: true }, (cell, col) => {
  const h = String(cell.value ?? '').trim().replace(/\s+/g, ' ');
  headers[h] = col;
});

// Two layouts exist:
//   legacy  — 29-col "OCULUS" sheet (Q1/Q2 2026), keyed by "Store #"
//   atlas   — 116-col Atlas export (Q3 2026 onward), keyed by "Store Number"
// Column map for both: docs/STARBUCKS_QUARTERLY_SALES_IMPORT.md
const format: 'legacy' | 'atlas' =
  headers['Store Number'] ? 'atlas' : headers['Store #'] ? 'legacy' : (() => {
    console.error('Unrecognized layout: header row has neither "Store #" nor "Store Number".');
    process.exit(1);
  })();
console.log(`Format: ${format}`);

function col(name: string, row: ExcelJS.Row): unknown {
  const idx = headers[name];
  if (!idx) return null;
  const v = row.getCell(idx).value;
  // Formula cells come back as { formula, result }
  if (v && typeof v === 'object' && !(v instanceof Date) && 'result' in v) return (v as { result: unknown }).result;
  return v;
}

// Atlas spells values out; the app (logo layer, Site Story) keys on the legacy codes.
const STORE_TYPE: Record<string, string> = { 'Drive Thru': 'DT', 'Drive Thru Only': 'DTO', 'Cafe': 'Cafe' };
const DEAL_TYPE: Record<string, string>  = { 'Standard Lease': 'Standard', 'Ground Lease': 'Ground', 'Purchase Deal': 'Purchase' };
const STATE: Record<string, string> = {
  Alabama: 'AL', Florida: 'FL', Georgia: 'GA', 'North Carolina': 'NC',
  'South Carolina': 'SC', Tennessee: 'TN', Virginia: 'VA',
};

function mapped(dict: Record<string, string>, v: unknown): string | null {
  const s = toText(v);
  if (s === null) return null;
  if (!(s in dict)) unmapped.add(s);
  return dict[s] ?? s;
}
const unmapped = new Set<string>();

// "Fixed Option" → "Fixed", matching legacy values
function optionType(v: unknown): string | null {
  const s = toText(v);
  return s === null ? null : s.replace(/\s+Option$/i, '');
}

// Rebuild the legacy "Cafe: 15%  OTW: 48%  MOP: 24%  Del: 14%" string from the four Atlas columns
function channelMix(row: ExcelJS.Row): string | null {
  const parts: [string, string][] = [
    ['Cafe', 'CO \\ % of Total Sales: Cafe'],
    ['OTW',  'CO \\ % of Total Sales: Out the Window'],
    ['MOP',  'CO \\ % of Total Sales: MOP'],
    ['Del',  'CO \\ % of Total Sales: Delivery'],
  ];
  const out = parts
    .map(([label, h]) => { const n = toFloat(col(h, row)); return n === null ? null : `${label}: ${Math.round(n * 100)}%`; })
    .filter(Boolean);
  return out.length ? out.join('  ') : null;
}

const stores: Record<string, unknown>[]   = [];
const snapshots: Record<string, unknown>[] = [];
let skipped = 0;

ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
  if (rowNum === 1) return; // header

  if (format === 'legacy') {
    const storeNumber = toText(col('Store #', row));
    if (!storeNumber) { skipped++; return; }

    stores.push({
      store_number: storeNumber,
      store_name:   toText(col('Store Name', row)),
      city:         toText(col('City', row)),
      county:       toText(col('County', row)),
      market:       toText(col('Market', row)),
      latitude:     toFloat(col('Latitude', row)),
      longitude:    toFloat(col('Longitude', row)),
      open_date:    toDate(col('Open Date', row)),
      relo_date:    toDate(col('Relo Date', row)),
    });

    snapshots.push({
      store_number:       storeNumber,
      snapshot_date:      snapshotDate,
      ops_area:           toText(col('Ops Area', row)),
      store_type:         toText(col('Store Type', row)),
      deal_type:          toText(col('Deal Type', row)),
      store_age:          toFloat(col('Store Age', row)),
      sf:                 toInt(col('SF', row)),
      lease_exp_date:     toDate(col('Lease Exp Date', row)),
      optns_remain:       toInt(col('Optns Remain', row)),
      next_option_type:   toText(col('Next Option Type', row)),
      annual_rent:        toFloat(col('Annual Rent', row)),
      landlord:           toText(col('Landlord', row)),
      rent_pct_of_sales:  toFloat(col('Rent as % of Sales', row)),
      rtm_sales:          toFloat(col('RTM Sales', row)),
      rtm_contribution:   toFloat(col('RTM Contributn', row)),
      rtm_cash_flow:      toFloat(col('RTM Cash Flow', row)),
      tc_pct:             toFloat(col('TC %', row)),
      cash_tc_pct:        toFloat(col('Cash TC %', row)),
      aws_last_12_wks:    toFloat(col('AWS Last 12 Wks', row)),
      sales_channel_mix:  toText(col('Sales Channel Mix', row)),
      r52_sales_otw:      toFloat(col('R52 Sales OTW', row)),
      lhi_depreciation:   toFloat(col('LHI Depreciation', row)),
    });
    return;
  }

  // atlas
  const storeNumber = toText(col('Store Number', row));
  if (!storeNumber) { skipped++; return; }

  // No relo_date key: Atlas has no relo column, and sending null would wipe
  // relo dates the legacy files recorded.
  stores.push({
    store_number: storeNumber,
    store_name:   toText(col('Store Name English', row)),
    city:         toText(col('City English', row)),
    county:       toText(col('County Name', row)),
    market:       toText(col('Market Name', row)),
    state:        mapped(STATE, col('State', row)),
    latitude:     toFloat(col('Latitude', row)),
    longitude:    toFloat(col('Longitude', row)),
    open_date:    toDate(col('Actual Open Dt', row)),
  });

  snapshots.push({
    store_number:       storeNumber,
    snapshot_date:      snapshotDate,
    ops_area:           toText(col('Ops Area ID', row)),
    store_type:         mapped(STORE_TYPE, col('Store Type', row)),
    deal_type:          mapped(DEAL_TYPE, col('Deal Type', row)),
    store_age:          toFloat(col('Store Age', row)),
    sf:                 toInt(col('Store Sq Ft', row)),
    lease_exp_date:     toDate(col('CO \\ Lease Expiration', row)),
    optns_remain:       toInt(col('CO \\ Remaining Options', row)),
    next_option_type:   optionType(col('CO \\ Next Option Type', row)),
    annual_rent:        toFloat(col('CO \\ Annual Base Rent', row)),
    landlord:           toText(col('CO \\ Landlord Name', row)),
    rent_pct_of_sales:  toFloat(col('CO \\ Rent as % of Sales', row)),
    rtm_sales:          toFloat(col('RTM Sales', row)),
    rtm_contribution:   toFloat(col('RTM Contribution', row)),
    rtm_cash_flow:      null, // not in Atlas export
    tc_pct:             toFloat(col('TC %', row)),
    cash_tc_pct:        toFloat(col('Cash TC (%)', row)),
    aws_last_12_wks:    null, // not in Atlas export
    sales_channel_mix:  channelMix(row),
    r52_sales_otw:      toFloat(col('R52 Sales OTW', row)),
    lhi_depreciation:   toFloat(col('LHI', row)),
  });
});

if (unmapped.size) console.warn(`WARNING: unmapped values passed through as-is: ${[...unmapped].join(', ')}`);

console.log(`Parsed ${stores.length} stores, skipped ${skipped} blank rows`);

if (dryRun) {
  const n = (k: string) => snapshots.filter(s => s[k] !== null && s[k] !== undefined).length;
  console.log('Dry run — filled counts:', Object.fromEntries(Object.keys(snapshots[0] ?? {}).map(k => [k, n(k)])));
  console.log('Sample store:', stores[0]);
  console.log('Sample snapshot:', snapshots[0]);
  process.exit(0);
}

// ---------------------------------------------------------------------------
// Upsert starbucks_store
// ---------------------------------------------------------------------------
console.log('Upserting starbucks_store...');
const { error: storeError, count: storeCount } = await supabase
  .from('starbucks_store')
  .upsert(stores, {
    onConflict: 'store_number',
    ignoreDuplicates: false,
  })
  .select('store_number', { count: 'exact', head: true });

if (storeError) {
  console.error('Store upsert failed:', storeError.message);
  process.exit(1);
}
console.log(`  → ${storeCount ?? stores.length} stores upserted`);

// ---------------------------------------------------------------------------
// Upsert starbucks_snapshot
// ---------------------------------------------------------------------------
console.log('Upserting starbucks_snapshot...');
const BATCH = 200;
let snapshotTotal = 0;

for (let i = 0; i < snapshots.length; i += BATCH) {
  const batch = snapshots.slice(i, i + BATCH);
  const { error: snapError } = await supabase
    .from('starbucks_snapshot')
    .upsert(batch, { onConflict: 'store_number,snapshot_date', ignoreDuplicates: false });

  if (snapError) {
    console.error(`Snapshot upsert failed at batch ${i}:`, snapError.message);
    process.exit(1);
  }
  snapshotTotal += batch.length;
}

console.log(`  → ${snapshotTotal} snapshots upserted`);
console.log(`Done. Snapshot date: ${snapshotDate}`);
