/**
 * Starbucks store demographics ETL
 * Usage:
 *   bun scripts/enrichStarbucksDemographics.ts                 # enrich all stores
 *   bun scripts/enrichStarbucksDemographics.ts --limit 1       # enrich first store only (test)
 *   bun scripts/enrichStarbucksDemographics.ts --store 12345   # enrich one specific store
 *   bun scripts/enrichStarbucksDemographics.ts --concurrency 6 # parallelism (default 4)
 *
 * Calls the esri-geoenrich edge function per store with 1mi + 3mi ring buffers,
 * 5min + 10min drive times, and include_education=true, then upserts the result
 * into starbucks_store_demographics. Uses the service role key (bypasses RLS and
 * satisfies the edge function's JWT check).
 */

import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

dotenv.config();

const url = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL!;
// Service/secret key for DB writes (bypasses RLS). Accepts new sb_secret_ format.
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY!;
// A valid project JWT (legacy anon key, eyJ...) is required to pass the edge
// function gateway's verify_jwt check — the sb_secret_ key is not a JWT.
const anonJwt = process.env.VITE_SUPABASE_ANON_KEY!;
if (!url || !serviceKey) {
  console.error('Missing Supabase URL or service/secret key in .env');
  process.exit(1);
}
if (!anonJwt || !anonJwt.startsWith('eyJ')) {
  console.error('Missing VITE_SUPABASE_ANON_KEY (legacy JWT) in .env — needed to invoke the edge function');
  process.exit(1);
}

// Two clients: service-role for DB writes, anon-JWT for invoking the gated function.
const supabase = createClient(url, serviceKey, { auth: { persistSession: false } });
const fnClient = createClient(url, anonJwt, { auth: { persistSession: false } });

const RADII = [1, 3];
const DRIVE_TIMES = [5, 10];

// CLI args
function argValue(flag: string): string | undefined {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
}
const limit = argValue('--limit') ? parseInt(argValue('--limit')!, 10) : undefined;
const onlyStore = argValue('--store');
const concurrency = argValue('--concurrency') ? parseInt(argValue('--concurrency')!, 10) : 4;

interface StoreRow {
  store_number: string;
  latitude: number;
  longitude: number;
}

interface EnrichResponse {
  success: boolean;
  error?: string;
  demographics?: Record<string, number | null>;
  raw_response?: unknown;
}

const DEMO_COLUMNS = [
  'pop_1_mile', 'pop_3_mile', 'pop_5min_drive', 'pop_10min_drive',
  'median_age_1_mile', 'median_age_3_mile', 'median_age_5min_drive', 'median_age_10min_drive',
  'hh_income_median_1_mile', 'hh_income_median_3_mile', 'hh_income_median_5min_drive', 'hh_income_median_10min_drive',
  'educ_some_college_plus_pct_1_mile', 'educ_some_college_plus_pct_3_mile', 'educ_some_college_plus_pct_5min_drive', 'educ_some_college_plus_pct_10min_drive',
  'employees_1_mile', 'employees_3_mile', 'employees_5min_drive', 'employees_10min_drive',
] as const;

async function enrichStore(store: StoreRow): Promise<Record<string, unknown> | null> {
  const { data, error } = await fnClient.functions.invoke<EnrichResponse>('esri-geoenrich', {
    body: {
      property_id: store.store_number,
      latitude: store.latitude,
      longitude: store.longitude,
      custom_radii: RADII,
      custom_drive_times: DRIVE_TIMES,
      include_education: true,
    },
  });

  if (error) {
    let detail = error.message;
    const ctx = (error as { context?: { json?: () => Promise<unknown>; text?: () => Promise<string> } }).context;
    try {
      if (ctx?.json) detail += ' — ' + JSON.stringify(await ctx.json());
      else if (ctx?.text) detail += ' — ' + (await ctx.text());
    } catch { /* ignore body parse errors */ }
    console.error(`  ✗ ${store.store_number}: invoke error — ${detail}`);
    return null;
  }
  if (!data?.success || !data.demographics) {
    console.error(`  ✗ ${store.store_number}: ${data?.error ?? 'no demographics returned'}`);
    return null;
  }

  const d = data.demographics;
  const row: Record<string, unknown> = {
    store_number: store.store_number,
    enriched_at: new Date().toISOString(),
    enriched_latitude: store.latitude,
    enriched_longitude: store.longitude,
    esri_raw: data.raw_response ?? null,
  };
  for (const col of DEMO_COLUMNS) row[col] = d[col] ?? null;

  const filled = DEMO_COLUMNS.filter(c => row[c] !== null).length;
  console.log(`  ✓ ${store.store_number}: ${filled}/${DEMO_COLUMNS.length} metrics`);
  return row;
}

async function main() {
  let query = supabase
    .from('starbucks_store')
    .select('store_number, latitude, longitude')
    .not('latitude', 'is', null)
    .not('longitude', 'is', null)
    .order('store_number');

  if (onlyStore) query = query.eq('store_number', onlyStore);

  const { data: stores, error } = await query;
  if (error) { console.error('Failed to load stores:', error.message); process.exit(1); }

  let targets = (stores ?? []) as StoreRow[];
  if (limit !== undefined) targets = targets.slice(0, limit);

  console.log(`Enriching ${targets.length} store(s) — radii ${RADII.join('/')}mi, drive ${DRIVE_TIMES.join('/')}min, concurrency ${concurrency}`);

  const rows: Record<string, unknown>[] = [];
  let failed = 0;

  // Simple promise pool
  let cursor = 0;
  async function worker() {
    while (cursor < targets.length) {
      const store = targets[cursor++];
      const row = await enrichStore(store);
      if (row) rows.push(row); else failed++;
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, targets.length) }, worker));

  console.log(`\nEnriched ${rows.length}, failed ${failed}. Upserting...`);

  const BATCH = 100;
  for (let i = 0; i < rows.length; i += BATCH) {
    const batch = rows.slice(i, i + BATCH);
    const { error: upErr } = await supabase
      .from('starbucks_store_demographics')
      .upsert(batch, { onConflict: 'store_number' });
    if (upErr) { console.error(`Upsert failed at batch ${i}:`, upErr.message); process.exit(1); }
  }

  console.log(`Done. ${rows.length} rows upserted, ${failed} failed.`);

  // Show a sample for verification
  if (rows.length > 0) {
    const sample = rows[0];
    console.log('\nSample row:');
    console.log(JSON.stringify(
      Object.fromEntries(['store_number', ...DEMO_COLUMNS].map(c => [c, sample[c]])),
      null, 2
    ));
  }
}

main().catch(err => { console.error(err); process.exit(1); });
