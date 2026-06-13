/**
 * Starbucks Licensed Stores ("LS") CSV ETL.
 * Usage: bun scripts/ingestStarbucksLicensed.ts <path-to-csv>
 *
 * Upserts every row in the CSV (keyed by Store Number) into starbucks_licensed_store,
 * then DELETES any rows in the table whose store_number is not in the CSV.
 * This mirrors the CSV exactly each run; verified_lat/lng on dropped stores is lost
 * (intentional, per spec).
 *
 * Uses service role key to bypass RLS for INSERT/UPDATE/DELETE.
 */

import fs from 'fs';
import Papa from 'papaparse';
import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const url = process.env.VITE_SUPABASE_URL!;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY!;
if (!url || !key) {
  console.error('Missing VITE_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env');
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function toText(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function toFloat(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = parseFloat(String(v).replace(/[$,\s]/g, ''));
  return isNaN(n) ? null : n;
}

function toInt(v: unknown): number | null {
  const f = toFloat(v);
  return f !== null ? Math.round(f) : null;
}

// "5/26/2026" → "2026-05-26"; also handles 2-digit years.
function toDate(v: unknown): string | null {
  const s = toText(v);
  if (!s) return null;
  const parts = s.split('/');
  if (parts.length !== 3) return null;
  const m = parts[0].padStart(2, '0');
  const d = parts[1].padStart(2, '0');
  const y = parts[2].length === 2 ? `20${parts[2]}` : parts[2];
  return `${y}-${m}-${d}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

const csvPath = process.argv[2];
if (!csvPath) {
  console.error('Usage: bun scripts/ingestStarbucksLicensed.ts <path-to-csv>');
  process.exit(1);
}

const raw = fs.readFileSync(csvPath, 'utf8');
const parsed = Papa.parse<Record<string, string>>(raw, {
  header: true,
  skipEmptyLines: true,
});

if (parsed.errors.length) {
  console.warn(`Parser reported ${parsed.errors.length} warnings (first):`, parsed.errors[0]);
}

const rows: Record<string, unknown>[] = [];
let skipped = 0;

for (const r of parsed.data) {
  const storeNumber = toText(r['Store Number']);
  if (!storeNumber) { skipped++; continue; }

  rows.push({
    store_number:              storeNumber,
    store_name:                toText(r['Store Name English']),
    project_number:            toText(r['Project Number']),
    lifecycle_status:          toText(r['Lifecycle Status']),
    ownership_type:            toText(r['Ownership Type']),
    store_type:                toText(r['Store Type']),
    actual_open_date:          toDate(r['Actual Open Dt']),
    store_age:                 toFloat(r['Store Age']),
    licensee_name:             toText(r['Licensee Name']),
    segment:                   toText(r['Segment']),
    ls_pipeline_decision_date: toDate(r['LS Pipeline Decision Dt']),
    ops_district_role:         toText(r['Ops District Role']),
    market_name:               toText(r['Market Name']),
    county_name:               toText(r['County Name']),
    address:                   toText(r['Address English']),
    suite:                     toText(r['Suite English']),
    city:                      toText(r['City English']),
    state:                     toText(r['State']),
    postal_code:               toText(r['Postal Code']),
    latitude:                  toFloat(r['Latitude']),
    longitude:                 toFloat(r['Longitude']),
    store_sqft:                toInt(r['Store Sq Ft']),
  });
}

console.log(`Parsed ${rows.length} licensed stores (skipped ${skipped} blank rows)`);

// ---------------------------------------------------------------------------
// Upsert (do NOT touch verified_lat/lng — only overwrite raw geocode + metadata)
// ---------------------------------------------------------------------------
console.log('Upserting starbucks_licensed_store...');
const BATCH = 200;
for (let i = 0; i < rows.length; i += BATCH) {
  const batch = rows.slice(i, i + BATCH);
  const { error } = await supabase
    .from('starbucks_licensed_store')
    .upsert(batch, { onConflict: 'store_number', ignoreDuplicates: false });
  if (error) {
    console.error(`Upsert failed at batch ${i}:`, error.message);
    process.exit(1);
  }
}
console.log(`  → ${rows.length} rows upserted`);

// ---------------------------------------------------------------------------
// Delete rows not present in the CSV
// ---------------------------------------------------------------------------
const keepIds = rows.map(r => r.store_number as string);

// Fetch existing IDs so we can compute the deletion set client-side
// (Supabase REST .delete().not('store_number', 'in', '(…)') chokes on long lists).
const { data: existing, error: fetchErr } = await supabase
  .from('starbucks_licensed_store')
  .select('store_number');

if (fetchErr) {
  console.error('Failed to list existing rows for deletion sweep:', fetchErr.message);
  process.exit(1);
}

const keepSet = new Set(keepIds);
const toDelete = (existing ?? [])
  .map(r => r.store_number as string)
  .filter(id => !keepSet.has(id));

if (toDelete.length === 0) {
  console.log('No stale rows to delete.');
} else {
  console.log(`Deleting ${toDelete.length} stale rows not in CSV...`);
  for (let i = 0; i < toDelete.length; i += BATCH) {
    const batch = toDelete.slice(i, i + BATCH);
    const { error: delErr } = await supabase
      .from('starbucks_licensed_store')
      .delete()
      .in('store_number', batch);
    if (delErr) {
      console.error(`Delete failed at batch ${i}:`, delErr.message);
      process.exit(1);
    }
  }
  console.log(`  → ${toDelete.length} rows deleted`);
}

console.log('Done.');
