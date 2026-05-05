/**
 * Starbucks store data ETL
 * Usage: bun scripts/ingestStarbucks.ts <path-to-xlsx>
 *
 * Extracts snapshot_date from filename (e.g. "SALES_3.31.26.xlsx" → 2026-03-31).
 * Upserts starbucks_store (keyed by Store #) then starbucks_snapshot (store + date).
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
    const y = v.getFullYear();
    const m = String(v.getMonth() + 1).padStart(2, '0');
    const d = String(v.getDate()).padStart(2, '0');
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

const xlsxPath = process.argv[2];
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

function col(name: string, row: ExcelJS.Row): unknown {
  const idx = headers[name];
  if (!idx) return null;
  const cell = row.getCell(idx);
  // Return Date objects as-is, otherwise the cell value
  return cell.value instanceof Object && 'getTime' in cell.value
    ? (cell.value as Date)
    : cell.value;
}

const stores: Record<string, unknown>[]   = [];
const snapshots: Record<string, unknown>[] = [];
let skipped = 0;

ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
  if (rowNum === 1) return; // header

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
});

console.log(`Parsed ${stores.length} stores, skipped ${skipped} blank rows`);

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
